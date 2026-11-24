/**
 * Tests des deux sources du visualiseur : démonstration statique (sur l'export réel de demo/) et
 * serveur local. Ils vérifient la lecture par fenêtres sans serveur, la mémoire bornée, le refus des
 * exports abîmés ou sortant de leur dossier, et l'adresse des requêtes vers un serveur local.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StaticAnalysisSource, StaticDataError, catalogProblems, isRelativeFile, manifestProblems }
  from '../../src/visualizer/static-source.mjs';
import { DEFAULT_SERVER_URL, LocalAnalysisSource, normaliseServerUrl } from '../../src/visualizer/local-source.mjs';
import { PagedTrackingStore } from '../../src/visualizer/paged-tracking-store.mjs';
import { describeCalibration, describeIdentityCheck } from '../../src/visualizer/format.js';

/** Adresse fictive du site ; les fichiers viennent du dossier demo/ du dépôt. */
const SITE = 'https://exemple.test/footballsimulator/';
const DEMO = new URL('../../demo/', import.meta.url);

/**
 * Faux fetch qui sert les fichiers du dépôt sous SITE, avec des modifications choisies par le test.
 * @param {{alter?: (path: string, bytes: Buffer) => Buffer|null, log?: string[]}} [options]
 * @returns {(url: string) => Promise<Response>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests du visualiseur — sources de données
 */
function siteFetcher({ alter = (_path, bytes) => bytes, log = [] } = {}) {
  return async (url) => {
    const path = url.slice(`${SITE}demo/`.length);
    log.push(path);
    let bytes;
    try {
      bytes = readFileSync(fileURLToPath(new URL(path, DEMO)));
    } catch {
      return new Response('introuvable', { status: 404 });
    }
    const body = alter(path, bytes);
    return body === null ? new Response('introuvable', { status: 404 }) : new Response(body, { status: 200 });
  };
}

/**
 * Source de démonstration sur le dépôt réel.
 * @param {object} [options]
 * @returns {StaticAnalysisSource}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests du visualiseur — sources de données
 */
function demoSource(options = {}) {
  return new StaticAnalysisSource(`${SITE}demo/index.json`, { fetcher: siteFetcher(options), cacheSize: options.cacheSize });
}

test('démonstration : catalogue, manifeste au format du suivi, vidéo et affiche relatives', async () => {
  const source = demoSource();
  const [demo] = await source.listAnalyses();
  assert.equal(demo.id, 'match-synthetique');
  assert.equal(demo.status, 'done');
  const manifest = await source.getTrackingManifest(demo.id);
  assert.equal(manifest.format, 'football-tracking');
  assert.equal(manifest.exportFormat, 'football-tracking-static');
  assert.equal(manifest.complete, true);
  assert.equal(manifest.provenance.kind, 'synthetic');
  assert.equal(source.videoUrl(demo.id), `${SITE}demo/matches/match-synthetique/video.mp4`);
  assert.equal(source.posterUrl(demo.id), `${SITE}demo/matches/match-synthetique/poster.jpg`);
  assert.equal(source.videoCrossOrigin(), null);
});

test('démonstration : fenêtre comme l\'API locale, voisines comprises, trajectoires présentes et sélection', async () => {
  const source = demoSource();
  const window = await source.getTrackingWindow('match-synthetique', 9.5, 21.5, { selectedId: 1 });
  const times = window.frames.map((frame) => frame.time);
  assert.ok(times[0] < 9.5 && times.at(-1) > 21.5, 'une image voisine de chaque côté pour l\'interpolation');
  assert.ok(times.slice(1, -1).every((time) => time >= 9.5 && time <= 21.5));
  assert.ok(times.every((time, index) => index === 0 || time > times[index - 1]), 'instants croissants à travers les segments');
  const ids = new Set(window.frames.flatMap((frame) => frame.objects.map((object) => object.id)));
  assert.ok(window.tracks.every((track) => ids.has(track.id) || track.id === 1));
  assert.ok(window.tracks.some((track) => track.id === 1), 'la sélection a son résumé même hors de la fenêtre');
  await assert.rejects(source.getTrackingWindow('match-synthetique', 0, 31), StaticDataError);
});

test('démonstration : mémoire bornée, segments réutilisés, voisin chargé seulement s’il le faut', async () => {
  const log = [];
  const source = new StaticAnalysisSource(`${SITE}demo/index.json`, { fetcher: siteFetcher({ log }), cacheSize: 2 });
  const chunkLoads = () => log.filter((path) => path.includes('chunks/'));
  await source.getTrackingWindow('match-synthetique', 0, 12);
  assert.deepEqual(chunkLoads(), ['matches/match-synthetique/chunks/00000.json', 'matches/match-synthetique/chunks/00001.json'],
    'l’image suivant 12 s est déjà dans le segment 10–20 s');
  await source.getTrackingWindow('match-synthetique', 0, 12);
  assert.equal(chunkLoads().length, 2, 'fenêtre identique servie par le cache');
  const late = await source.getTrackingWindow('match-synthetique', 20, 32);
  assert.ok(late.frames[0].time < 20, 'segment précédent chargé pour l’image voisine');
  assert.ok(source.chunks.size <= 2, 'au plus deux segments décodés en mémoire');
  await source.getTrackingWindow('match-synthetique', 0, 12);
  assert.ok(chunkLoads().length > 4, 'segments évincés relus');
});

test('démonstration : le contact scénarisé arrive au visualiseur sans équipe ni vitesse affirmées', async () => {
  const source = demoSource();
  const manifest = await source.getTrackingManifest('match-synthetique');
  const store = new PagedTrackingStore(manifest, (from, to, options) => source.getTrackingWindow('match-synthetique', from, to, options));
  const [contact] = manifest.metrics.identity.scriptedContacts;
  await store.ensureTime(contact.start + 0.4);
  const sample = store.sample(contact.start + 0.4);
  const uncertain = sample.objects.filter((object) => object.identity === 'uncertain');
  assert.ok(uncertain.length >= 1);
  assert.ok(uncertain.every((object) => object.team === null && contact.tracks.includes(object.id)));
  assert.match(describeIdentityCheck(manifest.metrics.identity), /synthétiques.*scénarisé.*aucun contrôle par l'IA/);
  assert.match(describeCalibration(sample.frame.calibration), /exacte par construction/);
});

test('démonstration : fichier abîmé, manquant ou hors du dossier refusé avec un message lisible', async () => {
  const tampered = demoSource({ alter: (path, bytes) => (path.endsWith('00001.json') ? Buffer.from(bytes.toString().replace('"time":10.0', '"time":10.04')) : bytes) });
  await assert.rejects(tampered.getTrackingWindow('match-synthetique', 9, 12), /abîmé.*empreinte/);
  const missing = demoSource({ alter: (path, bytes) => (path.endsWith('tracks.json') ? null : bytes) });
  await assert.rejects(missing.getTrackingWindow('match-synthetique', 0, 5), /manquant/);
  const escaping = demoSource({ alter: (path, bytes) => (path === 'index.json'
    ? Buffer.from(bytes.toString().replace('"matches/match-synthetique/"', '"../secret/"')) : bytes) });
  await assert.rejects(escaping.listAnalyses(), /Catalogue de démonstration invalide/);
  const wrongFormat = demoSource({ alter: (path, bytes) => (path.endsWith('manifest.json')
    ? Buffer.from(bytes.toString().replace('football-tracking-static', 'autre-format')) : bytes) });
  await assert.rejects(wrongFormat.getTrackingManifest('match-synthetique'), /Export de démonstration invalide/);
});

test('démonstration : contrôles des adresses, du catalogue et du manifeste', () => {
  for (const ok of ['chunks/00000.json', 'video.mp4', 'matches/match-synthetique/']) {
    assert.equal(isRelativeFile(ok), true, ok);
  }
  for (const bad of ['../x', 'a/../../b', '/etc/passwd', 'C:/Users/x', 'C:\\x', 'https://autre.test/x', 'file:///x', './x', '']) {
    assert.equal(isRelativeFile(bad), false, bad);
  }
  assert.deepEqual(catalogProblems(JSON.parse(readFileSync(new URL('index.json', DEMO), 'utf8'))), []);
  const manifest = JSON.parse(readFileSync(new URL('matches/match-synthetique/manifest.json', DEMO), 'utf8'));
  assert.deepEqual(manifestProblems(manifest), []);
  assert.match(manifestProblems({ ...manifest, complete: false }).join(), /incomplète/);
});

test('serveur local : seules les adresses de la boucle locale sont acceptées', () => {
  assert.equal(normaliseServerUrl('http://127.0.0.1:8765'), 'http://127.0.0.1:8765/');
  assert.equal(normaliseServerUrl(' http://localhost:9000/visualizer.html '), 'http://localhost:9000/');
  assert.equal(normaliseServerUrl('http://[::1]:8765'), 'http://[::1]:8765/');
  for (const bad of ['http://192.168.1.10:8765', 'https://exemple.test', 'ftp://127.0.0.1', 'http://user:pw@127.0.0.1:8765', 'nimporte']) {
    assert.equal(normaliseServerUrl(bad), null, bad);
  }
  assert.equal(DEFAULT_SERVER_URL, 'http://127.0.0.1:8765/');
});

test('serveur local : requêtes vers le serveur choisi, en CORS seulement s\'il est une autre origine', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, mode: init?.mode, method: init?.method });
    return new Response(JSON.stringify({ ok: true, device: 'cpu' }), { status: 200 });
  };
  const remote = new LocalAnalysisSource('http://127.0.0.1:8765/', { fetcher, pageOrigin: 'https://bilelkhlif.github.io' });
  assert.deepEqual(await remote.getHealth(), { ok: true, device: 'cpu' });
  await remote.interruptAnalysis('20261124-000000-abcdef');
  assert.deepEqual(calls, [
    { url: 'http://127.0.0.1:8765/api/health', mode: 'cors', method: undefined },
    { url: 'http://127.0.0.1:8765/api/analyses/20261124-000000-abcdef/interrupt', mode: 'cors', method: 'POST' },
  ]);
  assert.equal(remote.videoUrl('a b'), 'http://127.0.0.1:8765/api/analyses/a%20b/video');
  assert.equal(remote.videoCrossOrigin(), 'anonymous');
  const same = new LocalAnalysisSource('http://127.0.0.1:8765/', { fetcher, pageOrigin: 'http://127.0.0.1:8765' });
  assert.equal(same.videoCrossOrigin(), null);
  const unreachable = new LocalAnalysisSource('http://127.0.0.1:1/', { fetcher: async () => { throw new TypeError('Failed to fetch'); } });
  assert.equal(await unreachable.getHealth(), null, 'serveur arrêté : état « indisponible », pas d\'exception');
});
