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
 * @param {{pathname?: string, headers?: object, responseHeaders?: object, status?: number, cached?: boolean,
 *   writeError?: boolean, openError?: boolean, lookupError?: boolean}} [options]
 * @returns {{response: Promise<Response>|undefined, finished: Promise<unknown>, calls: object}}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests unitaires — traitement des requêtes par le Service Worker
 */
function dispatchFetch({ pathname = 'extra.json', headers = {}, responseHeaders = {}, status = 200, cached = false,
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
    fetch: async () => { calls.fetch += 1; return new Response('réponse réseau', { status, headers: responseHeaders }); },
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

test('une vidéo complète sans Range contourne aussi le cache, même si une ancienne copie existe', async () => {
  const result = dispatchFetch({ pathname: 'video.mp4', cached: true });
  assert.equal(result.response, undefined);
  await result.finished;
  assert.deepEqual(result.calls, { fetch: 0, open: 0, put: 0, match: 0 });
});

test('une réponse no-store ou de type vidéo reste lisible sans être stockée', async () => {
  for (const responseHeaders of [{ 'Cache-Control': 'private, no-store' }, { 'Content-Type': 'video/mp4' }]) {
    const result = dispatchFetch({ responseHeaders });
    assert.equal(await (await result.response).text(), 'réponse réseau');
    await result.finished;
    assert.equal(result.calls.put, 0);
    assert.equal(result.calls.open, 0);
  }
});

/**
 * Navigation hors-ligne vers une page du dépôt : le vrai sw.mjs, un réseau coupé et un cache qui
 * ne contient que la coquille (le tableau tactique et la page hors-ligne de l'analyse de match).
 * @param {string} pathname page demandée, relative au dossier de l'application
 * @param {string[]} [extraCached] autres pages en cache (déjà visitées)
 * @param {{online?: boolean}} [options] online : le réseau répond, avec la page du serveur
 * @returns {Promise<string|null>} texte de la page servie, ou null
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests unitaires — repli hors-ligne des navigations
 */
async function navigateOffline(pathname, extraCached = [], { online = false } = {}) {
  const base = 'https://example.test/footballsimulator/';
  const pages = new Map([[`${base}index.html`, 'tableau tactique'], [`${base}visualiseur-hors-ligne.html`, 'analyse hors-ligne'],
    ...extraCached.map((page) => [`${base}${page}`, `copie de ${page}`])]);
  const handlers = new Map();
  const lookup = async (key, options) => {
    const url = new URL(typeof key === 'string' ? key : key.url, base);
    if (options?.ignoreSearch) url.search = '';
    return pages.has(url.href) ? new Response(pages.get(url.href)) : undefined;
  };
  runInNewContext(WORKER, {
    URL, Request, Response, setTimeout, clearTimeout,
    self: { location: new URL(`${base}sw.mjs`), addEventListener: (type, handler) => handlers.set(type, handler) },
    fetch: async (request) => {
      if (!online) throw new TypeError('réseau coupé');
      return new Response(`serveur : ${new URL(request.url).pathname}`);
    },
    caches: { open: async () => ({ match: lookup, put: async () => {} }), match: lookup },
  });
  let response;
  handlers.get('fetch')({
    request: { url: `${base}${pathname}`, method: 'GET', mode: 'navigate', destination: 'document', headers: new Headers() },
    respondWith: (value) => { response = value; },
    waitUntil: () => {},
  });
  const served = await response;
  return served ? served.text() : null;
}

test('hors-ligne : l\'analyse de match jamais ouverte sert sa page hors-ligne, pas le tableau tactique', async () => {
  assert.equal(await navigateOffline('visualizer.html'), 'analyse hors-ligne');
  assert.equal(await navigateOffline('visualizer.html?demo=france'), 'analyse hors-ligne', 'avec des paramètres aussi');
  assert.equal(await navigateOffline('visualizer.html', ['visualizer.html']), 'copie de visualizer.html', 'déjà visitée : sa copie');
  assert.equal(await navigateOffline('autre-page.html'), 'tableau tactique', 'les autres pages gardent le repli d\'avant');
  assert.equal(await navigateOffline('visualizer.html', [], { online: true }), 'serveur : /footballsimulator/visualizer.html',
    'en ligne : la vraie page, jamais la page hors-ligne');
});
