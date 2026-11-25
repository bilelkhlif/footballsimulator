/**
 * Vérification de bout en bout du mode « analyse locale » avec le vrai serveur Python et le vrai
 * pipeline (détection, suivi, équipes, identités, calibration sur GPU), dans Chrome. À lancer à la
 * main : elle demande les poids des modèles, une vidéo dont l'usage est autorisé et plusieurs
 * minutes de calcul ; elle ne fait pas partie de npm test.
 *
 * Parcours vérifié, dans l'interface réelle :
 *  1. page servie par Python (repli local) : téléversement, progression, résultats partiels pendant
 *     l'analyse ; interruption puis reprise ; arrêt brutal du serveur pendant l'analyse, redémarrage,
 *     analyse retrouvée « interrompue », reprise jusqu'à la fin ; lecture, terrain 3D et sélection ;
 *  2. même serveur depuis l'origine publique https://bilelkhlif.github.io (page servie par
 *     page.route, requêtes réelles vers la boucle locale) : sans, puis avec l'autorisation
 *     « accès au réseau local » de Chrome ;
 *  3. export statique de l'analyse terminée (python -m football_analysis export), vérifié, puis lu
 *     en mode démo sans serveur. L'export reste dans un dossier temporaire : rien n'est publié.
 *
 * Usage : node tests/visualizer-local-ai.mjs <vidéo> [--rapport fichier.json]
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { REPO_ROOT, startServer } from './serve.mjs';

const ANALYSIS = path.join(REPO_ROOT, 'analysis');
const PYTHON = path.join(ANALYSIS, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const PUBLIC_ORIGIN = 'https://bilelkhlif.github.io';
const STATIC_TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' };

/**
 * Lance le serveur d'analyse sur un port et un dossier d'analyses donnés ; attend qu'il réponde.
 * @param {number} port
 * @param {string} jobs
 * @returns {Promise<import('node:child_process').ChildProcess>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Vérification de bout en bout — serveur d'analyse réel
 */
async function startAnalysisServer(port, jobs) {
  const child = spawn(PYTHON, ['-m', 'football_analysis', 'serve', '--port', String(port), '--jobs', jobs, '--chunk-seconds', '2'],
    { cwd: ANALYSIS, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        return child;
      }
    } catch {
      // serveur pas encore prêt
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  child.kill();
  throw new Error('serveur d\'analyse non démarré');
}

/**
 * Port TCP libre sur la boucle locale.
 * @returns {Promise<number>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Vérification de bout en bout — outillage
 */
async function freePort() {
  const server = await startServer();
  const { port } = new URL(server.url);
  await server.close();
  return Number(port);
}

/**
 * Attend un état de fonctionnement affiché par le visualiseur (document.body.dataset.connection).
 * @param {import('playwright-core').Page} page
 * @param {string} wanted
 * @param {number} [timeout]
 * @returns {Promise<number>} durée d'attente, en millisecondes
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Vérification de bout en bout — outillage
 */
async function waitState(page, wanted, timeout = 900000) {
  const started = Date.now();
  await page.waitForFunction((value) => document.body.dataset.connection === value, wanted, { timeout });
  return Date.now() - started;
}

/**
 * Lit deux secondes de vidéo, puis renvoie personnes annotées, pions posés et sélection d'un joueur.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<object>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Vérification de bout en bout — lecture et terrain 3D
 */
async function playAndSelect(page) {
  try {
    await page.evaluate(async () => {
      const video = document.getElementById('match-video');
      video.currentTime = 0;
      await video.play();
    });
  } catch (error) {
    // Le rejet reste un échec ; ces données distinguent une pause JS d'un décodeur déconnecté.
    const diagnostic = await page.evaluate(() => {
      const video = document.getElementById('match-video');
      return { videoError: video.error ? { code: video.error.code, message: video.error.message } : null,
        gpuLost: window.__matchVisualizer.snapshot().gpuLost,
        status: document.getElementById('job-status').textContent };
    }).catch((failure) => ({ diagnosticUnavailable: failure.message }));
    throw new Error(`lecture refusée : ${error.message} ; diagnostic : ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  await page.waitForFunction(() => document.getElementById('match-video').currentTime > 2, null, { timeout: 30000 });
  await page.evaluate(() => document.getElementById('match-video').pause());
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => window.__matchVisualizer.snapshot());
  const target = state.objects.find((object) => object.box[3] - object.box[1] > 30);
  if (target) {
    const point = await page.evaluate((box) => {
      const app = window.__matchVisualizer;
      const stage = document.getElementById('stage').getBoundingClientRect();
      return { x: stage.left + app.content.x + ((box[0] + box[2]) / 2 / app.store.source.width) * app.content.width,
        y: stage.top + app.content.y + ((box[1] + box[3]) / 2 / app.store.source.height) * app.content.height };
    }, target.box);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(300);
  }
  const after = await page.evaluate(() => window.__matchVisualizer.snapshot());
  return { time: Number(state.currentTime.toFixed(2)), objects: state.objects.length, placed: state.overlay?.placed ?? 0,
    selected: after.selectedId, webgpu: state.webgpu, complete: state.complete };
}

/**
 * Collecte les erreurs de console, en mettant à part celles attendues pendant l'arrêt du serveur.
 * @param {import('playwright-core').Page} page
 * @returns {{errors: string[], downtime: string[], offline: {value: boolean}}}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Vérification de bout en bout — outillage
 */
function watchErrors(page) {
  const log = { errors: [], downtime: [], offline: { value: false } };
  page.on('console', (message) => {
    if (message.type() === 'error') {
      (log.offline.value || /ERR_CONNECTION_REFUSED/.test(message.text()) ? log.downtime : log.errors).push(message.text());
    }
  });
  page.on('pageerror', (error) => log.errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !log.offline.value) {
      log.errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
  return log;
}

/**
 * Parcours complet. Renvoie le rapport (états, durées, mesures) ; lève une erreur au premier échec.
 * @param {string} video
 * @returns {Promise<object>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Vérification de bout en bout — analyse locale réelle
 */
async function run(video) {
  const report = { date: new Date().toISOString(), video: { name: path.basename(video), bytes: readFileSync(video).length }, steps: [] };
  const note = (name, detail) => { report.steps.push({ name, ...detail }); console.log(`✓ ${name} ${JSON.stringify(detail)}`); };
  const work = mkdtempSync(path.join(os.tmpdir(), 'visualiseur-ia-'));
  const jobs = path.join(work, 'jobs');
  const port = await freePort();
  let server = await startAnalysisServer(port, jobs);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
  report.chrome = browser.version();
  try {
    // 1. Page servie par Python : même origine que le serveur.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const log = watchErrors(page);
    await page.goto(`http://127.0.0.1:${port}/visualizer.html`);
    await waitState(page, 'connected', 60000);
    const backLinkHidden = await page.evaluate(() => document.getElementById('back-to-board').hidden);
    if (!backLinkHidden) {
      throw new Error('lien « Tableau tactique » affiché alors que ce serveur ne sert pas index.html');
    }
    note('page servie par Python : mode local, serveur connecté, sans lien vers index.html', { label: await page.textContent('#connection-state') });

    const started = Date.now();
    await page.setInputFiles('#upload-input', video);
    await waitState(page, 'processing', 120000);
    await page.waitForFunction(() => {
      const state = window.__matchVisualizer.snapshot();
      return state.window && state.complete === false;
    }, null, { timeout: 900000 });
    const partial = await page.evaluate(async () => {
      const video = document.getElementById('match-video');
      const seeked = new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
      video.currentTime = 1;
      await seeked;
      await new Promise((resolve) => setTimeout(resolve, 800));
      const state = window.__matchVisualizer.snapshot();
      return { objects: state.objects.length, placed: state.overlay?.placed ?? 0,
        availableUntil: window.__matchVisualizer.store.storage.availableUntil, complete: state.complete };
    });
    if (!partial.objects || partial.complete) {
      throw new Error(`résultats partiels non affichés : ${JSON.stringify(partial)}`);
    }
    note('résultats partiels affichés pendant l’analyse (image à 1 s)', { afterSeconds: Math.round((Date.now() - started) / 1000), ...partial });

    await page.click('#interrupt-analysis');
    await waitState(page, 'interrupted', 300000);
    note('interruption demandée depuis l\'interface : analyse interrompue, reprenable', { label: await page.textContent('#connection-state') });

    await page.click('#resume-analysis');
    await waitState(page, 'processing', 120000);
    await page.waitForTimeout(8000);
    log.offline.value = true;
    server.kill();
    const lost = await waitState(page, 'unavailable', 60000);
    note('serveur arrêté brutalement pendant l\'analyse : état « indisponible »', { detectedAfterMs: lost, status: await page.textContent('#job-status') });

    server = await startAnalysisServer(port, jobs);
    await waitState(page, 'interrupted', 120000);
    log.offline.value = false;
    note('serveur redémarré : analyse retrouvée « interrompue », reprenable', { label: await page.textContent('#connection-state') });

    await page.click('#resume-analysis');
    await waitState(page, 'completed', 900000);
    const jobId = await page.evaluate(() => window.__matchVisualizer.currentAnalysis);
    note('analyse terminée après reprise', { totalSeconds: Math.round((Date.now() - started) / 1000) });
    const status = await (await fetch(`http://127.0.0.1:${port}/api/analyses/${jobId}`)).json();
    report.analysis = { status: status.status, processing: status.metrics?.processing ?? null, identity: status.metrics?.identity ?? null,
      calibration: status.metrics?.calibration ?? null, teams: status.metrics?.teams ?? null };

    const gpuReset = await page.evaluate(() => ({ lost: window.__matchVisualizer.snapshot().gpuLost,
      message: document.getElementById('pitch-view').textContent }));
    if (gpuReset.lost) {
      if (!/rechargez la page/.test(gpuReset.message)) {
        throw new Error(`perte du GPU sans message de reprise : ${JSON.stringify(gpuReset)}`);
      }
      note('GPU réinitialisé après l’arrêt brutal du serveur : message affiché, rechargement demandé', gpuReset);
      await page.goto(`http://127.0.0.1:${port}/visualizer.html?analyse=${encodeURIComponent(jobId)}`);
      await waitState(page, 'completed', 120000);
      await page.waitForFunction(() => window.__matchVisualizer.snapshot().webgpu
        && !window.__matchVisualizer.snapshot().gpuLost, null, { timeout: 30000 });
    }
    const playback = await playAndSelect(page);
    if (!playback.objects || !playback.placed || playback.selected === null || !playback.webgpu) {
      throw new Error(`lecture locale incomplète : ${JSON.stringify(playback)}`);
    }
    note('lecture : annotations, terrain 3D dans la vidéo et sélection d\'un joueur', playback);
    // Seul le message du périphérique perdu, confirmé ci-dessus, est attendu après le hard kill.
    // Le journal complet reste conservé ; tout autre message fait toujours échouer le parcours.
    const expectedGpuErrors = gpuReset.lost ? log.errors.filter((text) => /^Périphérique WebGPU perdu :/.test(text)) : [];
    const unexpectedErrors = log.errors.filter((text) => !expectedGpuErrors.includes(text));
    if (unexpectedErrors.length) {
      throw new Error(`erreurs de console : ${unexpectedErrors.slice(0, 3).join(' | ')}`);
    }
    note('aucune erreur de console hors de l\'arrêt volontaire du serveur et de sa perte GPU confirmée',
      { pendantArret: log.downtime.length, gpuReset: gpuReset.lost, gpuErrors: expectedGpuErrors });
    await context.close();

    // 2. Depuis l'origine publique GitHub Pages, vers la même boucle locale.
    for (const grant of [false, true]) {
      const publicContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      if (grant) {
        await publicContext.grantPermissions(['local-network-access'], { origin: PUBLIC_ORIGIN });
      }
      await publicContext.route(`${PUBLIC_ORIGIN}/footballsimulator/**`, async (route) => {
        const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice('/footballsimulator/'.length);
        try {
          const body = readFileSync(path.join(REPO_ROOT, relative));
          await route.fulfill({ body, contentType: STATIC_TYPES[path.extname(relative)] ?? 'application/octet-stream' });
        } catch {
          await route.fulfill({ status: 404, body: 'introuvable' });
        }
      });
      const publicPage = await publicContext.newPage();
      const publicLog = watchErrors(publicPage);
      await publicPage.goto(`${PUBLIC_ORIGIN}/footballsimulator/visualizer.html?serveur=http://127.0.0.1:${port}/&analyse=${jobId}`);
      if (!grant) {
        await waitState(publicPage, 'unavailable', 60000);
        note('origine publique sans autorisation « réseau local » : serveur indisponible, aide affichée', {
          help: (await publicPage.textContent('#mode-help')).slice(0, 120) });
      } else {
        await waitState(publicPage, 'completed', 60000);
        const remote = await playAndSelect(publicPage);
        if (!remote.objects || !remote.placed || publicLog.errors.length) {
          throw new Error(`origine publique : ${JSON.stringify(remote)} ${publicLog.errors.slice(0, 2).join(' | ')}`);
        }
        note('origine publique avec autorisation : analyse ouverte, vidéo en CORS, terrain 3D', remote);
      }
      await publicContext.close();
    }

    // 3. Export statique de l'analyse réelle, puis lecture en mode démo sans serveur.
    const site = path.join(work, 'site');
    const bundle = path.join(site, 'demo', 'matches', 'analyse-reelle');
    const exported = spawnSync(PYTHON, ['-m', 'football_analysis', 'export', path.join(jobs, jobId, 'tracking.sqlite'), bundle,
      '--id', 'analyse-reelle', '--title', 'Analyse réelle (essai local)', '--catalog', path.join(site, 'demo', 'index.json')],
    { cwd: ANALYSIS, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, encoding: 'utf8' });
    const verified = spawnSync(PYTHON, ['-m', 'football_analysis', 'verify-export', bundle],
      { cwd: ANALYSIS, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, encoding: 'utf8' });
    if (exported.status !== 0 || verified.status !== 0) {
      throw new Error(`export : ${exported.stderr || exported.stdout} ${verified.stderr || verified.stdout}`);
    }
    note('export statique de l\'analyse réelle, vérifié', { export: exported.stdout.trim(), verification: verified.stdout.trim() });
    server.kill();
    for (const entry of ['visualizer.html', 'src', 'assets']) {
      cpSync(path.join(REPO_ROOT, entry), path.join(site, entry), { recursive: true });
    }
    const staticServer = await startServer({ root: site, basePath: '/footballsimulator/' });
    const demoContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const demoPage = await demoContext.newPage();
    const demoLog = watchErrors(demoPage);
    await demoPage.goto(`${staticServer.url}visualizer.html?demo=analyse-reelle`);
    await demoPage.waitForFunction(() => window.__matchVisualizer?.snapshot().window, null, { timeout: 60000 });
    const offline = await playAndSelect(demoPage);
    const banner = await demoPage.textContent('#provenance-banner');
    await demoContext.close();
    await staticServer.close();
    if (!offline.objects || !offline.placed || demoLog.errors.length || !/analyse réelle/.test(banner)) {
      throw new Error(`export lu sans serveur : ${JSON.stringify(offline)} ${demoLog.errors.slice(0, 2).join(' | ')}`);
    }
    note('export réel lu en mode démo, serveur arrêté', { ...offline, banner: banner.slice(0, 60) });
  } finally {
    await browser.close();
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    rmSync(work, { recursive: true, force: true, maxRetries: 5 });
  }
  return report;
}

const args = process.argv.slice(2);
const video = args.find((arg) => !arg.startsWith('--'));
const reportIndex = args.indexOf('--rapport');
if (!video) {
  console.error('Usage : node tests/visualizer-local-ai.mjs <vidéo> [--rapport fichier.json]');
  process.exit(2);
}
try {
  const report = await run(path.resolve(video));
  if (reportIndex >= 0) {
    writeFileSync(args[reportIndex + 1], `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(`\n${report.steps.length} étapes réussies.`);
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
}
