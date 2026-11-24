/**
 * Régressions du visualiseur : les réponses locales retardées ne doivent pas réactiver un mode
 * quitté ; fermer une analyse efface ses informations. Les changements de mode et les actions
 * Reprendre / Interrompre passent par les vrais boutons, avec une API locale simulée sans calcul.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Données synthétiques publiques déjà utilisées par la suite du visualiseur. */
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/visualizer/match-synthetique.tracking.json', import.meta.url), 'utf8'));
const LOCAL_VIDEO = readFileSync(new URL('./fixtures/visualizer/match-synthetique.webm', import.meta.url));
const DEMO_VIDEO = readFileSync(new URL('../demo/matches/match-synthetique/video.mp4', import.meta.url));

/**
 * Réponse gardée en attente jusqu'au changement de mode, puis libérée par le test.
 * @returns {{promise: Promise<void>, release: () => void}}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests du visualiseur — contrôle déterministe des réponses asynchrones
 */
function responseGate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

/**
 * Attend un signal émis par le gestionnaire de route, avec un délai borné et libéré.
 * @param {{promise: Promise<void>}} gate
 * @returns {Promise<void>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests du visualiseur — synchronisation des requêtes retenues
 */
async function waitForGate(gate) {
  let timer;
  try {
    await Promise.race([gate.promise, new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('La requête attendue n’a pas démarré.')), 12000);
    })]);
  } finally { clearTimeout(timer); }
}

/**
 * Sert les médias synthétiques en lecture partielle, comme sur GitHub Pages.
 * @param {import('playwright-core').Route} route
 * @param {Buffer} video
 * @param {string} type
 * @returns {Promise<void>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests du visualiseur — médias de test
 */
async function serveVideo(route, video, type) {
  const range = /bytes=(\d*)-(\d*)/.exec(route.request().headers().range ?? '');
  const start = range?.[1] ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), video.length - 1) : video.length - 1;
  await route.fulfill({ status: range ? 206 : 200, body: video.subarray(start, end + 1),
    headers: { 'content-type': type, 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${video.length}` } : {}) } });
}

/**
 * Attend la démonstration entièrement ouverte avant de libérer une ancienne réponse locale.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<void>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests du visualiseur — mode actif
 */
async function demoReady(page) {
  await page.waitForFunction(() => {
    const app = window.__matchVisualizer;
    return app?.mode === 'demo' && app.source?.kind === 'demo' && app.store?.window
      && document.getElementById('job-status').textContent.startsWith('Démonstration ouverte');
  }, null, { timeout: 20000 });
}

/**
 * État qui doit rester propre à la démonstration après une réponse dépassée.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<object>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests du visualiseur — isolation des modes
 */
function modeState(page) {
  return page.evaluate(() => ({ mode: window.__matchVisualizer.mode, source: window.__matchVisualizer.source?.kind,
    connection: window.__matchVisualizer.connection, analysis: window.__matchVisualizer.currentAnalysis,
    status: document.getElementById('job-status').textContent }));
}

/**
 * Quatre parcours ciblés : sonde de connexion, reprise, interruption et fermeture des panneaux.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url serveur statique du dépôt
 * @param {(name: string, status: string, detail?: string) => void} record
 * @returns {Promise<void>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests du visualiseur — régressions des opérations locales retardées
 */
export async function testVisualizerAsyncRegressions(browser, url, record) {
  /** Exécute chaque scénario dans un contexte neuf et conserve tous les résultats. */
  const check = async (name, action) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const gate = responseGate();
    try {
      await context.route('**/demo/matches/match-synthetique/video.mp4', (route) => serveVideo(route, DEMO_VIDEO, 'video/mp4'));
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      await action(page, context, gate);
      record(`Visualiseur, isolation : ${name}`, 'ok');
    } catch (error) { record(`Visualiseur, isolation : ${name}`, 'échec', error.message); }
    finally { gate.release(); await context.close(); }
  };

  await check('une sonde locale retardée ne remplace pas la source de la démonstration', async (page, context, gate) => {
    let probes = 0;
    let completed = false;
    const started = responseGate();
    await context.route('**/api/health', async (route) => {
      probes += 1;
      started.release();
      if (probes === 1) await gate.promise;
      await route.fulfill({ json: { ok: true, device: 'cpu', missingModels: [] } });
      completed = true;
    });
    await context.route('**/api/analyses', (route) => route.fulfill({ json: [] }));
    await page.goto(`${url}visualizer.html?mode=local`, { waitUntil: 'domcontentloaded' });
    await waitForGate(started);
    await page.waitForFunction(() => window.__matchVisualizer?.mode === 'local');
    assert.equal(probes, 1, 'la sonde est bien retenue avant le changement de mode');
    await page.locator('#mode-demo').click();
    await demoReady(page);
    const before = await modeState(page);
    gate.release();
    for (let attempt = 0; attempt < 100 && !completed; attempt += 1) await page.waitForTimeout(20);
    assert.equal(completed, true);
    await page.waitForTimeout(150);
    assert.deepEqual(await modeState(page), before);
  });

  for (const action of ['resume', 'interrupt']) {
    await check(`${action === 'resume' ? 'Reprendre' : 'Interrompre'} : une réponse tardive ne relance pas le suivi local en démo`, async (page, context, gate) => {
      const job = { id: 'audit-local', name: 'Vidéo synthétique', status: action === 'resume' ? 'interrupted' : 'running',
        resumable: action === 'resume', results: false, progress: { fraction: 0.4, message: 'Analyse locale simulée' } };
      let requested = false;
      let completed = false;
      let statusRequests = 0;
      await context.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/health')) await route.fulfill({ json: { ok: true, device: 'cpu', missingModels: [] } });
        else if (path.endsWith('/api/analyses')) await route.fulfill({ json: [job] });
        else if (path.endsWith(`/${action}`)) {
          requested = true;
          await gate.promise;
          job.status = action === 'resume' ? 'running' : 'interrupted';
          await route.fulfill({ status: 202, json: job });
          completed = true;
        } else if (path.endsWith('/manifest')) await route.fulfill({ status: 404, json: { error: 'Ancien format du jeu de test' } });
        else if (path.endsWith('/tracking')) await route.fulfill({ json: FIXTURE });
        else if (path.endsWith('/video')) await serveVideo(route, LOCAL_VIDEO, 'video/webm');
        else if (path.endsWith('/audit-local')) { statusRequests += 1; await route.fulfill({ json: job }); }
        else await route.fulfill({ status: 404, json: { error: 'Adresse inconnue' } });
      });
      await page.goto(`${url}visualizer.html?mode=local&analyse=audit-local`);
      await page.locator(`#${action}-analysis`).click();
      for (let attempt = 0; attempt < 100 && !requested; attempt += 1) await page.waitForTimeout(20);
      assert.equal(requested, true);
      await page.locator('#mode-demo').click();
      await demoReady(page);
      const before = await modeState(page);
      const requestsBeforeRelease = statusRequests;
      gate.release();
      for (let attempt = 0; attempt < 100 && !completed; attempt += 1) await page.waitForTimeout(20);
      assert.equal(completed, true);
      await page.waitForTimeout(1300);
      assert.deepEqual(await modeState(page), before);
      assert.equal(statusRequests, requestsBeforeRelease, 'aucune interrogation locale après le changement de mode');
    });
  }

  await check('fermer la démonstration efface le joueur, les mesures et les légendes précédents', async (page, context) => {
    await context.route('**/api/health', (route) => route.fulfill({ status: 503, json: { error: 'Serveur de test arrêté' } }));
    await page.goto(`${url}visualizer.html?mode=demo`);
    await demoReady(page);
    const target = await page.evaluate(() => {
      const app = window.__matchVisualizer;
      const object = app.store.sample(0).objects[0];
      const stage = app.stage.getBoundingClientRect();
      return { x: stage.left + app.content.x + ((object.box[0] + object.box[2]) / 2 / app.store.source.width) * app.content.width,
        y: stage.top + app.content.y + ((object.box[1] + object.box[3]) / 2 / app.store.source.height) * app.content.height };
    });
    await page.mouse.click(target.x, target.y);
    await page.waitForSelector('#selection-details:visible');
    assert.ok(await page.locator('#quality-list').evaluate((element) => element.children.length) > 0);
    await page.locator('#mode-local').click();
    await page.waitForFunction(() => window.__matchVisualizer.connection === 'unavailable');
    const empty = await page.evaluate(() => ({ store: window.__matchVisualizer.store, selected: window.__matchVisualizer.selectedId,
      sample: window.__matchVisualizer.lastSample, details: document.getElementById('selection-details').hidden,
      empty: !document.getElementById('selection-empty').hidden,
      remaining: ['quality-list', 'limitations-list', 'team-legend'].map((id) => document.getElementById(id).children.length),
      availability: document.getElementById('tracking-availability').textContent,
      frame: document.getElementById('frame-counts').textContent,
      calibration: document.getElementById('frame-calibration').textContent }));
    assert.deepEqual(empty, { store: null, selected: null, sample: null, details: true, empty: true,
      remaining: [0, 0, 0], availability: '', frame: '', calibration: 'Aucune analyse ouverte.' });
  });
}
