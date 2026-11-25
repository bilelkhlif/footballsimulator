/**
 * Tests de fenêtres horodatées : mémoire, déplacements concurrents, segments incomplets et erreurs réseau.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PagedTrackingStore } from '../../src/visualizer/paged-tracking-store.mjs';
import { TrackingStore } from '../../src/visualizer/tracking-store.mjs';
import { getTrackingManifest, getTrackingWindow, resumeAnalysis } from '../../src/visualizer/api-client.mjs';

/**
 * En-tête synthétique de quatre-vingt-dix minutes, sans données du match.
 * @param {object} [extra]
 * @returns {object}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests du visualiseur — fenêtres longues
 */
function manifest(extra = {}) {
  return { format: 'football-tracking', version: 1,
    source: { duration: 5400, fps: 25, width: 320, height: 180 }, analysis: { stride: 2 },
    pitch: { length: 105, width: 68 }, complete: true,
    storage: { availableUntil: 5399.92, revision: 1 }, ...extra };
}

/**
 * Génère seulement la fenêtre demandée, sans conserver les précédentes.
 * @param {number} from
 * @param {number} to
 * @returns {object}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests du visualiseur — suivi synthétique
 */
function windowData(from, to) {
  const frames = [];
  for (let index = Math.floor(from * 12.5); index <= Math.ceil(to * 12.5); index += 1) {
    frames.push({ index: index * 2, time: index / 12.5, shot: 0, cut: false,
      objects: [{ id: 1, role: 'player', pitch: [index / 100, 0], box: [0, 0, 10, 20],
        distanceM: index / 100, team: 0 }], ball: null });
  }
  return { from, to, frames, tracks: [{ id: 1, firstTime: 0, lastTime: 5399.92, team: 0, distanceM: 674.99 }] };
}

test('fenêtres : 100 déplacements sur 90 minutes gardent au plus 215 images et une trajectoire', async () => {
  const store = new PagedTrackingStore(manifest(), async (from, to) => windowData(from, to));
  for (let index = 0; index < 100; index += 1) {
    const time = (index * 43) % 5300;
    await store.ensureTime(time);
    assert.ok(store.frames.length <= 215);
    assert.equal(store.tracks.size, 1);
    assert.ok(store.sample(time).frame);
  }
  assert.ok(store.window.from > 4000);
  store.dispose();
  assert.equal(store.frames.length, 0);
});

test('fenêtres : une réponse tardive ne remplace jamais la dernière recherche', async () => {
  const requests = [];
  const store = new PagedTrackingStore(manifest(), (from, to, options) => new Promise((resolve) => {
    requests.push({ from, to, options, resolve });
  }));
  const old = store.ensureTime(2);
  await Promise.resolve();
  const recent = store.ensureTime(2000);
  await Promise.resolve();
  assert.equal(requests[0].options.signal.aborted, true);
  requests[1].resolve(windowData(requests[1].from, requests[1].to));
  await recent;
  requests[0].resolve(windowData(requests[0].from, requests[0].to));
  assert.equal(await old, false);
  assert.ok(store.window.from > 1900);
  assert.equal(store.sample(2).frame, null);
});

test('fenêtres : interpolation et coupures identiques au document historique', async () => {
  const document = JSON.parse(readFileSync(new URL('../fixtures/visualizer/match-synthetique.tracking.json', import.meta.url)));
  const reference = TrackingStore.fromDocument(document);
  const store = new PagedTrackingStore({ ...document, frames: undefined, complete: true,
    storage: { availableUntil: document.frames.at(-1).time, revision: 1 } }, async (from, to) => {
    const frames = document.frames.filter((frame) => frame.time >= from - .1 && frame.time <= to + .1);
    return { frames, tracks: document.tracks };
  });
  for (const time of [0, .04, 1.99, 2, 2.01, 3.6]) {
    await store.ensureTime(time);
    assert.deepEqual(store.sample(time), reference.sample(time));
  }
});

test('fenêtres : une analyse incomplète refuse le futur puis recharge les segments publiés', async () => {
  let requests = 0;
  const partial = manifest({ complete: false, storage: { availableUntil: 10, revision: 1 } });
  const store = new PagedTrackingStore(partial, async (from, to) => {
    requests += 1;
    return windowData(from, to);
  });
  await store.ensureTime(8);
  assert.equal(store.window.to, 10);
  assert.equal(await store.ensureTime(1000), false);
  assert.equal(store.sample(1000).frame, null);
  assert.equal(requests, 1);
  store.updateManifest({ ...partial, storage: { availableUntil: 20, revision: 2 } });
  await store.ensureTime(15);
  assert.ok(store.sample(15).frame);
  assert.equal(requests, 2);
});

test('fenêtres : les erreurs réseau préservent la fenêtre et permettent un nouvel essai', async () => {
  let fail = false;
  const store = new PagedTrackingStore(manifest(), async (from, to) => {
    if (fail) {
      throw new Error('réseau interrompu');
    }
    return windowData(from, to);
  });
  await store.ensureTime(0);
  fail = true;
  await assert.rejects(store.ensureTime(200), /réseau interrompu/);
  assert.ok(store.sample(0).frame);
  assert.equal(store.sample(200).frame, null);
  fail = false;
  store.retryAfter = 0;
  await store.ensureTime(200);
  assert.ok(store.sample(200).frame);
});

test('fenêtres : la distance cumulée ne se limite pas à la fenêtre et ne lit pas le futur', async () => {
  const store = new PagedTrackingStore(manifest(), async (from, to) => windowData(from, to));
  await store.ensureTime(3000);
  assert.equal(store.distanceAt(1, 3000), 375);
  assert.equal(store.distanceAt(1, 0), null);
});

test('API : manifeste absent, intervalle, sélection et reprise explicite', async () => {
  assert.equal(await getTrackingManifest('ancien', async () => new Response('', { status: 404 })), null);
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  await getTrackingWindow('id', 1.2, 5.6, { selectedId: 7, fetcher });
  assert.match(calls[0].url, /from=1.2&to=5.6&selected=7/);
  await resumeAnalysis('id', fetcher);
  assert.equal(calls[1].options.method, 'POST');
});
