/**
 * Tests unitaires du visualiseur de match : synchronisation et interpolation des données de suivi,
 * mesures tactiques, placement automatique, panneau, annotations, mise en forme et client de l'API.
 *
 * Les documents de suivi sont construits à la main : ce sont des données de test, pas des résultats
 * d'analyse.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceCovered, formatSpeed, teamCentroids, velocityAt } from '../../src/visualizer/analytics.js';
import { getHealth, listAnalyses, waitForAnalysis } from '../../src/visualizer/api-client.js';
import { applyHomography, AutoPlacer, candidateRects, overlapArea, pitchCoverage, scoreRegions } from '../../src/visualizer/auto-placement.js';
import { describeCalibration, formatShare, formatTime } from '../../src/visualizer/format.js';
import { clampRect } from '../../src/visualizer/overlay-frame.js';
import { pitchToScene, poolKey } from '../../src/visualizer/overlay-pitch.js';
import { TrackingStore } from '../../src/visualizer/tracking-store.js';
import { annotationColor, boxToDisplay, containRect, VideoAnnotations } from '../../src/visualizer/video-annotations.js';
import { PITCH_SCALE } from '../../src/config.js';

const CALIBRATED = { status: 'ok', keypoints: 9, inliers: 8, errorPx: 2.4, errorM: 0.31, homography: [1, 0, 0, 0, 1, 0, 0, 0, 1] };

/**
 * Personne de test : boîte et position proportionnelles à x.
 * @param {number} id
 * @param {number} x
 * @param {object} [extra]
 * @returns {object}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Tests unitaires du visualiseur de match — données de test
 */
function person(id, x, extra = {}) {
  return { id, role: 'player', confidence: 0.9, box: [x, 100, x + 20, 160], pitch: [x / 10, 0], pitchStatus: 'ok', team: 0, teamConfidence: 1, ...extra };
}

/**
 * Document de test : une vidéo à 25 images/s analysée une image sur deux.
 * @param {object[]} frames
 * @returns {object}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Tests unitaires du visualiseur de match — données de test
 */
function documentWith(frames) {
  return {
    format: 'football-tracking', version: 1,
    source: { name: 'test.mp4', width: 1920, height: 1080, fps: 25 },
    analysis: { stride: 2, fps: 12.5 }, pitch: { length: 105, width: 68 },
    frames, teams: [{ id: 0, color: '#ff0000' }, { id: 1, color: '#0000ff' }], tracks: [{ id: 1, firstTime: 0, lastTime: 0.24 }],
    metrics: null, limitations: ['test'],
  };
}

/**
 * Image analysée de test.
 * @param {number} index numéro de l'image source
 * @param {object[]} objects
 * @param {object} [extra]
 * @returns {object}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Tests unitaires du visualiseur de match — données de test
 */
function frameAt(index, objects, extra = {}) {
  return { index, time: index / 25, shot: 0, cut: false, calibration: CALIBRATED, objects, ball: null, ...extra };
}

test('le magasin refuse un format inconnu et trouve l\'image analysée de chaque instant', () => {
  assert.throws(() => new TrackingStore({ format: 'autre', version: 1 }), /Format de suivi inattendu/);
  const store = TrackingStore.fromDocument(documentWith([frameAt(0, []), frameAt(2, []), frameAt(4, [])]));
  assert.equal(store.interval, 0.08);
  assert.equal(store.indexAt(-0.01), -1);
  assert.equal(store.indexAt(0.08), 1);
  assert.equal(store.indexAt(0.159), 1);
  assert.equal(store.nearestFrame(0.11).index, 2);
  assert.equal(store.nearestFrame(0.13).index, 4);
  assert.equal(store.nearestFrame(0.5), null, 'au-delà d\'un intervalle : aucune image');
  assert.deepEqual(store.limitations, ['test']);
});

test('l\'interpolation relie deux analyses consécutives d\'un même joueur, et seulement elles', () => {
  const store = TrackingStore.fromDocument(documentWith([
    frameAt(0, [person(1, 100), person(2, 500)]),
    frameAt(2, [person(1, 120)]),
  ]));
  const middle = store.sample(0.04);
  assert.equal(middle.interpolated, true);
  const one = middle.objects.find((object) => object.id === 1);
  assert.deepEqual(one.box, [110, 100, 130, 160]);
  assert.deepEqual(one.pitch, [11, 0]);
  const quarter = store.sample(0.02).objects.find((object) => object.id === 1);
  assert.deepEqual(quarter.box, [105, 100, 125, 160], 'interpolation linéaire, pas au plus proche');
  const two = middle.objects.find((object) => object.id === 2);
  assert.deepEqual(two?.box ?? null, [500, 100, 520, 160], 'absent de l\'image suivante : pas de position inventée');
});

test('aucune interpolation à travers une coupure de plan ni une analyse manquante', () => {
  const cut = TrackingStore.fromDocument(documentWith([
    frameAt(0, [person(1, 100)]),
    frameAt(2, [person(1, 600)], { shot: 1, cut: true }),
  ]));
  const before = cut.sample(0.03);
  assert.equal(before.interpolated, false);
  assert.deepEqual(before.objects[0].box, [100, 100, 120, 160]);
  const gap = TrackingStore.fromDocument(documentWith([frameAt(0, [person(1, 100)]), frameAt(6, [person(1, 160)])]));
  assert.equal(gap.sample(0.12).interpolated, false);
});

test('sans calibration, une position absente reste absente', () => {
  const store = TrackingStore.fromDocument(documentWith([
    frameAt(0, [person(1, 100, { pitch: null, pitchStatus: 'no-calibration' })], { calibration: { status: 'failed', reason: 'too-few-keypoints', keypoints: 2 } }),
    frameAt(2, [person(1, 120)]),
  ]));
  const sample = store.sample(0.02);
  assert.equal(sample.objects[0].pitch, null);
  assert.deepEqual(store.history(1, 0, 1).map((point) => point.time), [0.08]);
});

test('un flux en direct se lit comme un fichier, même avec un message en retard', () => {
  const store = new TrackingStore(documentWith([]));
  store.ingest({ type: 'frame', ...frameAt(4, [person(1, 140)]) });
  store.ingest({ type: 'frame', ...frameAt(0, [person(1, 100)]) });
  store.ingest({ type: 'frame', ...frameAt(2, [person(1, 120)]) });
  store.ingest({ type: 'summary', teams: [{ id: 1, color: '#00ff00' }], tracks: [], metrics: { ok: 1 }, limitations: [] });
  assert.deepEqual(store.frames.map((frame) => frame.index), [0, 2, 4]);
  assert.equal(store.teamColor(1), '#00ff00');
  assert.equal(store.histories(0, 1).get(1).length, 3);
});

test('mesures tactiques : vitesse, distance sans combler les trous, centres d\'équipe', () => {
  const history = [0, 0.5, 1].map((time) => ({ time, pitch: [time * 6, 0] }));
  assert.equal(velocityAt(history, 1).speed, 6);
  assert.equal(velocityAt(history.slice(0, 1), 1), null);
  const withGap = [...history, { time: 3, pitch: [50, 0] }];
  assert.equal(distanceCovered(withGap), 6);
  const centroids = teamCentroids([person(1, 0), person(2, 30), person(3, 60), person(4, 90, { team: 1 }), person(5, 0, { pitch: null })]);
  assert.deepEqual([...centroids.keys()], [0]);
  assert.deepEqual(centroids.get(0), [3, 0]);
  assert.equal(formatSpeed(5), '18,0 km/h');
  assert.equal(formatSpeed(null), '—');
});

test('placement automatique : la zone vide l\'emporte, sans sautiller', () => {
  const area = { width: 1000, height: 560 };
  const candidates = candidateRects(area, { width: 300, height: 180 }, 10);
  assert.equal(candidates.length, 8);
  assert.deepEqual(candidates[0], { x: 10, y: 10, width: 300, height: 180 });
  assert.deepEqual(candidates[7], { x: 690, y: 370, width: 300, height: 180 });
  assert.equal(overlapArea({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }), 25);

  const crowdedTopLeft = [{ x: 40, y: 40, width: 30, height: 60, weight: 1 }, { x: 120, y: 60, width: 30, height: 60, weight: 1 }];
  const scores = scoreRegions(candidates, crowdedTopLeft, null);
  assert.equal(scores[0], 2);
  assert.equal(scores[7], 0);

  const placer = new AutoPlacer({ holdSeconds: 3 });
  assert.equal(placer.choose(scores, 0), 1, 'premier choix : la première zone vide');
  const later = [2, 0.2, 1, 1, 1, 1, 1, 0];
  assert.equal(placer.choose(later, 0.5), 1, 'gain trop faible : on reste');
  later[1] = 2;
  assert.equal(placer.choose(later, 1), 1, 'gain net, mais trop tôt après le dernier déplacement');
  assert.equal(placer.choose(later, 2), 1);
  assert.equal(placer.choose(later, 3), 7, 'gain net, délai écoulé : déplacement');
  assert.equal(placer.choose(scores, 40), 1, 'saut dans la vidéo : choix immédiat');
});

test('placement automatique : mieux vaut cacher les tribunes que la pelouse', () => {
  const area = { width: 1000, height: 560 };
  const candidates = candidateRects(area, { width: 300, height: 180 }, 10);
  const lowerHalfIsPitch = (x, y) => y > 280;
  const scores = scoreRegions(candidates, [], lowerHalfIsPitch);
  assert.ok(scores[0] < scores[7]);
  assert.equal(pitchCoverage({ x: 0, y: 300, width: 100, height: 100 }, lowerHalfIsPitch), 1);
  assert.deepEqual(applyHomography([2, 0, 1, 0, 2, 0, 0, 0, 1], 3, 4), [7, 8]);
  assert.equal(applyHomography([1, 0, 0, 0, 1, 0, 0, 0, 0], 3, 4), null);
});

test('le panneau reste dans l\'image de la vidéo, à une taille raisonnable', () => {
  const area = { x: 0, y: 70, width: 1000, height: 560 };
  assert.deepEqual(clampRect({ x: 900, y: 0, width: 300, height: 180 }, area), { x: 700, y: 70, width: 300, height: 180 });
  assert.deepEqual(clampRect({ x: 10, y: 100, width: 20, height: 20 }, area), { x: 10, y: 100, width: 200, height: 140 });
  assert.deepEqual(clampRect({ x: 0, y: 0, width: 5000, height: 5000 }, area), area);
});

test('annotations : image en object-fit contain, boîtes mises à l\'échelle, sélection au clic', () => {
  const content = containRect({ width: 1000, height: 1000 }, { width: 1920, height: 1080 });
  for (const [key, value] of Object.entries({ x: 0, y: 218.75, width: 1000, height: 562.5 })) {
    assert.ok(Math.abs(content[key] - value) < 1e-9, key);
  }
  const display = boxToDisplay([192, 108, 384, 216], { x: 0, y: 218.75, width: 1000, height: 562.5 }, { width: 1920, height: 1080 });
  for (const [key, value] of Object.entries({ x: 100, y: 275, width: 100, height: 56.25 })) {
    assert.ok(Math.abs(display[key] - value) < 1e-9, key);
  }
  assert.equal(annotationColor({ role: 'referee', team: null }, () => '#f00'), '#202327');
  assert.equal(annotationColor({ role: 'player', team: 1 }, () => '#f00'), '#f00');
  assert.equal(annotationColor({ role: 'player', team: null }, () => '#f00'), '#9aa0a6');

  const annotations = Object.create(VideoAnnotations.prototype);
  annotations.drawn = [{ id: 4, rect: { x: 0, y: 0, width: 100, height: 100 } }, { id: 9, rect: { x: 40, y: 40, width: 20, height: 30 } }];
  assert.equal(annotations.pick(50, 50), 9, 'la plus petite boîte sous le pointeur');
  assert.equal(annotations.pick(10, 10), 4);
  assert.equal(annotations.pick(500, 500), null);
});

test('le terrain 3D convertit les positions à l\'échelle de la maquette et range les pions par groupe', () => {
  const point = pitchToScene([52.5, -34]);
  assert.ok(Math.abs(point.x - 52.5 * PITCH_SCALE) < 1e-12 && Math.abs(point.z + 34 * PITCH_SCALE) < 1e-12 && point.y === 0);
  assert.equal(poolKey({ role: 'referee', team: null }), 'referee');
  assert.equal(poolKey({ role: 'goalkeeper', team: 1 }), '1');
  assert.equal(poolKey({ role: 'player', team: null }), 'unknown');
});

test('mise en forme : durées, parts et calibration en clair', () => {
  assert.equal(formatTime(75.25), '1:15,3');
  assert.equal(formatTime(4), '0:04,0');
  assert.equal(formatShare(0.456), '46 %');
  assert.match(describeCalibration(CALIBRATED), /8 repères cohérents sur 9/);
  assert.match(describeCalibration({ status: 'failed', reason: 'aligned-keypoints' }), /une seule ligne visible/);
  assert.match(describeCalibration(null), /Aucune image analysée/);
});

test('client de l\'API : serveur absent, erreurs lisibles, attente de la fin d\'une analyse', async () => {
  assert.equal(await getHealth(async () => { throw new TypeError('réseau'); }), null);
  const failing = async () => ({ ok: false, status: 409, json: async () => ({ error: 'Analyse pas encore terminée.' }) });
  await assert.rejects(listAnalyses(failing), /pas encore terminée/);
  const states = ['queued', 'running', 'done'];
  const seen = [];
  const fetcher = async () => ({ ok: true, status: 200, json: async () => ({ status: states.shift() }) });
  const final = await waitForAnalysis('20261117-120000-abcdef', (status) => seen.push(status.status), { fetcher, interval: 1 });
  assert.equal(final.status, 'done');
  assert.deepEqual(seen, ['queued', 'running', 'done']);
});
