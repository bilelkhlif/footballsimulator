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
    const seeked = new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
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
    await step(record, 'démo ouverte par défaut sous /footballsimulator/, sans serveur ni Python', async () => {
      await page.goto(`${subPathUrl}visualizer.html`);
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
}
