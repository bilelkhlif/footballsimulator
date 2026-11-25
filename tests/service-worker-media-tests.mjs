/**
 * Lecture d'une petite vidéo synthétique sous le contrôle du vrai sw.mjs, à la racine et sous
 * /footballsimulator/. Le serveur répond réellement 206 ; aucun routage Playwright ne le remplace.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import assert from 'node:assert/strict';

/** Vidéo générée sans images réelles ni modèle ; provenance dans tests/fixtures/README.md. */
const VIDEO = 'tests/fixtures/synthetic-range.mp4';

/**
 * Vérifie une réponse partielle puis la lecture et trois recherches dans la vidéo contrôlée.
 * @param {import('playwright-core').Browser} browser
 * @param {{root: string, subPath: string}} urls
 * @param {(name: string, status: string, detail?: string) => void} record
 * @returns {Promise<void>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout — vidéo sous contrôle du Service Worker
 */
export async function runServiceWorkerMediaTests(browser, urls, record) {
  for (const [scope, url] of Object.entries(urls)) {
    const label = `PWA vidéo (${scope === 'root' ? 'racine' : 'sous-chemin'})`;
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(url);
      await page.waitForFunction(() => document.body.classList.contains('is-ready')
        && navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.mjs'), null, { timeout: 30000 });
      try {
        const partial = await page.evaluate(async (file) => {
          const response = await fetch(new URL(file, document.baseURI), { headers: { Range: 'bytes=10-1033' } });
          return { status: response.status, range: response.headers.get('Content-Range'),
            bytes: (await response.arrayBuffer()).byteLength };
        }, VIDEO);
        assert.equal(partial.status, 206);
        assert.match(partial.range, /^bytes 10-1033\/\d+$/);
        assert.equal(partial.bytes, 1024);
        record(`${label} : Range 206 transmis intact`, 'ok', `${partial.range}, ${partial.bytes} octets`);
      } catch (error) {
        record(`${label} : Range 206 transmis intact`, 'échec', error.message);
      }

      const mediaResponses = [];
      page.on('response', (response) => {
        if (response.url().endsWith(VIDEO)) mediaResponses.push(response.status());
      });
      const playback = await page.evaluate(async (file) => {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        document.body.append(video);
        const waitFor = (type, action) => new Promise((resolve, reject) => {
          const success = () => finish();
          const failure = () => finish(new Error(`erreur vidéo ${video.error?.code}`));
          const timer = setTimeout(() => finish(new Error(`${type} : délai dépassé`)), 10000);
          function finish(error) {
            clearTimeout(timer);
            video.removeEventListener(type, success);
            video.removeEventListener('error', failure);
            if (error) reject(error); else resolve();
          }
          video.addEventListener(type, success, { once: true });
          video.addEventListener('error', failure, { once: true });
          action?.();
        });
        try {
          await waitFor('loadedmetadata', () => { video.src = new URL(file, document.baseURI).href; });
          await video.play();
          await waitFor('timeupdate');
          video.pause();
          const playedTo = video.currentTime;
          const seeks = [];
          for (const target of [6, 1, 4]) {
            await waitFor('seeked', () => { video.currentTime = target; });
            seeks.push({ target, actual: video.currentTime, readyState: video.readyState });
          }
          const cached = [];
          for (const name of await caches.keys()) {
            const cache = await caches.open(name);
            cached.push(...(await cache.keys()).filter((request) => request.url === video.src));
          }
          return { playedTo, seeks, duration: video.duration, error: video.error?.code ?? null,
            controlled: !!navigator.serviceWorker.controller, cached: cached.length };
        } finally {
          video.pause();
          video.removeAttribute('src');
          video.load();
          video.remove();
        }
      }, VIDEO);
      assert.equal(playback.controlled, true);
      assert.equal(playback.error, null);
      assert.ok(playback.duration >= 7.9 && playback.playedTo > 0);
      assert.ok(playback.seeks.every(({ target, actual, readyState }) => Math.abs(target - actual) < 0.1 && readyState >= 2));
      assert.ok(mediaResponses.includes(206), `réponses vidéo : ${mediaResponses}`);
      assert.equal(playback.cached, 0);
      record(`${label} : lecture et recherches avant/arrière sans cache partiel`, 'ok',
        `lecture ${playback.playedTo.toFixed(2)} s ; recherches 6 → 1 → 4 s ; HTTP 206 ; aucun cache vidéo`);
    } catch (error) {
      record(`${label} : parcours vidéo`, 'échec', error.message);
    } finally {
      await context.close();
    }
  }
}
