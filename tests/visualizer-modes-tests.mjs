/**
 * Tests de bout en bout des deux modes du visualiseur, dans Chrome :
 *
 * - démonstration publique, servie en fichiers statiques sous /footballsimulator/ comme sur GitHub
 *   Pages (vidéo en lecture partielle, comme Pages), serveur d'analyse arrêté : lecture, synchronisation image par image (numéro binaire dessiné
 *   dans la vidéo synthétique), retour et avance, sélection sur la vidéo et sur le terrain 3D,
 *   identité incertaine et distances, plan non calibré, rechargement, export abîmé, écrans mobiles ;
 * - analyse locale, serveur simulé (page.route) : états « indisponible », « en cours »,
 *   « interrompue », reprise, « terminée », et coupure du serveur pendant une analyse.
 *
 * Le pipeline réel (GPU, modèles) est vérifié à part : tests/visualizer-local-ai.mjs.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { testVisualizerAsyncRegressions } from './visualizer-async-regressions.mjs';

const DEMO_ID = 'match-synthetique';
const FPS = 25;
const MANIFEST = JSON.parse(readFileSync(fileURLToPath(new URL(`../demo/matches/${DEMO_ID}/manifest.json`, import.meta.url)), 'utf8'));
const CONTACT = MANIFEST.metrics.identity.scriptedContacts[0];

/**
 * Script de page : numéro de l'image affichée, lu dans les douze pavés binaires dessinés en bas à
 * gauche de la vidéo de démonstration (football_analysis.demo_match.frame_code).
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout du visualiseur — outillage de synchronisation
 */
function installDemoFrameReader() {
  window.__readDemoFrame = () => {
    const video = document.getElementById('match-video');
    const canvas = window.__demoCanvas ?? Object.assign(document.createElement('canvas'), { width: 960, height: 540 });
    window.__demoCanvas = canvas;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, 0, 0, 960, 540);
    let frame = 0;
    for (let bit = 0; bit < 12; bit += 1) {
      const [red, green, blue] = context.getImageData(12 + bit * 20 + 8, 520, 1, 1).data;
      if ((red + green + blue) / 3 > 128) {
        frame += 1 << bit;
      }
    }
    return frame;
  };
}

/**
 * Sert la vidéo de démonstration avec lecture partielle (Range), comme GitHub Pages : le serveur
 * statique des tests ne la gère pas, et Chrome ne peut pas se déplacer dans un MP4 sans elle.
 * @param {import('playwright-core').BrowserContext} context
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout du visualiseur — outillage
 */
async function serveDemoVideoLikePages(context) {
  const video = readFileSync(fileURLToPath(new URL(`../demo/matches/${DEMO_ID}/video.mp4`, import.meta.url)));
  await context.route(`**/demo/matches/${DEMO_ID}/video.mp4`, async (route) => {
    const match = /bytes=(\d*)-(\d*)/.exec(route.request().headers().range ?? '');
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), video.length - 1) : video.length - 1;
    await route.fulfill({
      status: match ? 206 : 200, body: video.subarray(start, end + 1),
      headers: { 'content-type': 'video/mp4', 'accept-ranges': 'bytes',
        ...(match ? { 'content-range': `bytes ${start}-${end}/${video.length}` } : {}) },
    });
  });
}

/**
 * Déplace la vidéo au milieu d'une image, attend la fenêtre de suivi et deux images peintes.
 * @param {import('playwright-core').Page} page
 * @param {number} frame
 * @returns {Promise<object>} état du visualiseur, image affichée comprise
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout du visualiseur — outillage de synchronisation
 */
async function seekDemo(page, frame) {
  return page.evaluate(async (target) => {
    const app = window.__matchVisualizer;
    const video = document.getElementById('match-video');
    const seeked = new Promise((resolve, reject) => {
      if (video.error) {
        reject(new Error(`déplacement impossible : erreur vidéo ${video.error.code} (${video.error.message})`));
        return;
      }
      const onSeeked = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        video.removeEventListener('seeked', onSeeked);
        reject(new Error('déplacement vidéo sans événement seeked après 10 s'));
      }, 10000);
      video.addEventListener('seeked', onSeeked, { once: true });
    });
    video.currentTime = (target + 0.5) / 25;
    await seeked;
    const time = video.currentTime;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const window_ = app.store?.window;
      if (window_ && window_.from <= time && window_.to >= Math.min(time + 1, 35.9) && app.lastSample?.frame) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { ...app.snapshot(), displayedFrame: window.__readDemoFrame() };
  }, frame);
}

/**
 * Centre d'une boîte de la vidéo source, en coordonnées de la page.
 * @param {import('playwright-core').Page} page
 * @param {number[]} box
 * @returns {Promise<{x: number, y: number}>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout du visualiseur — outillage
 */
async function boxCentre(page, box) {
  return page.evaluate((b) => {
    const app = window.__matchVisualizer;
    const stage = document.getElementById('stage').getBoundingClientRect();
    const { content } = app;
    const { width, height } = app.store.source;
    return { x: stage.left + content.x + ((b[0] + b[2]) / 2 / width) * content.width,
      y: stage.top + content.y + ((b[1] + b[3]) / 2 / height) * content.height };
  }, box);
}

/**
 * Collecte les erreurs de la page : console, script, réponses HTTP en échec.
 * @param {import('playwright-core').Page} page
 * @returns {string[]}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout du visualiseur — outillage
 */
function collectErrors(page) {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
  return errors;
}

/**
 * Exécute une étape et l'enregistre ; une étape en échec n'empêche pas les suivantes.
 * @param {(name: string, status: string, detail?: string) => void} record
 * @param {string} name
 * @param {() => Promise<[boolean, string]>} action
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout du visualiseur — outillage
 */
async function step(record, name, action) {
  try {
    const [ok, detail] = await action();
    record(`Visualiseur, modes : ${name}`, ok ? 'ok' : 'échec', detail);
  } catch (error) {
    record(`Visualiseur, modes : ${name}`, 'échec', error.message.split('\n')[0]);
  }
}

/**
 * Mode démonstration, serveur d'analyse arrêté, sous le sous-chemin de GitHub Pages.
 * @param {import('playwright-core').Browser} browser
 * @param {string} subPathUrl adresse du serveur statique /footballsimulator/
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout du visualiseur — mode démonstration
 */
async function testDemoMode(browser, subPathUrl, record) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Serveur d'analyse arrêté : toute requête vers lui échoue comme une connexion refusée.
  await context.route('http://127.0.0.1:8765/**', (route) => route.abort('connectionrefused'));
  await serveDemoVideoLikePages(context);
  await context.addInitScript(installDemoFrameReader);
  const page = await context.newPage();
  const errors = collectErrors(page);
  try {
    await step(record, 'démo synthétique ouverte explicitement sous /footballsimulator/, sans serveur ni Python', async () => {
      await page.goto(`${subPathUrl}visualizer.html?demo=${DEMO_ID}`);
      await page.waitForFunction(() => window.__matchVisualizer?.snapshot().window, null, { timeout: 30000 });
      const state = await page.evaluate(() => window.__matchVisualizer.snapshot());
      const banner = await page.textContent('#provenance-banner');
      return [state.mode === 'demo' && state.connection === 'demo' && state.analysis === DEMO_ID && /synthétique/.test(banner)
        && page.url().includes(`?demo=${DEMO_ID}`), `mode ${state.mode}, état ${state.connection}, adresse ${new URL(page.url()).search}`];
    });

    await step(record, 'lecture de la vidéo, annotations et terrain 3D en WebGPU', async () => {
      await page.evaluate(() => document.getElementById('match-video').play());
      await page.waitForFunction(() => document.getElementById('match-video').currentTime > 2, null, { timeout: 15000 });
      await page.evaluate(() => document.getElementById('match-video').pause());
      const state = await page.evaluate(() => window.__matchVisualizer.snapshot());
      return [state.webgpu && state.objects.length >= 5 && state.overlay?.placed >= 5,
        `${state.objects.length} personnes annotées, ${state.overlay?.placed} posées sur le terrain 3D`];
    });

    await step(record, 'synchronisation image par image après retours et avances (vidéo, suivi, terrain 3D)', async () => {
      const report = [];
      let ok = true;
      for (const frame of [290, 520, 75, 860, 140]) {
        const state = await seekDemo(page, frame);
        const placed = state.objects.filter((object) => object.pitch).length;
        const aligned = state.displayedFrame === frame && Math.abs(state.sampleTime - (frame + 0.5) / FPS) < 0.05
          && Math.abs(state.analysedTime - frame / FPS) <= 0.08 + 1e-6 && state.overlay?.placed === placed
          && state.window.from <= state.currentTime && state.window.to >= state.currentTime;
        ok &&= aligned;
        report.push(`${frame}→${state.displayedFrame}`);
      }
      return [ok, `images demandées → affichées : ${report.join(', ')}`];
    });

    await step(record, 'sélection sur la vidéo puis sur le terrain 3D', async () => {
      const state = await seekDemo(page, 150);
      const panel = state.panel;
      const stage = await page.evaluate(() => document.getElementById('stage').getBoundingClientRect().toJSON());
      let target = null;
      for (const object of state.objects) {
        const point = await boxCentre(page, object.box);
        const insidePanel = point.x >= stage.left + panel.x && point.x <= stage.left + panel.x + panel.width
          && point.y >= stage.top + panel.y && point.y <= stage.top + panel.y + panel.height;
        if (!insidePanel && object.box[3] - object.box[1] > 24) {
          target = { id: object.id, point };
          break;
        }
      }
      await page.mouse.click(target.point.x, target.point.y);
      await page.waitForTimeout(250);
      const onVideo = await page.evaluate(() => window.__matchVisualizer.selectedId);
      const panelId = await page.textContent('#sel-id');
      const other = state.objects.find((object) => object.id !== target.id && object.pitch)?.id;
      const point = await page.evaluate((trackId) => {
        const { overlay } = window.__matchVisualizer;
        const player = [...overlay.pools.values()].flatMap((pool) => pool.players).find((p) => p.visible && p.userData.trackId === trackId);
        const world = player.getWorldPosition(player.position.clone());
        world.y += 0.012;
        world.project(overlay.camera);
        const rect = overlay.renderer.domElement.getBoundingClientRect();
        return { x: rect.left + ((world.x + 1) / 2) * rect.width, y: rect.top + ((1 - world.y) / 2) * rect.height };
      }, other);
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(250);
      const in3d = await page.evaluate(() => window.__matchVisualizer.selectedId);
      return [onVideo === target.id && panelId === String(target.id) && in3d === other,
        `vidéo : ${onVideo} (attendu ${target.id}), terrain 3D : ${in3d} (attendu ${other})`];
    });

    await step(record, 'identité incertaine pendant le contact scénarisé : ni vitesse ni équipe, distance estimée', async () => {
      const frame = Math.round((CONTACT.start + 0.4) * FPS);
      const state = await seekDemo(page, frame);
      const uncertain = CONTACT.tracks.find((id) => state.objects.some((object) => object.id === id));
      await page.evaluate((id) => window.__matchVisualizer.select(id), uncertain);
      await page.waitForTimeout(300);
      const labels = await page.evaluate(() => ({ identity: document.getElementById('sel-identity').textContent,
        speed: document.getElementById('sel-speed').textContent, distance: document.getElementById('sel-distance').textContent,
        team: document.getElementById('sel-team').textContent }));
      return [/qui est qui/.test(labels.identity) && /incertaine/.test(labels.speed) && labels.distance.startsWith('≈')
        && /inconnue/.test(labels.team), JSON.stringify(labels)];
    });

    await step(record, 'joueur ordinaire : vitesse et distance chiffrées, équipe connue', async () => {
      const state = await seekDemo(page, 400);
      const known = state.objects.find((object) => object.pitch && !CONTACT.tracks.includes(object.id));
      await page.evaluate((id) => { window.__matchVisualizer.selectedId = null; window.__matchVisualizer.select(id); }, known.id);
      await page.waitForTimeout(300);
      const labels = await page.evaluate(() => ({ speed: document.getElementById('sel-speed').textContent,
        distance: document.getElementById('sel-distance').textContent, team: document.getElementById('sel-team').textContent }));
      return [/km\/h/.test(labels.speed) && /\d+ m mesurés/.test(labels.distance) && /votes/.test(labels.team), JSON.stringify(labels)];
    });

    await step(record, 'plan rapproché non calibré : aucun joueur posé sur le terrain 3D', async () => {
      const state = await seekDemo(page, 25 * FPS);
      const text = await page.textContent('#frame-calibration');
      return [state.overlay?.placed === 0 && /impossible/.test(text) && state.objects.length > 0,
        `${state.objects.length} personnes, ${state.overlay?.placed} posées ; « ${text.slice(0, 60)}… »`];
    });

    await step(record, 'rechargement de la page : même démonstration, même mode', async () => {
      await page.reload();
      await page.waitForFunction(() => window.__matchVisualizer?.snapshot().window, null, { timeout: 30000 });
      const state = await page.evaluate(() => window.__matchVisualizer.snapshot());
      return [state.mode === 'demo' && state.analysis === DEMO_ID, `mode ${state.mode}, analyse ${state.analysis}`];
    });

    await step(record, 'analyse locale demandée, serveur arrêté : état « indisponible », aide, démo intacte', async () => {
      await page.click('#mode-local');
      await page.waitForFunction(() => document.body.dataset.connection === 'unavailable', null, { timeout: 15000 });
      const help = await page.textContent('#mode-help');
      const uploadDisabled = await page.evaluate(() => document.getElementById('upload-input').disabled);
      await page.click('#mode-demo');
      await page.waitForFunction(() => window.__matchVisualizer.snapshot().window && document.body.dataset.connection === 'demo',
        null, { timeout: 30000 });
      return [/football_analysis serve/.test(help) && /démo/.test(help) && uploadDisabled, `aide : ${help.slice(0, 70)}…`];
    });

    const expected = errors.filter((text) => !/127\.0\.0\.1:8765|ERR_CONNECTION_REFUSED/.test(text));
    record('Visualiseur, modes : démonstration sans erreur dans la console (hors serveur local arrêté)',
      expected.length ? 'échec' : 'ok', expected.slice(0, 3).join(' | '));
  } finally {
    await context.close();
  }
}

/**
 * Démonstration abîmée : un segment modifié est refusé avec un message lisible, sans annotations fausses.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout du visualiseur — mode démonstration
 */
async function testCorruptedDemo(browser, url, record) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.route('**/demo/matches/*/chunks/00000.json', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('"time":0.0', '"time":0.04') });
  });
  const page = await context.newPage();
  try {
    await step(record, 'export abîmé : message d\'erreur, aucune annotation affichée', async () => {
      await page.goto(`${url}visualizer.html?demo=${DEMO_ID}`);
      await page.waitForFunction(() => /abîmé/.test(document.getElementById('job-status').textContent), null, { timeout: 30000 });
      const state = await page.evaluate(() => window.__matchVisualizer.snapshot());
      return [state.objects.length === 0, await page.textContent('#job-status')];
    });
  } finally {
    await context.close();
  }
}

/**
 * Mise en page mobile, portrait et paysage : modes visibles, cibles tactiles, aucun défilement horizontal.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout du visualiseur — écrans mobiles
 */
async function testMobileLayouts(browser, url, record) {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await context.route('http://127.0.0.1:8765/**', (route) => route.abort('connectionrefused'));
    await serveDemoVideoLikePages(context);
    const page = await context.newPage();
    const errors = collectErrors(page);
    try {
      await step(record, `écran ${viewport.width} × ${viewport.height} : modes, vidéo, terrain 3D, sans défilement horizontal`, async () => {
        await page.goto(`${url}visualizer.html`);
        await page.waitForFunction(() => window.__matchVisualizer?.snapshot().window, null, { timeout: 30000 });
        const layout = await page.evaluate(() => {
          const box = (id) => document.getElementById(id).getBoundingClientRect();
          const stage = box('stage');
          return { overflow: document.documentElement.scrollWidth - window.innerWidth,
            modes: ['mode-demo', 'mode-local'].map((id) => Math.round(box(id).height)),
            stageVisible: stage.width > 200 && stage.height > 100, panel: box('pitch-panel').width > 0 };
        });
        await page.tap('#pitch-minimise');
        const restored = await page.isVisible('#pitch-restore');
        await page.tap('#pitch-restore');
        const ok = layout.overflow <= 0 && layout.modes.every((height) => height >= 40) && layout.stageVisible && layout.panel
          && restored && errors.length === 0;
        return [ok, `${JSON.stringify(layout)}, réduire/rouvrir : ${restored}, erreurs : ${errors.length}`];
      });
    } finally {
      await context.close();
    }
  }
}

/**
 * Serveur d'analyse simulé, avec état modifiable par le test : santé, liste, état d'une analyse,
 * interruption, reprise, et panne du serveur.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<{state: object}>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout du visualiseur — analyse locale simulée
 */
async function mockLocalServer(page) {
  const job = { id: '20261124-120000-abcdef', name: 'essai.mp4', status: 'running', resumable: false,
    progress: { stage: 'images', fraction: 0.4, message: 'Détection : 40 %' }, createdAt: '2026-11-24T12:00:00Z' };
  const state = { job, down: false, requests: [] };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    state.requests.push(`${method} ${url.pathname}`);
    if (state.down) {
      await route.abort('connectionrefused');
      return;
    }
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/api/health')) {
      await json({ ok: true, device: 'cuda:0', missingModels: [] });
    } else if (url.pathname.endsWith('/api/analyses')) {
      await json([job]);
    } else if (url.pathname.endsWith('/interrupt') && method === 'POST') {
      Object.assign(job, { status: 'interrupted', resumable: true, progress: null, error: 'Analyse interrompue à la demande ; les segments validés sont conservés.' });
      await json(job, 202);
    } else if (url.pathname.endsWith('/resume') && method === 'POST') {
      Object.assign(job, { status: 'running', resumable: false, error: null, progress: { stage: 'images', fraction: 0.6, message: 'Détection : 60 %' } });
      await json(job, 202);
    } else if (url.pathname.endsWith('/manifest')) {
      await json({ error: 'Résultats en cours d\'initialisation.' }, 409);
    } else if (url.pathname.endsWith(job.id)) {
      await json(job);
    } else {
      await json({ error: 'Adresse inconnue.' }, 404);
    }
  });
  return state;
}

/**
 * Analyse locale simulée : en cours, interrompue, reprise, coupure du serveur, redémarrage, fin.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout du visualiseur — analyse locale simulée
 */
async function testLocalStates(browser, url, record) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const server = await mockLocalServer(page);
  const connection = () => page.evaluate(() => document.body.dataset.connection);
  const waitFor = (wanted) => page.waitForFunction((value) => document.body.dataset.connection === value, wanted, { timeout: 20000 });
  try {
    await step(record, 'analyse locale connectée, analyse en cours suivie (« en cours », bouton Interrompre)', async () => {
      await page.goto(`${url}visualizer.html?analyse=${server.job.id}`);
      await waitFor('processing');
      const label = await page.textContent('#connection-state');
      return [/Analyse en cours 40/.test(label) && await page.isVisible('#interrupt-analysis') && !await page.isVisible('#resume-analysis'), label];
    });
    await step(record, 'interruption demandée : état « interrompue », reprise proposée', async () => {
      await page.click('#interrupt-analysis');
      await waitFor('interrupted');
      return [await page.isVisible('#resume-analysis') && !await page.isVisible('#interrupt-analysis'),
        await page.textContent('#connection-state')];
    });
    await step(record, 'reprise : l\'analyse repart et reste suivie', async () => {
      await page.click('#resume-analysis');
      await waitFor('processing');
      return [/60/.test(await page.textContent('#connection-state')), await page.textContent('#connection-state')];
    });
    await step(record, 'coupure du serveur pendant l\'analyse : état « indisponible », nouvel essai annoncé', async () => {
      server.down = true;
      await waitFor('unavailable');
      return [/nouvel essai/.test(await page.textContent('#job-status')), await page.textContent('#job-status')];
    });
    await step(record, 'serveur redémarré : analyse retrouvée « interrompue », reprenable', async () => {
      Object.assign(server.job, { status: 'interrupted', resumable: true, progress: null, error: 'Analyse interrompue par l\'arrêt du serveur.' });
      server.down = false;
      await waitFor('interrupted');
      return [await page.isVisible('#resume-analysis'), `${await connection()} : ${await page.textContent('#job-status')}`];
    });
    await step(record, 'fin de l\'analyse : état « terminée »', async () => {
      await page.click('#resume-analysis');
      await waitFor('processing');
      Object.assign(server.job, { status: 'done', progress: null, resumable: false });
      await waitFor('completed');
      return [!await page.isVisible('#interrupt-analysis') && !await page.isVisible('#resume-analysis'),
        await page.textContent('#connection-state')];
    });
  } finally {
    await context.close();
  }
}

/**
 * Application intégrée : la démonstration sous le contrôle du Service Worker de l'application AR.
 * Le Service Worker est installé par index.html, puis visualizer.html, dans son périmètre, lit la
 * vraie vidéo de 36 s par de vraies réponses 206 du serveur statique (sans émulation).
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout — visualiseur intégré sous le Service Worker
 */
async function testDemoUnderServiceWorker(browser, url, record) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('http://127.0.0.1:8765/**', (route) => route.abort('connectionrefused'));
  await context.addInitScript(installDemoFrameReader);
  const page = await context.newPage();
  const statuses = [];
  page.on('response', (response) => { if (response.url().endsWith('/video.mp4')) statuses.push(response.status()); });
  const errors = collectErrors(page);
  try {
    await step(record, 'intégré : démonstration lue sous le contrôle du Service Worker, synchronisée après déplacements', async () => {
      await page.goto(url);
      await page.waitForFunction(() => document.body.classList.contains('is-ready')
        && navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.mjs'), null, { timeout: 30000 });
      await page.goto(`${url}visualizer.html?demo=${DEMO_ID}`);
      await page.waitForFunction(() => window.__matchVisualizer?.snapshot().window, null, { timeout: 30000 });
      const controlled = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
      await page.evaluate(() => document.getElementById('match-video').play());
      await page.waitForFunction(() => document.getElementById('match-video').currentTime > 1, null, { timeout: 15000 });
      await page.evaluate(() => document.getElementById('match-video').pause());
      const frames = [];
      let ok = Boolean(controlled);
      for (const frame of [800, 125, 450]) {
        const state = await seekDemo(page, frame);
        frames.push(`${frame}→${state.displayedFrame}`);
        ok &&= state.displayedFrame === frame && Math.abs(state.analysedTime - frame / FPS) <= 0.08 + 1e-6
          && state.overlay?.placed === state.objects.filter((object) => object.pitch).length;
      }
      const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (name) =>
        (await (await caches.open(name)).keys()).filter((request) => request.url.endsWith('/video.mp4')).length)))
        .reduce((sum, count) => sum + count, 0));
      ok &&= statuses.includes(206) && cached === 0;
      return [ok, `contrôlée : ${Boolean(controlled)} ; images ${frames.join(', ')} ; réponses ${[...new Set(statuses)]} ; vidéo en cache : ${cached}`];
    });
    const unexpected = errors.filter((text) => !/127\.0\.0\.1:8765|ERR_CONNECTION_REFUSED/.test(text));
    record('Visualiseur, modes : intégré, sous le Service Worker, sans erreur dans la console',
      unexpected.length ? 'échec' : 'ok', unexpected.slice(0, 3).join(' | '));
  } finally {
    await context.close();
  }
}

/**
 * Application intégrée : l'analyse de match s'ouvre depuis « Plus d'outils » dans un nouvel onglet,
 * sans perdre la tactique en cours ; elle est masquée en AR ; le visualiseur ramène au tableau.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout — navigation entre l'application AR et le visualiseur
 */
async function testAcademicNavigation(browser, url, record) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.route('http://127.0.0.1:8765/**', (route) => route.abort('connectionrefused'));
  await context.addInitScript(() => { try { localStorage.setItem('football-simulator:aide-vue', '1'); } catch { /* sans stockage */ } });
  const page = await context.newPage();
  const errors = collectErrors(page);
  try {
    await step(record, 'intégré : « Plus d’outils » ouvre l’analyse de match dans un nouvel onglet, tactique conservée', async () => {
      await page.goto(`${url}?debug`);
      await page.waitForSelector('body.is-ready');
      await page.locator('#workspace-nav [data-workspace="formations"]').click();
      await page.locator('.formation-button[data-team="blue"][data-formation="3-5-2"]').click();
      await page.waitForTimeout(700);
      const before = await page.evaluate(() => window.__footballSimulator.board.snapshot());
      const more = page.locator('#workspace-nav [data-workspace="more"]');
      if (await more.isVisible()) await more.click();
      const link = page.locator('#match-analysis-link');
      const attributes = await link.evaluate((element) => ({ href: element.getAttribute('href'), target: element.target, rel: element.rel }));
      const [visualizer] = await Promise.all([context.waitForEvent('page'), link.click()]);
      await visualizer.waitForFunction(() => window.__matchVisualizer?.snapshot().window, null, { timeout: 30000 });
      const opened = await visualizer.evaluate(() => ({ mode: window.__matchVisualizer.mode, analysis: window.__matchVisualizer.currentAnalysis }));
      const after = await page.evaluate(() => window.__footballSimulator.board.snapshot());
      const workspace = await page.evaluate(() => document.body.dataset.workspace);
      await visualizer.close();
      const ok = attributes.href === 'visualizer.html' && attributes.target === '_blank' && attributes.rel.includes('noopener')
        && opened.mode === 'demo' && opened.analysis === DEMO_ID && JSON.stringify(after) === JSON.stringify(before)
        && after.formations.blue === '3-5-2' && workspace === 'more';
      return [ok, `lien ${JSON.stringify(attributes)} ; visualiseur ${JSON.stringify(opened)} ; tactique identique : ${JSON.stringify(after) === JSON.stringify(before)} ; espace ${workspace}`];
    });
    await step(record, 'intégré : carte de l’analyse de match masquée pendant une session AR', async () => {
      const hidden = await page.evaluate(() => {
        document.body.dataset.xr = 'active';
        const display = getComputedStyle(document.querySelector('.match-analysis')).display;
        delete document.body.dataset.xr;
        return display;
      });
      return [hidden === 'none', `affichage en AR : ${hidden}`];
    });
    await step(record, 'intégré : le visualiseur ramène au tableau tactique', async () => {
      await page.goto(`${url}visualizer.html?demo=${DEMO_ID}`);
      await page.waitForFunction(() => window.__matchVisualizer?.snapshot().window, null, { timeout: 30000 });
      await page.locator('#back-to-board').click();
      await page.waitForSelector('body.is-ready', { timeout: 30000 });
      return [new URL(page.url()).pathname.endsWith('/index.html') || new URL(page.url()).pathname.endsWith('/'), page.url()];
    });
    await step(record, 'intégré : servi par le serveur d’analyse, qui n’a pas index.html, le visualiseur n’affiche pas ce lien', async () => {
      const served = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
      await served.route('http://127.0.0.1:8765/**', (route) => route.abort('connectionrefused'));
      await served.route('**/visualizer.html*', async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, headers: { ...response.headers(), 'server-timing': 'football-analysis' } });
      });
      try {
        const marked = await served.newPage();
        await marked.goto(`${url}visualizer.html?demo=${DEMO_ID}`);
        await marked.waitForFunction(() => window.__matchVisualizer?.snapshot().window, null, { timeout: 30000 });
        const state = await marked.evaluate(() => ({
          marque: performance.getEntriesByType('navigation')[0].serverTiming.map((entry) => entry.name),
          lienVisible: !document.getElementById('back-to-board').hidden,
        }));
        return [state.marque.includes('football-analysis') && !state.lienVisible, JSON.stringify(state)];
      } finally {
        await served.close();
      }
    });
    const unexpected = errors.filter((text) => !/127\.0\.0\.1:8765|ERR_CONNECTION_REFUSED/.test(text));
    record('Visualiseur, modes : intégré, navigation sans erreur dans la console', unexpected.length ? 'échec' : 'ok', unexpected.slice(0, 3).join(' | '));
  } finally {
    await context.close();
  }
}

/**
 * Entrée « Analyse de match » du rail principal, marquée bêta : visible sur ordinateur et tablette,
 * ouvre le visualiseur dans un nouvel onglet ; masquée sur téléphone (barre basse limitée à cinq
 * espaces), en paysage court et pendant une session AR, où la carte de « Plus d'outils » reste.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Tests de bout en bout — accès au visualiseur depuis le rail
 */
async function testRailEntry(browser, url, record) {
  const open = async (viewport, extra = {}) => {
    const context = await browser.newContext({ viewport, ...extra });
    await context.route('http://127.0.0.1:8765/**', (route) => route.abort('connectionrefused'));
    await context.addInitScript(() => { try { localStorage.setItem('football-simulator:aide-vue', '1'); } catch { /* sans stockage */ } });
    const page = await context.newPage();
    await page.goto(`${url}?debug`);
    await page.waitForSelector('body.is-ready');
    return { context, page };
  };
  const entryState = (page) => page.evaluate(() => {
    const link = document.getElementById('match-analysis-nav');
    const badge = link?.querySelector('.nav-item__beta');
    const rect = link?.getBoundingClientRect();
    return { visible: Boolean(link?.getClientRects().length), badge: badge?.getClientRects().length ? badge.textContent : null,
      href: link?.getAttribute('href'), target: link?.target, rel: link?.rel, label: link?.getAttribute('aria-label'),
      inRail: Boolean(link?.closest('#workspace-nav')), rect: rect ? [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width)] : null };
  });
  const desktop = await open({ width: 1280, height: 800 });
  const errors = collectErrors(desktop.page);
  try {
    await step(record, 'rail : entrée « Analyse de match » marquée bêta, sur ordinateur', async () => {
      const state = await entryState(desktop.page);
      return [state.visible && state.inRail && state.badge === 'Bêta' && state.href === 'visualizer.html' && state.target === '_blank'
        && state.rel.includes('noopener') && /bêta/.test(state.label), JSON.stringify(state)];
    });
    await step(record, 'rail : l’entrée ouvre le visualiseur bêta dans un nouvel onglet, tactique conservée', async () => {
      await desktop.page.locator('#workspace-nav [data-workspace="formations"]').click();
      await desktop.page.locator('.formation-button[data-team="red"][data-formation="4-3-3"]').click();
      await desktop.page.waitForTimeout(700);
      const before = await desktop.page.evaluate(() => JSON.stringify(window.__footballSimulator.board.snapshot()));
      const [visualizer] = await Promise.all([desktop.context.waitForEvent('page'), desktop.page.locator('#match-analysis-nav').click()]);
      await visualizer.waitForFunction(() => window.__matchVisualizer?.snapshot().window, null, { timeout: 30000 });
      const opened = await visualizer.evaluate(() => ({ mode: window.__matchVisualizer.mode, title: document.querySelector('.vz-title').textContent }));
      await visualizer.close();
      const after = await desktop.page.evaluate(() => JSON.stringify(window.__footballSimulator.board.snapshot()));
      return [opened.mode === 'demo' && /Bêta/.test(opened.title) && before === after, `${JSON.stringify(opened)} ; tactique identique : ${before === after}`];
    });
    await step(record, 'rail déplié : libellé et pastille bêta dans l’entrée', async () => {
      await desktop.page.evaluate(() => { document.body.dataset.railExpanded = 'true'; });
      const state = await desktop.page.evaluate(() => {
        const link = document.getElementById('match-analysis-nav');
        const outer = link.getBoundingClientRect();
        const inner = link.querySelector('.nav-item__beta').getBoundingClientRect();
        return { label: getComputedStyle(link.querySelector('.nav-item__label')).display, inside: inner.left >= outer.left && inner.right <= outer.right + 1 };
      });
      await desktop.page.evaluate(() => { delete document.body.dataset.railExpanded; });
      return [state.label !== 'none' && state.inside, JSON.stringify(state)];
    });
    await step(record, 'rail : entrée bêta masquée pendant une session AR', async () => {
      const display = await desktop.page.evaluate(() => {
        document.body.dataset.xr = 'active';
        const value = getComputedStyle(document.getElementById('match-analysis-nav')).display;
        delete document.body.dataset.xr;
        return value;
      });
      return [display === 'none', `affichage en AR : ${display}`];
    });
    const unexpected = errors.filter((text) => !/127\.0\.0\.1:8765|ERR_CONNECTION_REFUSED/.test(text));
    record('Visualiseur, modes : rail, aucune erreur dans la console', unexpected.length ? 'échec' : 'ok', unexpected.slice(0, 3).join(' | '));
  } finally {
    await desktop.context.close();
  }
  for (const [label, viewport] of [['tablette 820 × 1180', { width: 820, height: 1180 }], ['téléphone 390 × 844', { width: 390, height: 844 }],
    ['paysage court 568 × 320', { width: 568, height: 320 }]]) {
    const { context, page } = await open(viewport, { hasTouch: viewport.width < 700 || viewport.height < 541 });
    try {
      await step(record, `rail ${label} : entrée bêta ${viewport.width >= 700 && viewport.height >= 541 ? 'visible' : 'masquée, carte de « Plus d’outils » conservée'}`, async () => {
        const state = await entryState(page);
        const card = await page.evaluate(() => Boolean(document.getElementById('match-analysis-link')));
        const expected = viewport.width >= 700 && viewport.height >= 541;
        return [state.visible === expected && card && (!expected || state.badge === 'Bêta'), JSON.stringify({ ...state, carte: card })];
      });
    } finally {
      await context.close();
    }
  }
}

/**
 * Perte du processus GPU de Chrome, cause de l'échec intermittent du parcours GPU manuel : l'arrêt
 * brutal du serveur d'analyse pendant un calcul CUDA réinitialise parfois le pilote du GPU partagé.
 * Chrome perd alors son processus GPU : périphérique WebGPU perdu, décodeur vidéo déconnecté
 * (erreur 3, PIPELINE_ERROR_DISCONNECTED), et le play() suivant est rejeté par la pause interne du
 * lecteur (« interrupted by a call to pause() »). Reproduit de façon déterministe par le protocole
 * DevTools (Browser.crashGpuProcess), dans un navigateur à part pour ne pas toucher aux autres tests.
 * @param {() => Promise<import('playwright-core').Browser>} launch lance un navigateur comme la suite
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout du visualiseur — perte du processus GPU
 */
export async function testVisualizerGpuReset(launch, url, record) {
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.route('http://127.0.0.1:8765/**', (route) => route.abort('connectionrefused'));
    await serveDemoVideoLikePages(context);
    await context.addInitScript(installDemoFrameReader);
    const page = await context.newPage();
    const errors = collectErrors(page);
    const cdp = await browser.newBrowserCDPSession();
    await step(record, 'processus GPU perdu : terrain 3D arrêté avec un message', async () => {
      await page.goto(`${url}visualizer.html?demo=${DEMO_ID}`);
      await page.waitForFunction(() => window.__matchVisualizer?.snapshot().window, null, { timeout: 30000 });
      const before = await seekDemo(page, 250);
      await cdp.send('Browser.crashGpuProcess');
      await page.waitForFunction(() => window.__matchVisualizer.snapshot().gpuLost, null, { timeout: 15000 });
      const after = await page.evaluate(() => ({ webgpu: window.__matchVisualizer.snapshot().webgpu,
        message: document.getElementById('pitch-view').textContent }));
      return [before.webgpu && before.displayedFrame === 250 && !after.webgpu && /rechargez la page/.test(after.message),
        `avant : WebGPU ${before.webgpu}, image ${before.displayedFrame} ; après : ${JSON.stringify(after)}`];
    });
    await step(record, 'processus GPU perdu : décodeur perdu, vidéo rechargée à la même image, lecture relancée', async () => {
      const frame = 450;
      // Écoute en phase de capture : avant le visualiseur, dont le rechargement efface video.error.
      const failure = await page.evaluate(({ target, fps }) => new Promise((resolve, reject) => {
        const video = document.getElementById('match-video');
        if (video.error) {
          resolve(`erreur ${video.error.code} : ${video.error.message}`);
          return;
        }
        const finish = (value) => {
          clearTimeout(timer);
          document.removeEventListener('error', onError, true);
          video.removeEventListener('seeked', onSeeked);
          resolve(value);
        };
        const onError = (event) => {
          if (event.target === video) {
            finish(`erreur ${video.error?.code} : ${video.error?.message}`);
          }
        };
        const onSeeked = () => finish(null);
        const timer = setTimeout(() => {
          document.removeEventListener('error', onError, true);
          video.removeEventListener('seeked', onSeeked);
          reject(new Error('ni erreur ni déplacement vidéo terminé après 10 s'));
        }, 10000);
        document.addEventListener('error', onError, true);
        video.addEventListener('seeked', onSeeked, { once: true });
        video.currentTime = (target + 0.5) / fps;
      }), { target: frame, fps: FPS });
      await page.waitForFunction(({ target, fps }) => {
        const video = document.getElementById('match-video');
        return !video.error && !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - (target + 0.5) / fps) < 0.02;
      }, { target: frame, fps: FPS }, { timeout: 15000 });
      const status = await page.textContent('#job-status');
      const restored = await seekDemo(page, frame);
      const played = await page.evaluate(async () => {
        const video = document.getElementById('match-video');
        const start = video.currentTime;
        await video.play();
        await new Promise((resolve) => setTimeout(resolve, 600));
        video.pause();
        return Number((video.currentTime - start).toFixed(2));
      });
      const recovered = failure === null || (/^erreur 3/.test(failure) && /rechargée à 0:18,0/.test(status));
      return [recovered && restored.displayedFrame === frame && played > 0.3,
        `${failure ?? 'aucune erreur de décodage'} ; état : « ${status} » ; image ${frame}→${restored.displayedFrame} ; lecture +${played} s`];
    });
    await step(record, 'processus GPU perdu : synchronisation et sélection sur la vidéo conservées', async () => {
      const report = [];
      let ok = true;
      for (const frame of [125, 800]) {
        const state = await seekDemo(page, frame);
        ok &&= state.displayedFrame === frame && Math.abs(state.analysedTime - frame / FPS) <= 0.08 + 1e-6;
        report.push(`${frame}→${state.displayedFrame}`);
      }
      const state = await seekDemo(page, 150);
      const stage = await page.evaluate(() => document.getElementById('stage').getBoundingClientRect().toJSON());
      let target = null;
      for (const object of state.objects.filter((candidate) => candidate.box[3] - candidate.box[1] > 24)) {
        const point = await boxCentre(page, object.box);
        const { panel } = state;
        const insidePanel = point.x >= stage.left + panel.x && point.x <= stage.left + panel.x + panel.width
          && point.y >= stage.top + panel.y && point.y <= stage.top + panel.y + panel.height;
        if (!insidePanel) {
          target = { id: object.id, point };
          break;
        }
      }
      const { point } = target;
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(250);
      const selected = await page.evaluate(() => window.__matchVisualizer.selectedId);
      return [ok && selected === target.id, `images ${report.join(', ')} ; sélection ${selected} (attendu ${target.id})`];
    });
    await step(record, 'processus GPU perdu : après rechargement de la page, terrain 3D de retour', async () => {
      await page.reload();
      await page.waitForFunction(() => window.__matchVisualizer?.snapshot().window, null, { timeout: 30000 });
      const state = await seekDemo(page, 300);
      return [state.webgpu && !state.gpuLost && state.displayedFrame === 300 && state.overlay?.placed >= 5,
        `WebGPU ${state.webgpu}, image ${state.displayedFrame}, ${state.overlay?.placed} posés`];
    });
    const unexpected = errors.filter((text) => !/Périphérique WebGPU perdu|127\.0\.0\.1:8765|ERR_CONNECTION_REFUSED/.test(text));
    record('Visualiseur, modes : processus GPU perdu, aucune autre erreur dans la console',
      unexpected.length ? 'échec' : 'ok', unexpected.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
}

/**
 * Tous les tests des modes du visualiseur.
 * @param {import('playwright-core').Browser} browser
 * @param {{root: string, subPath: string}} urls serveurs statiques, à la racine et sous /footballsimulator/
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout du visualiseur — modes
 */
export async function testVisualizerModes(browser, urls, record) {
  await testDemoMode(browser, urls.subPath, record);
  await testCorruptedDemo(browser, urls.root, record);
  await testMobileLayouts(browser, urls.subPath, record);
  await testLocalStates(browser, urls.root, record);
  await testVisualizerAsyncRegressions(browser, urls.root, record);
  await testDemoUnderServiceWorker(browser, urls.subPath, record);
  await testAcademicNavigation(browser, urls.subPath, record);
  await testRailEntry(browser, urls.subPath, record);
}
