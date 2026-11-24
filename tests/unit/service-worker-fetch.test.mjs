/**
 * Régressions du Service Worker : réponses partielles et cache facultatif hors coquille.
 * Les événements fetch exécutent le vrai sw.mjs dans un contexte isolé.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

/** Source du worker, sans réécriture des fonctions testées. */
const WORKER = readFileSync(new URL('../../sw.mjs', import.meta.url), 'utf8');

/**
 * Exécute un événement fetch avec les interfaces réseau/cache du navigateur remplacées.
 * @param {{pathname?: string, headers?: object, status?: number, cached?: boolean,
 *   writeError?: boolean, openError?: boolean, lookupError?: boolean}} [options]
 * @returns {{response: Promise<Response>|undefined, finished: Promise<unknown>, calls: object}}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests unitaires — traitement des requêtes par le Service Worker
 */
function dispatchFetch({ pathname = 'video.mp4', headers = {}, status = 200, cached = false,
  writeError = false, openError = false, lookupError = false } = {}) {
  const handlers = new Map();
  const calls = { fetch: 0, open: 0, put: 0, match: 0 };
  const pending = [];
  let response;
  const old = () => cached ? new Response('ancienne copie') : undefined;
  const cache = {
    match: async () => old(),
    put: async () => {
      calls.put += 1;
      if (writeError) throw new Error('quota dépassé');
    },
  };
  runInNewContext(WORKER, {
    URL, Request, Response, setTimeout, clearTimeout,
    self: { location: new URL('https://example.test/footballsimulator/sw.mjs'),
      addEventListener: (type, handler) => handlers.set(type, handler) },
    fetch: async () => { calls.fetch += 1; return new Response('réponse réseau', { status }); },
    caches: {
      open: async () => {
        calls.open += 1;
        if (openError) throw new Error('cache indisponible');
        return cache;
      },
      match: async () => {
        calls.match += 1;
        if (lookupError) throw new Error('lecture du cache impossible');
        return old();
      },
    },
  });
  handlers.get('fetch')({
    request: new Request(`https://example.test/footballsimulator/${pathname}`, { headers }),
    respondWith: (value) => { response = value; },
    waitUntil: (value) => pending.push(value),
  });
  return { response, finished: Promise.all(pending), calls };
}

test('Range : le navigateur garde la main, même pour une adresse de la coquille', async () => {
  for (const pathname of ['video.mp4', 'index.html']) {
    const result = dispatchFetch({ pathname, headers: { Range: 'bytes=10-19' }, cached: true });
    assert.equal(result.response, undefined, `${pathname} : aucune réponse complète substituée à la plage demandée`);
    await result.finished;
    assert.deepEqual(result.calls, { fetch: 0, open: 0, put: 0, match: 0 });
  }
});

test('une réponse 206 sans en-tête Range est transmise sans tentative de mise en cache', async () => {
  const result = dispatchFetch({ status: 206 });
  const response = await result.response;
  await result.finished;
  assert.equal(response.status, 206);
  assert.equal(await response.text(), 'réponse réseau');
  assert.equal(result.calls.open, 0);
  assert.equal(result.calls.put, 0);
});

test('un quota dépassé ne remplace pas une réponse réseau valide par une ancienne copie', async () => {
  const result = dispatchFetch({ cached: true, writeError: true });
  assert.equal(await (await result.response).text(), 'réponse réseau');
  await result.finished;
  assert.equal(result.calls.put, 1);
});

test('un cache impossible à ouvrir ne fait pas échouer une réponse réseau valide sans repli', async () => {
  const result = dispatchFetch({ openError: true });
  assert.equal(await (await result.response).text(), 'réponse réseau');
  await result.finished;
  assert.equal(result.calls.open, 1);
});

test('un cache illisible ne masque pas une réponse réseau valide', async () => {
  const result = dispatchFetch({ lookupError: true });
  assert.equal(await (await result.response).text(), 'réponse réseau');
  await result.finished;
  assert.equal(result.calls.match, 1);
});

test('une réponse complète reste mise en cache pour les visites hors-ligne', async () => {
  const result = dispatchFetch();
  assert.equal(await (await result.response).text(), 'réponse réseau');
  await result.finished;
  assert.equal(result.calls.put, 1);
});
