/**
 * Tests de bout en bout du visualiseur de match (visualizer.html), dans Chrome avec WebGPU.
 *
 * Le serveur d'analyse est simulé (page.route) : ces tests vérifient l'interface, pas les modèles.
 * Les données sont synthétiques (tests/fixtures/visualizer, générées par make_fixture.py) : la
 * couleur de chaque image de la vidéo code son numéro, ce qui permet de lire l'image réellement
 * affichée et de la comparer aux annotations (synchronisation).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './serve.mjs';

/** Identifiant de l'analyse simulée. */
const FIXTURE_ID = '20261117-000000-f1f1f1';

/** Dossier des données de test. */
const FIXTURE_DIR = path.join(REPO_ROOT, 'tests', 'fixtures', 'visualizer');

/** Cadence de la vidéo synthétique. */
const FPS = 25;

/**
 * Simule l'API du serveur d'analyse avec les données de test.
 * @param {import('playwright-core').Page} page
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Tests de bout en bout du visualiseur — outillage
 */
async function mockAnalysisApi(page, { long = false, complete = true, availableUntil = null, legacy = false, uncertainIds = null } = {}) {
  const prefix = long ? 'fenetres-synthetiques' : 'match-synthetique';
  let tracking = await readFile(path.join(FIXTURE_DIR, `${prefix}.tracking.json`), 'utf8');
  const document = JSON.parse(tracking);
  if (uncertainIds) {
    // Contact corrigé simulé (identity.py) : identité incertaine, sans équipe, et un échange déclaré.
    for (const frame of document.frames) {
      for (const object of frame.objects) {
        if (uncertainIds.includes(object.id)) {
          Object.assign(object, { identity: 'uncertain', team: null, teamConfidence: null });
        }
      }
    }
    document.metrics = { ...document.metrics, identity: { checked: true, contacts: 1, crowded: 0, decidable: 1, swaps: 1, splits: 0 } };
    tracking = JSON.stringify(document);
  }
  const video = await readFile(path.join(FIXTURE_DIR, `${prefix}.webm`));
  const status = { id: FIXTURE_ID, name: `${prefix}.webm`, status: complete ? 'done' : 'running', createdAt: '2026-11-17T00:00:00+00:00' };
  const state = { status, windows: [], exportReads: 0, resumes: 0, delay: 0,
    manifest: { ...document, frames: undefined, tracks: [], complete,
      storage: { kind: 'sqlite', availableUntil: availableUntil ?? document.frames.at(-1).time,
        frameCount: document.frames.filter((frame) => frame.time <= (availableUntil ?? Infinity)).length, revision: 1 } } };
  await page.route('**/api/**', async (route) => {
    const { pathname, searchParams } = new URL(route.request().url());
    if (pathname.endsWith('/api/health')) {
      await route.fulfill({ json: { ok: true, device: 'test', missingModels: [] } });
    } else if (pathname.endsWith('/api/analyses')) {
      await route.fulfill(route.request().method() === 'POST'
        ? { status: 202, json: status } : { json: [status] });
    } else if (pathname.endsWith(`/api/analyses/${FIXTURE_ID}/tracking`)) {
      state.exportReads += 1;
      await route.fulfill({ body: tracking, contentType: 'application/json' });
    } else if (pathname.endsWith(`/api/analyses/${FIXTURE_ID}/manifest`)) {
      await route.fulfill(legacy ? { status: 404, json: { error: 'ancien format' } } : { json: state.manifest });
    } else if (pathname.endsWith(`/api/analyses/${FIXTURE_ID}/frames`)) {
      const from = Number(searchParams.get('from'));
      const to = Number(searchParams.get('to'));
      const available = document.frames.filter((frame) => frame.time <= state.manifest.storage.availableUntil);
      const before = available.findLast((frame) => frame.time < from);
      const after = available.find((frame) => frame.time > to);
      const frames = [before, ...available.filter((frame) => frame.time >= from && frame.time <= to), after].filter(Boolean);
      const ids = new Set(frames.flatMap((frame) => frame.objects.map((object) => object.id)));
      ids.add(Number(searchParams.get('selected')));
      state.windows.push({ from, to, count: frames.length });
      if (state.delay) {
        await new Promise((resolve) => setTimeout(resolve, state.delay));
      }
      await route.fulfill({ json: { from, to, frames, tracks: document.tracks.filter((track) => ids.has(track.id)) } });
    } else if (pathname.endsWith(`/api/analyses/${FIXTURE_ID}/resume`)) {
      state.resumes += 1;
      status.status = 'running';
      status.resumable = false;
      await route.fulfill({ status: 202, json: status });
    } else if (pathname.endsWith(`/api/analyses/${FIXTURE_ID}/video`)) {
      // Lecture partielle, comme le vrai serveur : sans elle, Chrome juge la vidéo non navigable.
      const match = /bytes=(\d*)-(\d*)/.exec(route.request().headers().range ?? '');
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = match?.[2] ? Math.min(Number(match[2]), video.length - 1) : video.length - 1;
      await route.fulfill({
        status: match ? 206 : 200,
        body: video.subarray(start, end + 1),
        headers: { 'content-type': 'video/webm', 'accept-ranges': 'bytes', ...(match ? { 'content-range': `bytes ${start}-${end}/${video.length}` } : {}) },
      });
    } else if (pathname.endsWith(`/api/analyses/${FIXTURE_ID}`)) {
      await route.fulfill({ json: status });
    } else {
      await route.fulfill({ status: 404, json: { error: 'inconnu' } });
    }
  });
  return state;
}

/**
 * Identité incertaine pendant un contact corrigé (analysis/football_analysis/identity.py) : le
 * panneau du joueur sélectionné sur la vidéo n'affirme ni vitesse ni équipe, signale la distance
 * comme une estimation, et la qualité décrit le contrôle des identités.
 * @param {import('playwright-core').Page} page
 * @param {string} url
 * @param {Function} record
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests du visualiseur — identités incertaines
 */
async function testUncertainIdentity(page, url, record) {
  await page.unroute('**/api/**');
  await mockAnalysisApi(page, { uncertainIds: [7] });
  await page.goto(`${url}visualizer.html?analyse=${FIXTURE_ID}`);
  await page.waitForFunction(() => window.__matchVisualizer?.snapshot().webgpu && window.__matchVisualizer.store?.frames.length);
  await seekToFrame(page, 25);
  await page.waitForFunction(() => window.__matchVisualizer.snapshot().objects.some((object) => object.id === 7));
  const seven = await page.evaluate(() => window.__matchVisualizer.snapshot().objects.find((object) => object.id === 7));
  const target = await boxCentre(page, seven.box);
  await page.mouse.click(target.x, target.y);
  await page.waitForFunction(() => window.__matchVisualizer.selectedId === 7);
  await page.waitForTimeout(300);
  const panel = await page.evaluate(() => Object.fromEntries(['sel-team', 'sel-speed', 'sel-distance', 'sel-identity']
    .map((id) => [id, document.getElementById(id).textContent])));
  const quality = await page.textContent('#quality-list');
  const ok = panel['sel-speed'] === '— (identité incertaine)' && panel['sel-team'] === 'inconnue (identité incertaine)'
    && /qui est qui/.test(panel['sel-identity']) && !/mesurés/.test(panel['sel-distance'])
    && /1 échange corrigé sur 1 contact masqué/.test(quality);
  record('Visualiseur : identité incertaine pendant un contact corrigé, ni vitesse ni équipe affirmées', ok ? 'ok' : 'échec',
    `${panel['sel-team']} ; ${panel['sel-speed']} ; ${panel['sel-distance']}`);
}

/**
 * Vérifie la lecture par fenêtres, l'affichage des trous et la reprise, dans Chrome réel.
 * @param {import('playwright-core').Page} page
 * @param {string} url
 * @param {Function} record
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests du visualiseur — analyses longues
 */
async function testWindowedLoading(page, url, record) {
  await page.unroute('**/api/**');
  const full = await mockAnalysisApi(page, { long: true });
  await page.goto(`${url}visualizer.html?analyse=${FIXTURE_ID}`);
  await page.waitForFunction(() => window.__matchVisualizer?.snapshot().webgpu && window.__matchVisualizer?.store?.frames.length);
  full.delay = 180;
  const pending = await seekToFrame(page, 750);
  record('Visualiseur : déplacement éloigné sans conserver les anciennes annotations',
    pending.objects.length === 0 || pending.analysedTime >= 29.9 ? 'ok' : 'échec',
    `${pending.objects.length} annotations, image analysée ${pending.analysedTime}, lecteur ${pending.currentTime.toFixed(2)} s`);
  await page.waitForFunction(() => window.__matchVisualizer.snapshot().sampleTime >= 30
    && window.__matchVisualizer.snapshot().objects.length > 0);
  const distant = await page.evaluate(() => window.__matchVisualizer.snapshot());
  record('Visualiseur : lecture par fenêtres, sans export complet, après déplacement à 30 s',
    full.exportReads === 0 && full.windows.length >= 2 && distant.loadedFrames <= 215 && distant.window.from >= 25 ? 'ok' : 'échec',
    `${distant.loadedFrames} images chargées, ${full.windows.length} requêtes de fenêtres`);
  await seekToFrame(page, 450);
  await seekToFrame(page, 100);
  await page.waitForFunction(() => window.__matchVisualizer.snapshot().window?.to < 20
    && window.__matchVisualizer.snapshot().objects.length > 0);
  record('Visualiseur : déplacement rapide aller-retour, données du dernier instant demandé',
    await page.evaluate(() => window.__matchVisualizer.snapshot().window.to < 20) ? 'ok' : 'échec');

  await page.unroute('**/api/**');
  const partial = await mockAnalysisApi(page, { long: true, complete: false, availableUntil: 12 });
  await page.goto(`${url}visualizer.html?analyse=${FIXTURE_ID}`);
  await page.waitForFunction(() => window.__matchVisualizer?.snapshot().webgpu && window.__matchVisualizer.store?.frames.length);
  await seekToFrame(page, 650);
  const unavailable = await page.evaluate(() => window.__matchVisualizer.snapshot());
  record('Visualiseur : analyse incomplète signalée, aucune position inventée dans la partie future',
    unavailable.objects.length === 0 && /incomplète/.test(await page.textContent('#tracking-availability')) ? 'ok' : 'échec');
  partial.status.status = 'interrupted';
  partial.status.resumable = true;
  await page.evaluate((id) => window.__matchVisualizer.openAnalysis(id, { keepVideo: true }), FIXTURE_ID);
  await page.waitForSelector('#resume-analysis', { state: 'visible' });
  await page.click('#resume-analysis');
  partial.manifest.complete = true;
  partial.manifest.storage.availableUntil = 35.92;
  partial.manifest.storage.revision += 1;
  partial.status.status = 'done';
  await page.waitForFunction(() => window.__matchVisualizer.snapshot().complete
    && window.__matchVisualizer.snapshot().objects.length > 0, null, { timeout: 10000 });
  record('Visualiseur : reprise explicite et chargement des nouveaux segments sans recharger la vidéo',
    partial.resumes === 1 && partial.exportReads === 0 && /terminée/.test(await page.textContent('#tracking-availability')) ? 'ok' : 'échec');

  await page.unroute('**/api/**');
  const upload = await mockAnalysisApi(page, { complete: false, availableUntil: 2 });
  await page.locator('#upload-input').setInputFiles(path.join(FIXTURE_DIR, 'match-synthetique.webm'));
  await page.waitForFunction(() => window.__matchVisualizer.store?.complete === false
    && window.__matchVisualizer.store?.frames.length > 0
    && document.getElementById('match-video').src.startsWith('blob:'));
  record('Visualiseur : le téléversement ouvre automatiquement les premiers segments disponibles',
    upload.exportReads === 0 && upload.windows.length > 0 ? 'ok' : 'échec');
  upload.manifest.complete = true;
  upload.manifest.storage.availableUntil = 3.92;
  upload.manifest.storage.revision += 1;
  upload.status.status = 'done';
  await page.waitForFunction(() => window.__matchVisualizer.store?.complete === true, null, { timeout: 10000 });

  await page.unroute('**/api/**');
  const legacy = await mockAnalysisApi(page, { legacy: true });
  await page.goto(`${url}visualizer.html?analyse=${FIXTURE_ID}`);
  await page.waitForFunction(() => window.__matchVisualizer?.snapshot().webgpu && window.__matchVisualizer.store?.frames.length);
  record('Visualiseur : anciennes analyses JSON encore lisibles',
    legacy.exportReads === 1 && (await page.evaluate(() => window.__matchVisualizer.snapshot())).window === null ? 'ok' : 'échec');
}

/**
 * Script injecté dans la page : numéro de l'image affichée, lu dans les huit pavés binaires du haut
 * de l'image (voir make_fixture.py).
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Tests de bout en bout du visualiseur — outillage
 */
function installFrameReader() {
  window.__readDisplayedFrame = () => {
    const video = document.getElementById('match-video');
    const canvas = window.__frameCanvas ?? Object.assign(document.createElement('canvas'), { width: 320, height: 180 });
    window.__frameCanvas = canvas;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, 0, 0, 320, 180);
    const band = context.getImageData(0, 0, 320, 20).data;
    let index = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      const offset = (10 * 320 + bit * 40 + 20) * 4;
      if (band[offset] > 128) {
        index += 1 << bit;
      }
    }
    return index;
  };
}

/**
 * Déplace la vidéo au milieu d'une image et attend la fin du déplacement, puis deux images peintes.
 * @param {import('playwright-core').Page} page
 * @param {number} frame numéro de l'image
 * @returns {Promise<object>} état du visualiseur, avec l'image affichée (displayedFrame)
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Tests de bout en bout du visualiseur — outillage
 */
async function seekToFrame(page, frame) {
  return page.evaluate(async (target) => {
    const video = document.getElementById('match-video');
    const seeked = new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
    video.currentTime = (target + 0.5) / 25;
    await seeked;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { ...window.__matchVisualizer.snapshot(), displayedFrame: window.__readDisplayedFrame() };
  }, frame);
}

/**
 * Centre d'une boîte de la vidéo source, en coordonnées de la page.
 * @param {import('playwright-core').Page} page
 * @param {number[]} box
 * @returns {Promise<{x: number, y: number}>}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Tests de bout en bout du visualiseur — outillage
 */
async function boxCentre(page, box) {
  return page.evaluate((b) => {
    const app = window.__matchVisualizer;
    const stage = document.getElementById('stage').getBoundingClientRect();
    const { content } = app;
    const { width, height } = app.store.source;
    return {
      x: stage.left + content.x + ((b[0] + b[2]) / 2 / width) * content.width,
      y: stage.top + content.y + ((b[1] + b[3]) / 2 / height) * content.height,
    };
  }, box);
}

/**
 * Indique si deux rectangles se chevauchent.
 * @param {{x: number, y: number, width: number, height: number}} a
 * @param {{x: number, y: number, width: number, height: number}} b
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Tests de bout en bout du visualiseur — outillage
 */
function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Tests de bout en bout du visualiseur : chargement en WebGPU, synchronisation à l'arrêt et en
 * lecture, interpolation, coupure de plan, calibration absente, sélection sur la vidéo et dans le
 * terrain 3D, rotation et zoom du terrain 3D, panneau déplaçable, redimensionnable, verrouillable,
 * réductible, placement automatique.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url adresse du serveur statique de test
 * @param {(name: string, status: string, detail?: string) => void} record
 * @param {() => void} recordCanvasContexts script qui note les contextes de canvas demandés
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Tests de bout en bout du visualiseur
 */
export async function testMatchVisualizer(browser, url, record, recordCanvasContexts) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  try {
    await page.addInitScript(recordCanvasContexts);
    await page.addInitScript(installFrameReader);
    await mockAnalysisApi(page);
    await page.goto(`${url}visualizer.html?analyse=${FIXTURE_ID}`);
    await page.waitForFunction(() => {
      const app = window.__matchVisualizer;
      return app?.store && app.snapshot().webgpu && document.getElementById('match-video').readyState >= 2;
    }, null, { timeout: 30000 });
    const contexts = await page.evaluate(() => window.__canvasContexts);
    const webgl = contexts.filter((type) => /webgl/.test(type));
    record('Visualiseur : terrain 3D en WebGPU, sans contexte WebGL', webgl.length === 0 && contexts.includes('webgpu') ? 'ok' : 'échec',
      `contextes : ${[...new Set(contexts)].join(', ')}`);

    // Synchronisation à l'arrêt : l'image affichée et les annotations sont la même image.
    const checks = [];
    for (const frame of [25, 47, 91]) {
      const state = await seekToFrame(page, frame);
      const seven = state.objects.find((object) => object.id === 7);
      const annotated = seven ? (seven.box[0] - 20) / 2 : null;
      checks.push({ frame, displayed: state.displayedFrame, annotated, interpolated: state.interpolated });
    }
    const syncOk = checks.every((c) => c.displayed === c.frame && c.annotated === c.frame && c.interpolated);
    record('Visualiseur : synchronisation à l\'arrêt (images 25, 47 et 91, entre deux analyses)', syncOk ? 'ok' : 'échec',
      checks.map((c) => `image ${c.frame} : affichée ${c.displayed}, annotée ${c.annotated}`).join(' ; '));

    // Synchronisation en lecture : à chaque image peinte, l'image affichée et l'image annotée.
    const playback = await page.evaluate(async () => {
      const video = document.getElementById('match-video');
      video.currentTime = 0;
      await new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
      const samples = [];
      await video.play();
      await new Promise((resolve) => {
        const step = () => {
          const state = window.__matchVisualizer.snapshot();
          const seven = state.objects.find((object) => object.id === 7);
          if (seven && !video.paused) {
            samples.push({ displayed: window.__readDisplayedFrame(), annotated: (seven.box[0] - 20) / 2 });
          }
          if (video.currentTime > 2.2 || video.ended) {
            resolve();
          } else {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      });
      video.pause();
      return samples;
    });
    const gaps = playback.map((s) => Math.abs(s.annotated - s.displayed));
    const maxGap = Math.max(...gaps);
    const exact = gaps.filter((g) => g < 0.01).length;
    record('Visualiseur : synchronisation en lecture (écart entre image affichée et image annotée)',
      playback.length >= 20 && maxGap <= 1 ? 'ok' : 'échec',
      `${playback.length} images peintes, ${exact} identiques, écart maximal ${maxGap} image(s)`);

    // Coupure de plan à l'image 80 : pas d'interpolation entre 78 et 80.
    const beforeCut = await seekToFrame(page, 79);
    record('Visualiseur : aucune interpolation à travers une coupure de plan', beforeCut.interpolated === false ? 'ok' : 'échec');

    // Calibration impossible (images 60 à 70) : aucun joueur posé sur le terrain 3D.
    const uncalibrated = await seekToFrame(page, 64);
    const calibrationText = await page.textContent('#frame-calibration');
    record('Visualiseur : sans calibration, aucun joueur n\'est posé sur le terrain 3D',
      uncalibrated.overlay?.calibrated === false && uncalibrated.overlay?.placed === 0 && /Calibration impossible/.test(calibrationText) ? 'ok' : 'échec',
      calibrationText);

    // Sélection d'un joueur en cliquant sur la vidéo, puis sur le terrain 3D.
    const state = await seekToFrame(page, 30);
    record('Visualiseur : joueurs posés sur le terrain 3D', state.overlay?.placed === 3 ? 'ok' : 'échec', `${state.overlay?.placed} pions`);
    const seven = state.objects.find((object) => object.id === 7);
    const target = await boxCentre(page, seven.box);
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(300);
    const selectedOnVideo = await page.evaluate(() => window.__matchVisualizer.selectedId);
    const panelId = await page.textContent('#sel-id');
    record('Visualiseur : sélection d\'un joueur sur la vidéo', selectedOnVideo === 7 && panelId === '7' ? 'ok' : 'échec', `sélection ${selectedOnVideo}`);

    const point = await page.evaluate(() => {
      const { overlay } = window.__matchVisualizer;
      const player = [...overlay.pools.values()].flatMap((pool) => pool.players).find((p) => p.visible && p.userData.trackId === 12);
      const world = player.getWorldPosition(player.position.clone());
      world.y += 0.012;
      world.project(overlay.camera);
      const rect = overlay.renderer.domElement.getBoundingClientRect();
      return { x: rect.left + ((world.x + 1) / 2) * rect.width, y: rect.top + ((1 - world.y) / 2) * rect.height };
    });
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(300);
    const selectedIn3d = await page.evaluate(() => window.__matchVisualizer.selectedId);
    record('Visualiseur : sélection d\'un joueur sur le terrain 3D (raycasting)', selectedIn3d === 12 ? 'ok' : 'échec', `sélection ${selectedIn3d}`);

    // Rotation et zoom du terrain 3D (OrbitControls) : glisser dans la vue, puis molette.
    const view = await page.evaluate(() => {
      const { overlay } = window.__matchVisualizer;
      const rect = overlay.renderer.domElement.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, azimuth: overlay.controls.getAzimuthalAngle(),
        distance: overlay.camera.position.distanceTo(overlay.controls.target) };
    });
    await page.mouse.move(view.x, view.y);
    await page.mouse.down();
    await page.mouse.move(view.x + 90, view.y, { steps: 10 });
    await page.mouse.up();
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(600);
    const turned = await page.evaluate(() => {
      const { overlay, selectedId } = window.__matchVisualizer;
      return { azimuth: overlay.controls.getAzimuthalAngle(), distance: overlay.camera.position.distanceTo(overlay.controls.target), selectedId };
    });
    const rotationDeg = Math.abs(turned.azimuth - view.azimuth) * 180 / Math.PI;
    record('Visualiseur : terrain 3D tourné au glisser et zoomé à la molette, sans changer la sélection',
      rotationDeg > 10 && turned.distance < view.distance * 0.95 && turned.selectedId === 12 ? 'ok' : 'échec',
      `rotation ${rotationDeg.toFixed(0)}°, distance ${view.distance.toFixed(2)} → ${turned.distance.toFixed(2)} m`);
    await page.evaluate(() => window.__matchVisualizer.overlay.resetView());

    // Panneau : déplacement à la main (coupe le placement automatique), redimensionnement, verrou, réduction.
    const before = (await page.evaluate(() => window.__matchVisualizer.snapshot())).panel;
    const bar = await page.locator('#pitch-panel-bar .vz-panel-title').boundingBox();
    await page.mouse.move(bar.x + 5, bar.y + 5);
    await page.mouse.down();
    await page.mouse.move(bar.x + 155, bar.y + 85, { steps: 8 });
    await page.mouse.up();
    const moved = await page.evaluate(() => window.__matchVisualizer.snapshot());
    const movedOk = Math.abs(moved.panel.x - (before.x + 150)) < 2 && Math.abs(moved.panel.y - (before.y + 80)) < 2 && !moved.options.autoPlace;
    record('Visualiseur : panneau déplacé à la main, placement automatique coupé', movedOk ? 'ok' : 'échec',
      `(${Math.round(before.x)}, ${Math.round(before.y)}) → (${Math.round(moved.panel.x)}, ${Math.round(moved.panel.y)})`);

    const grip = await page.locator('#pitch-panel-resize').boundingBox();
    await page.mouse.move(grip.x + 9, grip.y + 9);
    await page.mouse.down();
    await page.mouse.move(grip.x + 69, grip.y + 49, { steps: 6 });
    await page.mouse.up();
    const resized = (await page.evaluate(() => window.__matchVisualizer.snapshot())).panel;
    const canvasSize = await page.evaluate(() => {
      const canvas = window.__matchVisualizer.overlay.renderer.domElement;
      return { width: canvas.clientWidth, height: canvas.clientHeight };
    });
    record('Visualiseur : panneau redimensionné, rendu 3D à la nouvelle taille',
      Math.abs(resized.width - (moved.panel.width + 60)) < 2 && Math.abs(canvasSize.width - resized.width) < 3 ? 'ok' : 'échec',
      `${Math.round(moved.panel.width)} → ${Math.round(resized.width)} px, canvas ${canvasSize.width} px`);

    await page.click('#toggle-lock');
    const lockedBar = await page.locator('#pitch-panel-bar .vz-panel-title').boundingBox();
    await page.mouse.move(lockedBar.x + 5, lockedBar.y + 5);
    await page.mouse.down();
    await page.mouse.move(lockedBar.x + 205, lockedBar.y + 5, { steps: 5 });
    await page.mouse.up();
    const locked = (await page.evaluate(() => window.__matchVisualizer.snapshot())).panel;
    record('Visualiseur : panneau verrouillé, immobile', Math.abs(locked.x - resized.x) < 1 ? 'ok' : 'échec');
    await page.click('#toggle-lock');

    await page.click('#pitch-minimise');
    const minimized = { panel: await page.isVisible('#pitch-panel'), restore: await page.isVisible('#pitch-restore') };
    await page.click('#pitch-restore');
    const restored = await page.isVisible('#pitch-panel');
    record('Visualiseur : panneau réduit en bouton, puis rouvert', !minimized.panel && minimized.restore && restored ? 'ok' : 'échec');

    // Placement automatique : posé sur le joueur 12, le panneau s'en écarte dès que l'option revient.
    const twelve = state.objects.find((object) => object.id === 12);
    const twelveCentre = await boxCentre(page, twelve.box);
    const panelNow = await page.locator('#pitch-panel-bar .vz-panel-title').boundingBox();
    const panelRect = (await page.evaluate(() => window.__matchVisualizer.snapshot())).panel;
    const stage = await page.locator('#stage').boundingBox();
    await page.mouse.move(panelNow.x + 5, panelNow.y + 5);
    await page.mouse.down();
    await page.mouse.move(panelNow.x + 5 + (twelveCentre.x - stage.x - panelRect.x - panelRect.width / 2),
      panelNow.y + 5 + (twelveCentre.y - stage.y - panelRect.y - panelRect.height / 2), { steps: 8 });
    await page.mouse.up();
    const covering = await page.evaluate(() => window.__matchVisualizer.snapshot());
    const twelveRect = await page.evaluate((b) => {
      const { content, store } = window.__matchVisualizer;
      const sx = content.width / store.source.width;
      const sy = content.height / store.source.height;
      return { x: content.x + b[0] * sx, y: content.y + b[1] * sy, width: (b[2] - b[0]) * sx, height: (b[3] - b[1]) * sy };
    }, twelve.box);
    await page.click('#toggle-auto');
    await seekToFrame(page, 31);
    await page.waitForTimeout(700);
    const placed = await page.evaluate(() => window.__matchVisualizer.snapshot());
    record('Visualiseur : placement automatique hors des joueurs',
      overlaps(covering.panel, twelveRect) && !overlaps(placed.panel, twelveRect) && placed.options.autoPlace ? 'ok' : 'échec',
      `panneau en (${Math.round(placed.panel.x)}, ${Math.round(placed.panel.y)})`);

    record('Visualiseur : aucune erreur dans la console', errors.length === 0 ? 'ok' : 'échec', errors.slice(0, 3).join(' | '));
    await testWindowedLoading(page, url, record);
    await testUncertainIdentity(page, url, record);
  } catch (error) {
    record('Visualiseur : scénario complet', 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}
