/**
 * Tests de bout en bout des sprints 1 à 4, et du mode test WebGL, exécutés dans Chrome sans interface.
 * Depuis le visualiseur de match, aussi ceux de visualizer.html (tests/visualizer-tests.mjs).
 * Ils rejouent les vérifications consignées dans docs/sprint-1.md, docs/sprint-2.md et
 * docs/sprint-3.md.
 *
 * Prérequis : Node.js 18 ou plus, Google Chrome installé, un processeur graphique compatible
 * WebGPU (l'application n'a pas de repli WebGL), puis « npm install ».
 * Usage : npm run test:e2e, ou npm test pour lancer aussi les tests unitaires
 * (BROWSER_CHANNEL=msedge pour utiliser Microsoft Edge)
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { REPO_ROOT, startServer } from './serve.mjs';
import { readShellVersion } from './shell-version.mjs';
import { FORMATIONS } from '../src/formations.mjs';
import { computeTeamTargets } from '../src/formation-transition.mjs';
import { clickUi, tapUi, installAimTools, openWorkspace } from './workspace-test-helpers.mjs';
import { runWorkspaceTests, verifyArWorkspaces } from './workspace-tests.mjs';
import { runFinalUxReviewTests } from './final-ux-review-tests.mjs';
import { runSafeAreaReviewTests } from './safe-area-review-tests.mjs';
import { runCoachingWorkflowTests } from './coaching-workflow-tests.mjs';
import { runSavedTacticsTests } from './saved-tactics-tests.mjs';
import { runCoachViewTests } from './coach-view-tests.mjs';
import { runServiceWorkerMediaTests } from './service-worker-media-tests.mjs';
import { testMatchVisualizer } from './visualizer-tests.mjs';
import { testVisualizerGpuReset, testVisualizerModes } from './visualizer-modes-tests.mjs';
import { runVisualizerReviewTests } from './visualizer-review-tests.mjs';
import { testRealDemo } from './visualizer-real-demo-tests.mjs';

/** Navigateur utilisé : Chrome par défaut. */
const CHANNEL = process.env.BROWSER_CHANNEL ?? 'chrome';

/**
 * Options de Chrome. Depuis le sprint 3, l'application rend en WebGPU, sur le vrai processeur
 * graphique : le rendu logiciel SwiftShader des sprints 1 et 2 ne fournit pas d'adaptateur WebGPU.
 * --enable-unsafe-webgpu active WebGPU là où Chrome ne l'active pas encore par défaut (Linux).
 */
const LAUNCH_ARGS = ['--enable-unsafe-webgpu'];

/**
 * Script injecté avant la page : enregistre chaque type de contexte demandé à un canvas.
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests de bout en bout — outillage
 */
function recordCanvasContexts() {
  window.__canvasContexts = [];
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function recordedGetContext(type, ...rest) {
    window.__canvasContexts.push(type);
    return getContext.call(this, type, ...rest);
  };
}

/** Types de contexte WebGL : aucun ne doit apparaître dans l'application. */
const WEBGL_CONTEXTS = ['webgl', 'webgl2', 'experimental-webgl'];

const DESKTOP = { viewport: { width: 1280, height: 800 } };
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/** Résultats collectés : { name, status: 'ok' | 'échec' | 'ignoré', detail }. */
const results = [];

/**
 * Enregistre le résultat d'un test.
 * @param {string} name
 * @param {'ok'|'échec'|'ignoré'} status
 * @param {string} [detail]
 * @responsable Bilel Khlif
 * @date 2026-11-09
 * @role Tests de bout en bout — outillage
 */
function record(name, status, detail = '') {
  results.push({ name, status, detail });
  if (process.env.TEST_PROGRESS) console.log(`${status} ${name}${detail ? ` : ${detail}` : ''}`);
}

/**
 * Attend une promesse au plus `ms` millisecondes.
 * @param {Promise<any>} promise
 * @param {number} ms
 * @returns {Promise<any>}
 * @responsable Bilel Khlif
 * @date 2026-11-09
 * @role Tests de bout en bout — outillage
 */
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`délai de ${ms} ms dépassé`)), ms))]);
}

/**
 * Script injecté avant la page : l'aide au premier lancement est réputée vue, pour que les tests
 * qui ne la concernent pas trouvent le terrain dégagé (src/onboarding.mjs).
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests de bout en bout — outillage
 */
function skipOnboarding() {
  try {
    window.localStorage.setItem('football-simulator:aide-vue', '1');
  } catch {
    // stockage refusé : l'aide s'ouvrira, les tests la fermeront
  }
}

/**
 * Ouvre l'application et collecte les erreurs : console, script et réponses HTTP en échec.
 * @param {import('playwright-core').BrowserContext} context
 * @param {string} url
 * @param {{onboarding?: boolean}} [options] vrai pour garder l'aide au premier lancement
 * @returns {Promise<{page: import('playwright-core').Page, errors: string[]}>}
 * @responsable Bilel Khlif
 * @date 2026-11-09
 * @role Tests de bout en bout — outillage
 */
async function openApp(context, url, { onboarding = false } = {}) {
  if (!onboarding) {
    await context.addInitScript(skipOnboarding);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
  await page.goto(url, { waitUntil: 'load' });
  // L'émulation télécharge IWER depuis son CDN : ce délai externe ne mesure pas le démarrage local.
  const startupTimeout = new URL(url).searchParams.has('iwer') ? 60000 : 20000;
  await page.waitForSelector('body.is-ready', { timeout: startupTimeout });
  return { page, errors };
}

/**
 * Vérifie que l'application se charge sans aucune erreur.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {string} label
 * @param {object} contextOptions
 * @responsable Bilel Khlif
 * @date 2026-11-09
 * @role Tests de bout en bout — chargement de l'application
 */
async function testLoading(browser, url, label, contextOptions) {
  const name = `Chargement sans erreur (${label})`;
  const context = await browser.newContext(contextOptions);
  try {
    const { page, errors } = await openApp(context, url);
    await page.waitForTimeout(1000);
    record(name, errors.length ? 'échec' : 'ok', errors.join(' | '));
  } catch (error) {
    record(name, 'échec', error.message);
  } finally {
    await context.close();
  }
}

/**
 * Vérifie les trois formations dans la page, avec les modules réels de l'application :
 * 11 joueurs numérotés de 1 à 11, dans leur moitié, hors du rond central, sans chevauchement.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Bilel Khlif
 * @date 2026-11-09
 * @role Tests de bout en bout — formations
 */
async function testFormations(browser, url) {
  const name = 'Formations : 11 joueurs, numéros 1 à 11, placements valides';
  const context = await browser.newContext(DESKTOP);
  try {
    const { page } = await openApp(context, url);
    const issues = await page.evaluate(async () => {
      const base = new URL('.', location.href).href;
      const { FORMATIONS } = await import(`${base}src/formations.mjs`);
      const { PITCH_LENGTH, PITCH_WIDTH, PLAYER_SIZE } = await import(`${base}src/config.mjs`);
      const tokenDiameter = PLAYER_SIZE.radius * 2.8; // socle du pion : rayon 1,4 × celui du corps
      const found = [];
      for (const [label, formation] of Object.entries(FORMATIONS)) {
        const positions = formation.computePositions();
        const numbers = positions.map((p) => p.number).sort((a, b) => a - b).join(',');
        if (numbers !== '1,2,3,4,5,6,7,8,9,10,11') found.push(`${label} : numéros ${numbers}`);
        if (!positions.every((p) => p.x > 0 && p.x < 0.5 && p.y > 0 && p.y < 1)) found.push(`${label} : joueur hors de sa moitié`);
        const nearest = Math.min(...positions.map((p) => Math.hypot((0.5 - p.x) * 105, (0.5 - p.y) * 68)));
        if (nearest <= 9.15) found.push(`${label} : joueur dans le rond central`);
        let gap = Infinity;
        for (let i = 0; i < positions.length; i += 1) {
          for (let j = i + 1; j < positions.length; j += 1) {
            gap = Math.min(gap, Math.hypot((positions[i].x - positions[j].x) * PITCH_LENGTH, (positions[i].y - positions[j].y) * PITCH_WIDTH));
          }
        }
        if (gap <= tokenDiameter) found.push(`${label} : pions qui se chevauchent`);
      }
      return found;
    });
    record(name, issues.length ? 'échec' : 'ok', issues.join(' | '));
  } catch (error) {
    record(name, 'échec', error.message);
  } finally {
    await context.close();
  }
}

/**
 * Vérifie que la scène est rendue en WebGPU par three.js r187, sans aucun contexte WebGL.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests de bout en bout — rendu WebGPU
 */
async function testWebGpuRendering(browser, url) {
  const name = 'Rendu WebGPU, sans aucun contexte WebGL';
  const context = await browser.newContext(DESKTOP);
  try {
    await context.addInitScript(recordCanvasContexts);
    const { page } = await openApp(context, `${url}?debug`);
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => {
      const app = window.__footballSimulator;
      const badge = document.getElementById('gpu-status');
      return {
        backend: app.renderer.backend.isWebGPUBackend === true,
        fallback: app.renderer._getFallback,
        engine: app.renderer.domElement.dataset.engine,
        contexts: [...new Set(window.__canvasContexts)],
        badge: `${badge.dataset.state} (${badge.dataset.adapter})`,
      };
    });
    const noWebGl = !state.contexts.some((type) => WEBGL_CONTEXTS.includes(type));
    const ok = state.backend && state.fallback === null && state.engine === 'three.js r187 webgpu'
      && state.contexts.includes('webgpu') && noWebGl && state.badge.startsWith('webgpu');
    record(name, ok ? 'ok' : 'échec', `${state.engine}, contextes : ${state.contexts.join(', ')}, badge : ${state.badge}`);
  } catch (error) {
    record(name, 'échec', error.message);
  } finally {
    await context.close();
  }
}

/**
 * Simule un navigateur sans WebGPU : l'application doit afficher un message explicite, sans
 * créer de contexte WebGL de secours.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests de bout en bout — rendu WebGPU (navigateur sans WebGPU)
 */
async function testWithoutWebGpu(browser, url) {
  const name = 'Sans WebGPU : message explicite, aucun repli WebGL';
  const context = await browser.newContext(DESKTOP);
  try {
    await context.addInitScript(recordCanvasContexts);
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true });
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('#loader[data-state="error"]', { timeout: 20000 });
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => ({
      reason: document.getElementById('loader').dataset.reason,
      message: document.getElementById('loader').textContent,
      badge: document.getElementById('gpu-status').dataset.state,
      ready: document.body.classList.contains('is-ready'),
      contexts: [...new Set(window.__canvasContexts)],
      // Pas un repli : l'écran d'erreur ne propose aucun passage vers WebGL.
      webglOffer: Boolean(document.querySelector('#loader a, #loader button, a[href*="webgl"]')),
    }));
    const noWebGl = !state.contexts.some((type) => WEBGL_CONTEXTS.includes(type));
    const ok = state.reason === 'no-api' && state.badge === 'unavailable' && !state.ready && noWebGl && !state.webglOffer
      && state.message.includes('WebGPU');
    record(name, ok ? 'ok' : 'échec', `${state.message} (contextes : ${state.contexts.join(', ') || 'aucun'}, proposition de WebGL : ${state.webglOffer ? 'oui' : 'aucune'})`);
  } catch (error) {
    record(name, 'échec', error.message);
  } finally {
    await context.close();
  }
}

/**
 * Vérifie le mode test WebGL : avec ?webgl seulement, la scène tourne sur le backend WebGL 2 de
 * three.js, et le badge l'annonce comme un mode test. Ce n'est pas un repli : sans ce paramètre,
 * l'application est en WebGPU (testWebGpuRendering), et sans WebGPU elle s'arrête (testWithoutWebGpu).
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests de bout en bout — mode test WebGL
 */
async function testWebGlTestMode(browser, url) {
  const name = 'Mode test WebGL, seulement avec ?webgl : badge « mode test »';
  const context = await browser.newContext(DESKTOP);
  try {
    await context.addInitScript(recordCanvasContexts);
    const { page } = await openApp(context, `${url}?webgl&debug`);
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => {
      const app = window.__footballSimulator;
      const badge = document.getElementById('gpu-status');
      return {
        mode: app.renderMode,
        webgl: app.renderer.backend.isWebGLBackend === true,
        fallback: app.renderer._getFallback,
        badge: `${badge.dataset.state} « ${badge.textContent} »`,
        contexts: [...new Set(window.__canvasContexts)],
      };
    });
    const ok = state.mode === 'webgl-test' && state.webgl && state.fallback === null
      && state.badge === 'webgl-test « Rendu WebGL (mode test) »' && state.contexts.includes('webgl2') && !state.contexts.includes('webgpu');
    record(name, ok ? 'ok' : 'échec', `${state.badge}, contextes : ${state.contexts.join(', ')}`);
  } catch (error) {
    record(name, 'échec', error.message);
  } finally {
    await context.close();
  }
}

/**
 * Vérifie le manifeste de l'application installable : champs exigés par Chrome pour proposer
 * l'installation, et icônes accessibles.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests de bout en bout — manifeste de la PWA
 */
async function testManifest(browser, url) {
  const name = 'Manifeste : application installable';
  const context = await browser.newContext(DESKTOP);
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    const state = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      const manifestUrl = new URL(link.getAttribute('href'), document.baseURI);
      const manifest = await (await fetch(manifestUrl)).json();
      const check = async (image) => {
        const response = await fetch(new URL(image.src, manifestUrl));
        return { ...image, ok: response.ok, contentType: response.headers.get('content-type') };
      };
      const icons = await Promise.all(manifest.icons.map(check));
      const screenshots = await Promise.all((manifest.screenshots ?? []).map(check));
      return { manifest, icons, screenshots };
    });
    const { manifest, icons, screenshots } = state;
    /** Vrai si le manifeste déclare une icône PNG accessible, de la taille donnée. */
    const has = (size) => icons.some((icon) => icon.sizes === size && icon.ok && icon.contentType === 'image/png');
    // Captures « wide » et « narrow » : Chrome les montre dans sa fenêtre d'installation.
    const shot = (form) => screenshots.some((image) => image.form_factor === form && image.ok && image.contentType === 'image/jpeg');
    const ok = Boolean(manifest.name && manifest.short_name && manifest.id) && manifest.start_url === './'
      && manifest.display === 'standalone' && has('192x192') && has('512x512') && icons.some((icon) => icon.purpose === 'maskable')
      && shot('wide') && shot('narrow');
    record(name, ok ? 'ok' : 'échec', `${manifest.name}, ${manifest.display}, ${icons.length} icônes, ${screenshots.length} captures`);
  } catch (error) {
    record(name, 'échec', error.message);
  } finally {
    await context.close();
  }
}

/**
 * Lit la formation en place d'une équipe et l'écart, en centimètres, entre ses joueurs et les
 * places de cette formation (src/formation-transition.mjs). Page ouverte avec ?debug.
 * @param {import('playwright-core').Page} page
 * @param {string} teamId 'blue' ou 'red'
 * @returns {Promise<{formation: string, worstCm: number, chip: string, pressed: string[], animating: boolean, roles: boolean}>}
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests de bout en bout — outillage des formations
 */
function readTeamPlacement(page, teamId) {
  return page.evaluate(async (id) => {
    const base = new URL('.', document.baseURI).href;
    const { computeTeamTargets } = await import(`${base}src/formation-transition.mjs`);
    const { TEAMS } = await import(`${base}src/config.mjs`);
    const app = window.__footballSimulator;
    const formation = app.board.getFormation(id);
    const targets = computeTeamTargets(formation, TEAMS[id].attacksPositiveX);
    const group = app.pitchGroup.getObjectByName(`team-${id}`);
    let worst = 0;
    let roles = true;
    for (const player of group.children) {
      const target = targets.get(player.userData.number);
      worst = Math.max(worst, Math.hypot(player.position.x - target.x, player.position.z - target.z));
      roles = roles && player.userData.role === target.role;
    }
    return {
      formation: formation.name,
      worstCm: Number((worst * 100).toFixed(2)),
      chip: document.getElementById(`formation-${id}`).textContent,
      pressed: [...document.querySelectorAll(`.formation-button[data-team="${id}"][aria-pressed="true"]`)].map((b) => b.textContent),
      animating: app.animator.isAnimating,
      roles,
    };
  }, teamId);
}

/**
 * Attend la fin des déplacements de joueurs.
 * @param {import('playwright-core').Page} page
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests de bout en bout — outillage des formations
 */
function waitForFormationsSettled(page) {
  return page.waitForFunction(() => !window.__footballSimulator.animator.isAnimating, null, { timeout: 5000 });
}

/**
 * Vérifie qu'une équipe est entièrement en place dans la formation attendue, interface comprise.
 * @param {{formation: string, worstCm: number, chip: string, pressed: string[], roles: boolean}} state
 * @param {string} expected nom de la formation
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests de bout en bout — outillage des formations
 */
function isInFormation(state, expected) {
  return state.formation === expected && state.worstCm < 0.01 && state.roles && state.chip === expected
    && state.pressed.length === 1 && state.pressed[0] === expected;
}


/**
 * Lit l'état tactique dans la page : tableau, interaction, historique, flèches 3D et bandeau d'aide.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<object>}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests de bout en bout — outillage de l'interaction tactique
 */
function readTactics(page) {
  return page.evaluate(() => {
    const app = window.__footballSimulator;
    const hint = document.getElementById('hint');
    return {
      snapshot: app.board.snapshot(),
      initial: app.board.isInInitialState(),
      selection: app.interaction.selection,
      mode: app.interaction.mode,
      state: app.interaction.state,
      canUndo: app.history.canUndo,
      canRedo: app.history.canRedo,
      arrowMeshes: app.pitchGroup.getObjectByName('tactical-arrows').children.length,
      ringVisible: app.pitchGroup.getObjectByName('selection-ring').visible,
      previewVisible: app.pitchGroup.getObjectByName('arrow-preview').visible,
      hint: hint.textContent,
      feedback: hint.dataset.feedback ?? null,
      undoDisabled: document.querySelector('[data-action="undo"]').disabled,
      toolbarHidden: document.getElementById('tactical-toolbar').hidden,
    };
  });
}

/**
 * Attend la fin des déplacements, puis renvoie l'écart maximal, en millimètres, entre les objets
 * affichés et leurs places dans le tableau tactique.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<number>}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests de bout en bout — outillage de l'interaction tactique
 */
async function settledSceneGapMm(page) {
  await waitForFormationsSettled(page);
  return page.evaluate(() => {
    const app = window.__footballSimulator;
    let worst = 0;
    for (const teamId of app.board.teamIds) {
      for (const player of app.pitchGroup.getObjectByName(`team-${teamId}`).children) {
        const { x, z } = app.board.getPlayerPosition(teamId, player.userData.number);
        worst = Math.max(worst, Math.hypot(player.position.x - x, player.position.z - z));
      }
    }
    const ball = app.board.getBallPosition();
    const mesh = app.pitchGroup.getObjectByName('ball');
    return Math.max(worst, Math.hypot(mesh.position.x - ball.x, mesh.position.z - ball.z)) * 1000;
  });
}

/**
 * Écart, en millimètres, entre une place du tableau et la place visée.
 * @param {{x: number, z: number}} actual
 * @param {{x: number, z: number}} expected
 * @returns {number}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests de bout en bout — outillage de l'interaction tactique
 */
function gapMm(actual, expected) {
  return Math.hypot(actual.x - expected.x, actual.z - expected.z) * 1000;
}

/**
 * Déroule des étapes dépendantes : une étape en échec fait ignorer les suivantes.
 * @param {Array<[string, () => Promise<[boolean, string]>]>} steps
 * @param {(step: string) => string} label nom complet d'une étape dans le bilan
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests de bout en bout — outillage
 */
async function runSteps(steps, label) {
  let blocked = false;
  for (const [step, run] of steps) {
    if (blocked) {
      record(label(step), 'ignoré', 'étape précédente en échec');
      continue;
    }
    try {
      const [ok, detail] = await run();
      record(label(step), ok ? 'ok' : 'échec', detail);
      blocked = !ok;
    } catch (error) {
      record(label(step), 'échec', error.message.split('\n')[0]);
      blocked = true;
    }
  }
}

/**
 * Changement de formation par les boutons (sprint 4, BF4) : scénario de démonstration du cahier
 * (§4.1, étape 5), toutes les formations pour les deux équipes, et transition animée.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests de bout en bout — changement de formation
 */
async function testFormationButtons(browser, url) {
  const context = await browser.newContext(MOBILE);
  try {
    const { page, errors } = await openApp(context, `${url}?debug`);
    /** Clique sur le bouton d'une formation, pour une équipe. */
    const choose = (teamId, name) => clickUi(page, `.formation-button[data-team="${teamId}"][data-formation="${name}"]`);

    // Le panneau s'ouvre et se ferme par le bouton « Formations ».
    const closedAtStart = await page.evaluate(() => document.getElementById('formation-panel').hidden);
    await clickUi(page, '#formations-toggle');
    const opened = await page.evaluate(() => !document.getElementById('formation-panel').hidden
      && document.getElementById('formations-toggle').getAttribute('aria-expanded') === 'true');
    const buttonCount = await page.locator('.formation-button').count();
    record('Formations : panneau ouvert par « Formations », un bouton par formation et par équipe', closedAtStart && opened
      && buttonCount === 2 * Object.keys(FORMATIONS).length ? 'ok' : 'échec',
      `fermé au départ : ${closedAtStart}, ouvert : ${opened}, ${buttonCount} boutons`);

    // Transition animée : à mi-parcours, les joueurs sont en route.
    await choose('blue', '4-2-3-1');
    await page.waitForTimeout(250);
    const midway = await readTeamPlacement(page, 'blue');
    await waitForFormationsSettled(page);
    const settled = await readTeamPlacement(page, 'blue');
    record('Formations : transition animée vers la nouvelle formation', midway.animating && midway.worstCm > 0.5 && isInFormation(settled, '4-2-3-1') ? 'ok' : 'échec',
      `à 0,25 s : joueur le plus loin à ${midway.worstCm} cm de sa place ; à la fin : ${settled.worstCm} cm`);

    // Toutes les formations, pour les deux équipes.
    const failures = [];
    for (const teamId of ['blue', 'red']) {
      for (const name of ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1']) {
        await choose(teamId, name);
        await waitForFormationsSettled(page);
        const state = await readTeamPlacement(page, teamId);
        if (!isInFormation(state, name)) {
          failures.push(`${teamId} ${name} : ${JSON.stringify(state)}`);
        }
      }
    }
    record('Formations : chaque formation s\'applique aux deux équipes (11 joueurs à leur place)', failures.length ? 'échec' : 'ok',
      failures.length ? failures.join(' | ') : '8 changements, pastilles et boutons à jour');

    // Scénario de démonstration : 4-3-3 pour les Bleus, 4-4-2 pour les Rouges.
    await choose('blue', '4-3-3');
    await choose('red', '4-4-2');
    await waitForFormationsSettled(page);
    const blue = await readTeamPlacement(page, 'blue');
    const red = await readTeamPlacement(page, 'red');
    record('Formations : scénario de démonstration (Bleus 4-3-3, Rouges 4-4-2)', isInFormation(blue, '4-3-3') && isInFormation(red, '4-4-2') && !errors.length ? 'ok' : 'échec',
      `Bleus ${blue.chip}, Rouges ${red.chip}${errors.length ? `, erreurs : ${errors.join(' | ')}` : ''}`);
  } catch (error) {
    record('Formations : changement par les boutons', 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Avec la préférence « réduire les animations », les joueurs vont directement à leur place.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests de bout en bout — changement de formation (animations réduites)
 */
async function testReducedMotion(browser, url) {
  const name = 'Formations : sans animation si l\'utilisateur réduit les animations';
  const context = await browser.newContext({ ...DESKTOP, reducedMotion: 'reduce' });
  try {
    const { page } = await openApp(context, `${url}?debug`);
    await clickUi(page, '#formations-toggle');
    await clickUi(page, '.formation-button[data-team="red"][data-formation="3-5-2"]');
    const state = await readTeamPlacement(page, 'red');
    record(name, !state.animating && isInFormation(state, '3-5-2') ? 'ok' : 'échec', `écart juste après le clic : ${state.worstCm} cm`);
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Bascule attaque / défense dans la page : le bouton « En possession · 2-3-5 » des Bleus place
 * l'équipe dans sa disposition en possession, la pastille l'affiche, puis Ctrl+Z la ramène à la base.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests de bout en bout — bascule attaque / défense
 */
async function testPhaseToggle(browser, url) {
  const name = 'Formations : bascule en possession (4-3-3 → 2-3-5) par son bouton, puis annulation';
  const context = await browser.newContext({ ...DESKTOP, reducedMotion: 'reduce' });
  try {
    const { page, errors } = await openApp(context, `${url}?debug`);
    await clickUi(page, '#formations-toggle');
    const label = await page.textContent('.phase-button[data-team="blue"][data-phase="possession"]');
    await clickUi(page, '.phase-button[data-team="blue"][data-phase="possession"]');
    // Places attendues, calculées ici avec le même module que l'application.
    const expected = [...computeTeamTargets(FORMATIONS['4-3-3'], true, 'possession')];
    const after = await page.evaluate((targets) => {
      const app = window.__footballSimulator;
      const worst = Math.max(...targets.map(([number, { x, z }]) => {
        const p = app.board.getPlayerPosition('blue', number);
        return Math.hypot(p.x - x, p.z - z);
      }));
      return {
        phase: app.board.getPhase('blue'),
        worst,
        chip: document.getElementById('formation-blue')?.textContent ?? '',
        pressed: document.querySelector('.phase-button[data-team="blue"][data-phase="possession"]').getAttribute('aria-pressed'),
      };
    }, expected);
    await page.keyboard.press('Control+z');
    const undone = await page.evaluate(() => window.__footballSimulator.board.getPhase('blue'));
    const problems = [];
    if (!label.includes('2-3-5')) problems.push(`libellé « ${label} »`);
    if (after.phase !== 'possession' || after.worst > 1e-9) problems.push(`phase ${after.phase}, écart ${after.worst}`);
    if (!after.chip.includes('2-3-5')) problems.push(`pastille « ${after.chip} »`);
    if (after.pressed !== 'true') problems.push('bouton non marqué');
    if (undone !== 'base') problems.push(`après Ctrl+Z : ${undone}`);
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || `bouton « ${label} », pastille « ${after.chip} »`);
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Analyse et hors-jeu dans la page : la carte « Analyse tactique » affiche des mesures et la ligne
 * de hors-jeu des deux équipes ; un Bleu passé derrière la défense rouge y apparaît hors-jeu, et le
 * bouton affiche les lignes sur le terrain.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests de bout en bout — analyse tactique et hors-jeu
 */
async function testAnalysisAndOffside(browser, url) {
  const name = 'Analyse tactique : mesures en mètres réels, hors-jeu calculé et lignes affichées sur le terrain';
  const context = await browser.newContext(DESKTOP);
  try {
    const { page, errors } = await openApp(context, `${url}?debug`);
    await clickUi(page, '#formations-toggle');
    await page.evaluate(() => window.__footballSimulator.board.setPlayerPosition('blue', 9, { x: 0.25, z: 0 }));
    await clickUi(page, '#offside-toggle');
    const state = await page.evaluate(() => ({
      width: document.querySelector('#analysis-panel tr[data-metric="width"] td[data-team="blue"]')?.textContent ?? '',
      blue: document.querySelector('[data-offside="blue"]')?.textContent ?? '',
      red: document.querySelector('[data-offside="red"]')?.textContent ?? '',
      visible: window.__footballSimulator.offsideLayer.visible,
      pressed: document.getElementById('offside-toggle').getAttribute('aria-pressed'),
    }));
    const problems = [];
    if (!/^\d+ m$/.test(state.width)) problems.push(`largeur « ${state.width} »`);
    if (!/hors-jeu : n° 9 \(AT\)/.test(state.blue)) problems.push(`Bleus : « ${state.blue} »`);
    if (!/^Rouges en attaque : ligne à \d+ m du but des Bleus/.test(state.red)) problems.push(`Rouges : « ${state.red} »`);
    if (!state.visible || state.pressed !== 'true') problems.push('lignes non affichées');
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || `largeur des Bleus ${state.width} ; ${state.blue}`);
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Tir à la souris : touche T, toucher le ballon d'un attaquant à l'entrée de la surface, puis
 * viser à côté du poteau (refusé, en rouge, avec sa raison) et entre les poteaux (tracé, annulable).
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests de bout en bout — dribble, centre et tir
 */
async function testShotArrow(browser, url) {
  const name = 'Flèches : tir tracé à la souris (touche T) ; à côté du poteau, refus expliqué';
  const context = await browser.newContext(DESKTOP);
  try {
    await context.addInitScript(installAimTools);
    const { page, errors } = await openApp(context, `${url}?debug`);
    // Ballon à 17 m du but rouge, dans l'axe (terrain de 105 m : 0,6 m) ; l'avant-centre bleu juste
    // derrière, côté but, pour ne pas cacher le ballon à la caméra : il en reste le porteur.
    await page.evaluate(() => {
      const { board } = window.__footballSimulator;
      board.setPlayerPosition('blue', 9, { x: 0.218, z: 0.004 });
      board.setBallPosition({ x: 0.2, z: 0.004 });
    });
    await page.waitForTimeout(500);
    await page.keyboard.press('t');
    const pressed = await page.evaluate(() => document.querySelector('[data-mode="shot"]').getAttribute('aria-pressed'));
    const ball = await page.evaluate(() => window.__aim.ball());
    await page.mouse.click(ball.x, ball.y);
    // Points à 1,5 m devant la ligne de but : sur la ligne, le cadre du but les cache.
    const wide = await page.evaluate(() => window.__aim.spot([[0.291, 0.05], [0.291, -0.05]]));
    await page.mouse.click(wide.sx, wide.sy);
    const refused = await readTactics(page);
    // Dans les coins (2,8 m de l'axe, entre les poteaux) : le gardien rouge cache le centre du but.
    const goal = await page.evaluate(() => window.__aim.spot([[0.292, 0.016], [0.292, -0.016], [0.292, 0.012], [0.292, -0.012]]));
    if (!ball || !wide || !goal) throw new Error(`visée impossible : ballon ${Boolean(ball)}, à côté ${Boolean(wide)}, but ${Boolean(goal)}`);
    await page.mouse.click(goal.sx, goal.sy);
    const drawn = await readTactics(page);
    const problems = [];
    if (pressed !== 'true') problems.push('outil Tir non actif après T');
    if (!refused.hint.includes('entre les poteaux') || refused.snapshot.arrows.length) problems.push(`à côté : « ${refused.hint} »`);
    if (drawn.snapshot.arrows.length !== 1 || drawn.snapshot.arrows[0].kind !== 'shot' || !drawn.canUndo) {
      problems.push(`tir : ${JSON.stringify(drawn.snapshot.arrows)} « ${drawn.hint} »`);
    }
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || `refus : « ${refused.hint} » ; puis « ${drawn.hint} »`);
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Équipes dans la page : renommer les Rouges et leur donner un maillot jaune par le panneau ; les
 * pions changent de couleur (gardien distinct), le nom suit dans les formations ; un maillot trop
 * proche de l'adversaire pour un daltonien est refusé avec sa raison ; Ctrl+Z rend l'identité.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests de bout en bout — noms et maillots des équipes
 */
async function testTeamIdentity(browser, url) {
  const name = 'Équipes : nom et maillot par le panneau, gardien distinct, maillot trop proche refusé, annulation';
  const context = await browser.newContext(DESKTOP);
  try {
    const { page, errors } = await openApp(context, `${url}?debug`);
    await clickUi(page, '#formations-toggle');
    await page.fill('[data-team-name="red"]', 'Espérance');
    await page.selectOption('[data-team-kit="red"]', 'jaune');
    await page.waitForTimeout(300);
    const applied = await page.evaluate(() => {
      const app = window.__footballSimulator;
      const mesh = app.teamMeshes[1].meshes[2];
      const players = app.pitchGroup.getObjectByName('team-red').children;
      const colorOf = (number) => {
        const color = mesh.instanceColor ? new mesh.instanceColor.constructor(0) : null;
        const index = players.findIndex((p) => p.userData.number === number);
        return [mesh.instanceColor.getX(index), mesh.instanceColor.getY(index), mesh.instanceColor.getZ(index), color === null];
      };
      return {
        identity: app.board.getIdentity('red'),
        nine: colorOf(9),
        keeper: colorOf(1),
        row: document.querySelector('[data-team-label="red"]')?.textContent ?? '',
      };
    });
    await page.selectOption('[data-team-kit="red"]', 'violet');
    await page.waitForTimeout(300);
    const refused = await page.evaluate(() => ({
      kit: window.__footballSimulator.board.getIdentity('red').kit,
      select: document.querySelector('[data-team-kit="red"]').value,
      hint: document.getElementById('hint').textContent,
    }));
    // Les raccourcis se taisent dans un champ de saisie : l'entraîneur quitte d'abord le champ.
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Control+z');
    const undone = await page.evaluate(() => window.__footballSimulator.board.getIdentity('red').kit);
    const problems = [];
    if (applied.identity.name !== 'Espérance' || applied.identity.kit !== 'jaune') problems.push(`identité ${JSON.stringify(applied.identity)}`);
    if (JSON.stringify(applied.nine) === JSON.stringify(applied.keeper)) problems.push('gardien de la même couleur');
    if (applied.row !== 'Espérance') problems.push(`ligne des formations « ${applied.row} »`);
    if (refused.kit !== 'jaune' || refused.select !== 'jaune' || !/trop proches/.test(refused.hint)) problems.push(`refus : ${JSON.stringify(refused)}`);
    if (undone !== 'rouge') problems.push(`après Ctrl+Z : ${undone}`);
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || `gardien ${applied.identity.goalkeeperKit} ; refus : « ${refused.hint} »`);
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Situations dans la page : le bouton « Charger » de la contre-attaque place les flèches et les
 * images clés, « Lecture » la joue sans erreur, puis Ctrl+Z rend le tableau de départ.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests de bout en bout — bibliothèque de situations
 */
async function testScenarioLibrary(browser, url) {
  const name = 'Situations : charger la contre-attaque en trois passes, la jouer, puis l\'annuler';
  const context = await browser.newContext(DESKTOP);
  try {
    const { page, errors } = await openApp(context, `${url}?debug`);
    const before = await page.evaluate(() => JSON.stringify(window.__footballSimulator.board.snapshot()));
    await page.waitForSelector('[data-load-scenario="contre-attaque-trois-passes"]', { state: 'attached', timeout: 10000 });
    await clickUi(page, '[data-load-scenario="contre-attaque-trois-passes"]');
    const loaded = await page.evaluate(() => ({
      arrows: window.__footballSimulator.board.getArrows().length,
      keyframes: window.__footballSimulator.sequence.length,
      phase: window.__footballSimulator.board.getPhase('blue'),
      hint: document.getElementById('hint').textContent,
    }));
    await clickUi(page, '[data-sequence="play"]');
    await page.waitForTimeout(1500);
    const playing = await page.evaluate(() => window.__footballSimulator.sequencePlayer.state);
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => JSON.stringify(window.__footballSimulator.board.snapshot()));
    const problems = [];
    if (loaded.arrows !== 7 || loaded.keyframes !== 6 || loaded.phase !== 'defense') problems.push(`chargé : ${JSON.stringify(loaded)}`);
    if (!loaded.hint.includes('Contre-attaque en trois passes')) problems.push(`message « ${loaded.hint} »`);
    // Cinq étapes de 1,5 s : après 1,5 s, la lecture est toujours en cours.
    if (playing !== 'playing') problems.push(`lecture : ${playing}`);
    if (after !== before) problems.push('Ctrl+Z ne rend pas le tableau de départ');
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || `7 flèches, 6 images clés ; lecture : ${playing}`);
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Sauvegarde automatique : une tactique modifiée (formation par son bouton, joueur déplacé, image
 * clé) est enregistrée dans le vrai IndexedDB de Chrome peu après le changement, puis rétablie
 * après un vrai rechargement du navigateur, avec un message ; « Réinitialiser » repart toujours des formations de départ.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests de bout en bout — sauvegarde automatique de la tactique
 */
async function testTacticAutosave(browser, url) {
  const name = 'Sauvegarde automatique : tactique enregistrée après un changement, rétablie au rechargement';
  const context = await browser.newContext(DESKTOP);
  try {
    const { page, errors } = await openApp(context, `${url}?debug`);
    await clickUi(page, '#formations-toggle');
    await clickUi(page, '.formation-button[data-team="blue"][data-formation="3-5-2"]');
    const saved = await page.evaluate(async () => {
      const app = window.__footballSimulator;
      app.board.setPlayerPosition('blue', 9, { x: 0.11, z: -0.04 });
      app.sequence.add({ players: app.board.snapshot().players, ball: app.board.getBallPosition() });
      return app.board.snapshot();
    });
    // Vrai rechargement, sans visibilitychange simulé : l'enregistrement qui suit chaque changement
    // (SAVE_DELAY_MS, 400 ms) doit suffire. Le délai couvre ce report et l'écriture IndexedDB.
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('body.is-ready', { timeout: 20000 });
    const after = await page.evaluate(() => ({
      snapshot: window.__footballSimulator.board.snapshot(),
      keyframes: window.__footballSimulator.sequence.length,
      canUndo: window.__footballSimulator.history.canUndo,
      hint: document.getElementById('hint')?.textContent ?? '',
    }));
    const reset = await page.evaluate(() => {
      window.__footballSimulator.board.reset();
      return window.__footballSimulator.board.getFormation('blue').name;
    });
    const problems = [];
    if (JSON.stringify(after.snapshot) !== JSON.stringify(saved)) problems.push('tactique différente après rechargement');
    if (after.keyframes !== 1) problems.push(`${after.keyframes} image(s) clé(s) au lieu de 1`);
    if (after.canUndo) problems.push('le rétablissement est entré dans l\'historique');
    if (!after.hint.includes('Tactique précédente rétablie')) problems.push(`message absent : « ${after.hint} »`);
    if (reset !== '4-3-3') problems.push(`Réinitialiser donne ${reset} au lieu de 4-3-3`);
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || 'formation 3-5-2, n° 9 déplacé et une image clé rétablis');
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Vérifie le badge d'état de l'AR, le Service Worker et le rechargement hors-ligne.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {string} label
 * @responsable Bilel Khlif
 * @date 2026-11-09
 * @role Tests de bout en bout — PWA et hors-ligne
 */
async function testPwa(browser, url, label) {
  const context = await browser.newContext(DESKTOP);
  try {
    const { page } = await openApp(context, url);

    await page.waitForFunction(() => document.getElementById('xr-status')?.dataset.state !== 'checking', null, { timeout: 15000 });
    const state = await page.evaluate(() => document.getElementById('xr-status').dataset.state);
    record(`Badge d'état de l'AR renseigné (${label})`, ['supported', 'unsupported'].includes(state) ? 'ok' : 'échec', `état : ${state}`);

    const active = await withTimeout(page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).active)), 15000).catch(() => false);
    record(`Service Worker actif (${label})`, active ? 'ok' : 'échec');

    // Deuxième chargement : la page est désormais contrôlée par le Service Worker.
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('body.is-ready', { timeout: 20000 });
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' }).catch(() => {});
    const offline = await page.waitForSelector('body.is-ready', { timeout: 15000 }).then(() => true).catch(() => false);
    record(`Rechargement hors-ligne (${label})`, offline ? 'ok' : 'échec');
  } catch (error) {
    record(`Application installable (${label})`, 'échec', error.message);
  } finally {
    await context.close();
  }
}

/** Retard simulé du serveur pour le test du réseau lent : plus long que la patience de l'utilisateur. */
const SLOW_NETWORK_LATENCY_MS = 30000;

/** Temps de lancement maximal accepté sur un réseau très lent, l'application étant en cache. */
const SLOW_NETWORK_MAX_SECONDS = 10;

/**
 * Vérifie le lancement sur un réseau très lent (connexion faible ou instable) : une fois
 * l'application en cache, la page doit être prête en quelques secondes, même quand le serveur
 * met 30 s à répondre. Le Service Worker sert alors le cache au bout de 3 s d'attente.
 * @param {import('playwright-core').Browser} browser
 * @param {{url: string, setLatency: (ms: number) => void}} server serveur réservé à ce test
 * @responsable Bilel Khlif
 * @date 2026-11-12
 * @role Tests de bout en bout — PWA sur réseau lent
 */
async function testSlowNetwork(browser, server) {
  const name = 'Lancement sur réseau très lent, depuis le cache';
  const context = await browser.newContext(MOBILE);
  try {
    const { page } = await openApp(context, server.url);
    await withTimeout(page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).active)), 15000);
    // Deuxième chargement : la page est désormais contrôlée par le Service Worker.
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('body.is-ready', { timeout: 20000 });

    server.setLatency(SLOW_NETWORK_LATENCY_MS);
    const start = Date.now();
    await page.reload({ waitUntil: 'commit' });
    await page.waitForSelector('body.is-ready', { timeout: SLOW_NETWORK_LATENCY_MS });
    const seconds = (Date.now() - start) / 1000;
    const detail = `page prête en ${seconds.toFixed(1)} s, serveur retardé de ${SLOW_NETWORK_LATENCY_MS / 1000} s`;
    record(name, seconds <= SLOW_NETWORK_MAX_SECONDS ? 'ok' : 'échec', detail);
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    server.setLatency(0);
    await context.close();
  }
}

/**
 * Vérifie l'émulateur IWER : avec ?iwer, une session immersive-ar s'ouvre avec local-floor, et
 * la fonctionnalité webgpu qu'exige le rendu WebGPU (sprint 3).
 * Le test est ignoré si le CDN de l'émulateur est injoignable (pas de réseau).
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Bilel Khlif
 * @date 2026-11-09
 * @role Tests de bout en bout — émulateur WebXR
 */
async function testEmulator(browser, url) {
  const name = 'Émulateur IWER : session immersive-ar avec local-floor et webgpu';
  const context = await browser.newContext(DESKTOP);
  try {
    const { page } = await openApp(context, `${url}?iwer`);
    await page.waitForFunction(() => document.getElementById('xr-status')?.dataset.state !== 'checking', null, { timeout: 30000 });
    const state = await page.evaluate(() => document.getElementById('xr-status').dataset.state);
    if (state !== 'emulated') {
      record(name, 'ignoré', `état : ${state} (réseau indisponible ?)`);
      return;
    }
    // requestSession exige une action de l'utilisateur : un clic sur un bouton de test la fournit.
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'test-session';
      button.textContent = 'test';
      button.style.cssText = 'position:fixed;left:0;top:0;z-index:1001;pointer-events:auto';
      document.body.append(button);
      button.addEventListener('click', async () => {
        try {
          const session = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['local-floor', 'webgpu'],
            optionalFeatures: ['hit-test', 'anchors'],
          });
          window.testSession = { ok: true, features: [...(session.enabledFeatures ?? [])] };
          await session.end();
        } catch (error) {
          window.testSession = { ok: false, error: `${error.name} : ${error.message}` };
        }
      });
    });
    await clickUi(page, '#test-session');
    const session = await (await page.waitForFunction(() => window.testSession, null, { timeout: 15000 })).jsonValue();
    const ok = session.ok && ['local-floor', 'webgpu', 'hit-test', 'anchors'].every((feature) => session.features.includes(feature));
    record(name, ok ? 'ok' : 'échec', session.ok ? `fonctionnalités : ${session.features.join(', ')}` : session.error);
  } catch (error) {
    record(name, 'échec', error.message);
  } finally {
    await context.close();
  }
}

/**
 * Parcours AR complet avec l'émulateur IWER, par les boutons de l'application (sprints 2 et 3) :
 * session rendue en WebGPU, réticule sur la table virtuelle, toucher pour poser le terrain, ancre,
 * déplacement du terrain, regard hors de la table, contrôles d'orbite en pause, sorties, et
 * messages d'échec (liaison WebXR/WebGPU absente, caméra refusée).
 * Les objets internes sont lus grâce au paramètre ?debug. Le parcours est ignoré si le CDN de
 * l'émulateur est injoignable ; une étape en échec fait ignorer les suivantes.
 * Le même parcours est rejoué en mode test WebGL (?webgl), la voie des téléphones dont le
 * navigateur bloque WebGPU, sauf l'étape propre à la liaison WebXR/WebGPU.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {{webglTest?: boolean}} [options] webglTest : parcours en mode test WebGL
 * @responsable Bilel Khlif
 * @date 2026-11-10
 * @role Tests de bout en bout — parcours AR complet
 */
async function testArSession(browser, url, { webglTest = false } = {}) {
  /** Nom d'une étape du parcours dans le bilan, précédé du mode testé. */
  const label = (step) => `${webglTest ? 'Mode test WebGL, AR avec IWER' : 'Session AR avec IWER'} : ${step}`;
  const context = await browser.newContext(DESKTOP);
  try {
    await context.addInitScript(installAimTools);
    const { page, errors } = await openApp(context, `${url}?iwer&debug${webglTest ? '&webgl' : ''}`);
    await page.waitForFunction(() => document.getElementById('xr-status')?.dataset.state !== 'checking', null, { timeout: 30000 });
    if (await page.evaluate(() => document.getElementById('xr-status').dataset.state) !== 'emulated') {
      record(label('parcours complet'), 'ignoré', 'émulateur indisponible (réseau ?)');
      return;
    }
    const table = await page.evaluate(async () => (await import(new URL('src/dev-xr-emulation.mjs', document.baseURI).href)).VIRTUAL_TABLE);

    /**
     * Oriente le téléphone émulé : inclinaison vers le bas, puis rotation vers la gauche, en degrés.
     * @param {number} pitchDown
     * @param {number} yawLeft
     */
    const aim = (pitchDown, yawLeft = 0) => page.evaluate(([down, left]) => {
      const hp = -(down * Math.PI) / 360;
      const hy = (left * Math.PI) / 360;
      // Quaternion du lacet multiplié par celui du tangage : q = qy × qp.
      const [sp, cp, sy, cy] = [Math.sin(hp), Math.cos(hp), Math.sin(hy), Math.cos(hy)];
      window.__footballSimulator.xrDevice.quaternion.set(cy * sp, sy * cp, -sy * sp, cy * cp);
    }, [pitchDown, yawLeft]);

    /** Attend un état de la pose du terrain (src/ar-surface.mjs). */
    const waitForPlacementState = (state) => page.waitForFunction(
      (expected) => window.__footballSimulator.placement?.state === expected, state, { timeout: 15000 },
    );

    /** Touche l'écran au centre, hors des boutons : l'émulateur en fait un select WebXR. */
    const tapScreen = () => page.mouse.click(640, 380);

    /** Entre en AR par le bouton, le téléphone émulé visant la table. */
    const enterAr = async () => {
      await aim(35);
      await clickUi(page, '#enter-ar');
      await page.waitForFunction(() => document.body.dataset.xr === 'active', null, { timeout: 15000 });
      await page.waitForFunction(() => Boolean(window.__footballSimulator.placement?.state), null, { timeout: 15000 });
    };

    /** Pose du terrain et du réticule, dans l'espace local-floor. */
    const readPlacement = () => page.evaluate(async () => {
      const THREE = await import('three');
      const { BOARD_LENGTH, BOARD_WIDTH } = await import(new URL('src/config.mjs', document.baseURI).href);
      const app = window.__footballSimulator;
      const reticle = app.scene.getObjectByName('reticle');
      app.pitchGroup.updateWorldMatrix(true, false);
      const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => {
        const ndc = app.pitchGroup.localToWorld(new THREE.Vector3((sx * BOARD_LENGTH) / 2, 0, (sz * BOARD_WIDTH) / 2)).project(app.camera);
        return Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z > -1 && ndc.z < 1;
      }));
      const round = (v) => Number(v.toFixed(3));
      return {
        state: app.placement?.state ?? null,
        anchored: app.placement?.anchored ?? false,
        pitchVisible: app.pitchGroup.visible,
        pitch: app.pitchGroup.position.toArray().map(round),
        rotationDegrees: round(THREE.MathUtils.radToDeg(app.pitchGroup.rotation.y)),
        reticleVisible: reticle.visible,
        reticle: new THREE.Vector3().setFromMatrixPosition(reticle.matrix).toArray().map(round),
        inView: corners.filter(Boolean).length,
        moveButton: !document.getElementById('move-pitch').hidden,
        hint: document.getElementById('hint').textContent,
      };
    });

    /** État de la vue 3D, à comparer avant l'entrée et après la sortie. */
    const readView = () => page.evaluate(() => {
      const app = window.__footballSimulator;
      const { position, quaternion } = app.pitchGroup;
      const visible = (id) => !document.getElementById(id).hidden;
      return {
        presenting: app.renderer.xr.isPresenting,
        background: app.scene.background ? app.scene.background.getHexString() : null,
        tableVisible: app.table.visible,
        pitchAtOrigin: position.length() === 0 && quaternion.w === 1 && app.pitchGroup.visible,
        reticleHidden: !app.scene.getObjectByName('reticle').visible,
        controlsEnabled: app.controls.enabled,
        fov: app.camera.fov,
        buttons: { enter: visible('enter-ar'), exit: visible('exit-ar'), reset: visible('reset-view'), move: visible('move-pitch') },
        enterDisabled: document.getElementById('enter-ar').disabled,
        hint: document.getElementById('hint').textContent,
      };
    });

    /** Compte les appels à controls.update() et renderer.render() pendant une durée donnée. */
    const countLoopCalls = async (ms) => {
      await page.evaluate(() => {
        const app = window.__footballSimulator;
        if (!window.__loopCounts) {
          const update = app.controls.update.bind(app.controls);
          app.controls.update = (...args) => { window.__loopCounts.updates += 1; return update(...args); };
          const render = app.renderer.render;
          app.renderer.render = function countedRender(...args) { window.__loopCounts.renders += 1; return render.apply(this, args); };
        }
        window.__loopCounts = { updates: 0, renders: 0 };
      });
      await page.waitForTimeout(ms);
      return page.evaluate(() => ({ ...window.__loopCounts }));
    };

    /** Égalité de deux nombres, à une tolérance près. */
    const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
    const initialView = await readView();
    /** Vrai si la vue 3D est revenue exactement à son état d'avant l'entrée en AR. */
    const sameAsInitial = (view) => JSON.stringify(view) === JSON.stringify(initialView);
    /** Ce qui diffère de la vue de départ, pour le bilan d'un échec. */
    const viewDiff = (view) => Object.keys(view).filter((key) => JSON.stringify(view[key]) !== JSON.stringify(initialView[key]))
      .map((key) => `${key} : ${JSON.stringify(initialView[key])} → ${JSON.stringify(view[key])}`).join(' ; ');

    const steps = [
      [webglTest ? 'entrée par « Entrer en AR », session rendue par une couche WebGL' : 'entrée par « Entrer en AR », session rendue en WebGPU', async () => {
        await enterAr();
        const state = await page.evaluate(() => {
          const app = window.__footballSimulator;
          const session = app.renderer.xr.getSession();
          const visible = (id) => !document.getElementById(id).hidden;
          return {
            presenting: app.renderer.xr.isPresenting,
            webgpu: session.enabledFeatures.includes('webgpu') && app.renderer.backend.isWebGPUBackend,
            webgl: !session.enabledFeatures.includes('webgpu') && app.renderer.backend.isWebGLBackend === true,
            layers: session.renderState.layers.length,
            baseLayer: Boolean(session.renderState.baseLayer),
            space: Boolean(app.renderer.xr.getReferenceSpace()),
            tableHidden: !app.table.visible,
            transparent: app.scene.background === null,
            buttons: visible('exit-ar') && !visible('enter-ar') && !visible('reset-view'),
          };
        });
        const rendering = webglTest ? state.webgl && state.baseLayer : state.webgpu && state.layers === 1;
        const ok = state.presenting && rendering && state.space && state.tableHidden && state.transparent && state.buttons;
        const detail = webglTest
          ? `WebGL : ${state.webgl}, couche XRWebGLLayer : ${state.baseLayer}`
          : `WebGPU : ${state.webgpu}, couches de projection : ${state.layers}`;
        return [ok, `${detail}, table masquée : ${state.tableHidden}, fond transparent : ${state.transparent}`];
      }],
      ['réticule sur la table détectée', async () => {
        await waitForPlacementState('surface');
        const state = await readPlacement();
        const onTable = near(state.reticle[1], table.height, 0.001) && near(state.reticle[2], table.centerZ, 0.05);
        const toggleHidden = await page.evaluate(() => document.getElementById('formations-toggle').disabled);
        const ok = state.reticleVisible && onTable && !state.pitchVisible && state.hint.includes('Touchez') && toggleHidden;
        return [ok, `réticule en (${state.reticle.join(' ; ')}), terrain masqué : ${!state.pitchVisible}, espace Formations bloqué avant la pose : ${toggleHidden}`];
      }],
      ['toucher : terrain posé sur la table, puis ancré', async () => {
        const reticle = (await readPlacement()).reticle;
        await tapScreen();
        await waitForPlacementState('placed');
        await page.waitForFunction(() => window.__footballSimulator.placement.anchored, null, { timeout: 5000 });
        const state = await readPlacement();
        const onReticle = near(state.pitch[0], reticle[0], 0.002) && near(state.pitch[2], reticle[2], 0.002)
          && near(state.pitch[1], table.height + 0.008, 0.002);
        const ok = state.anchored && state.pitchVisible && onReticle && state.inView === 4 && !state.reticleVisible && state.moveButton;
        return [ok, `terrain en (${state.pitch.join(' ; ')}), ancré : ${state.anchored}, ${state.inView} coins sur 4 à l'écran`];
      }],
      ['contrôles d\'orbite en pause', async () => {
        const counts = await countLoopCalls(1000);
        return [counts.updates === 0 && counts.renders > 0, `${counts.updates} mise(s) à jour des contrôles pour ${counts.renders} images`];
      }],
      ['formations sur le terrain posé : joueurs replacés, terrain toujours posé', async () => {
        const toggleVisible = await page.evaluate(() => !document.getElementById('formations-toggle').hidden);
        await clickUi(page, '#formations-toggle');
        await clickUi(page, '.formation-button[data-team="blue"][data-formation="4-2-3-1"]');
        await clickUi(page, '.formation-button[data-team="red"][data-formation="3-5-2"]');
        await waitForFormationsSettled(page);
        const blue = await readTeamPlacement(page, 'blue');
        const red = await readTeamPlacement(page, 'red');
        const stillPlaced = await page.evaluate(() => window.__footballSimulator.placement.state === 'placed');
        // Retour au scénario de démonstration, panneau fermé, pour les étapes suivantes.
        await clickUi(page, '.formation-button[data-team="blue"][data-formation="4-3-3"]');
        await clickUi(page, '.formation-button[data-team="red"][data-formation="4-4-2"]');
        await waitForFormationsSettled(page);
        await clickUi(page, '#formations-toggle');
        const ok = toggleVisible && stillPlaced && isInFormation(blue, '4-2-3-1') && isInFormation(red, '3-5-2');
        return [ok, `bouton visible : ${toggleVisible}, Bleus ${blue.chip} (${blue.worstCm} cm), Rouges ${red.chip} (${red.worstCm} cm), terrain toujours posé : ${stillPlaced}`];
      }],
      ['« Déplacer le terrain », puis nouvelle pose face à l\'utilisateur', async () => {
        await clickUi(page, '#move-pitch');
        const lifted = await readPlacement();
        await aim(35, 25); // regard tourné de 25° vers la gauche
        await waitForPlacementState('surface');
        await tapScreen();
        await waitForPlacementState('placed');
        await page.waitForFunction(() => window.__footballSimulator.placement.anchored, null, { timeout: 5000 });
        const state = await readPlacement();
        // Point visé à gauche : le terrain tourne de 25° pour présenter sa longueur à l'utilisateur.
        const ok = !lifted.pitchVisible && !lifted.anchored && state.pitch[0] < -0.3 && near(state.rotationDegrees, 25, 1) && state.anchored;
        return [ok, `retiré : ${!lifted.pitchVisible}, nouvelle pose (${state.pitch.join(' ; ')}), rotation ${state.rotationDegrees}°`];
      }],
      // Sprint 5 : interaction tactique sur ce terrain déplacé et tourné par son ancre.
      ['joueur touché sur le terrain tourné : sélectionné par le rayon de la source d\'entrée (targetRaySpace)', async () => {
        const toolbarVisible = await page.evaluate(() => !document.getElementById('tactical-toolbar').hidden);
        const target = await page.evaluate(() => window.__aim.player('blue'));
        if (!target) {
          return [false, 'aucun joueur bleu visible'];
        }
        await page.mouse.click(target.x, target.y);
        await page.waitForFunction(() => window.__footballSimulator.interaction.selection !== null, null, { timeout: 5000 });
        const state = await readTactics(page);
        const placed = await page.evaluate(() => window.__footballSimulator.placement.state === 'placed');
        const ok = toolbarVisible && placed && state.selection?.teamId === 'blue' && state.selection?.number === target.number;
        return [ok, `barre d'outils visible : ${toolbarVisible}, sélection : n° ${state.selection?.number} (visé : n° ${target.number}), terrain toujours posé : ${placed}`];
      }],
      ['joueur déplacé en AR : place exacte dans le repère du terrain tourné', async () => {
        const spot = await page.evaluate(() => window.__aim.spot([[-0.12, 0.19], [-0.2, 0.18], [-0.05, 0.19], [-0.15, -0.19], [0.05, 0.17]]));
        if (!spot) {
          return [false, 'aucune place libre visible'];
        }
        const { number } = (await readTactics(page)).selection;
        await page.mouse.click(spot.sx, spot.sy);
        await page.waitForFunction(() => window.__footballSimulator.interaction.selection === null, null, { timeout: 5000 });
        const sceneGap = await settledSceneGapMm(page);
        const state = await readTactics(page);
        const gap = gapMm(state.snapshot.players[`blue:${number}`], spot);
        const rotation = await page.evaluate(() => (window.__footballSimulator.pitchGroup.rotation.y * 180) / Math.PI);
        return [gap < 2 && sceneGap < 0.01, `visé (${spot.x} ; ${spot.z}) sur le terrain tourné de ${rotation.toFixed(1)}°, placé à ${gap.toFixed(3)} mm`];
      }],
      ['flèche de passe en AR : départ au ballon, aperçu guidé par la source d\'entrée, puis « Annuler »', async () => {
        await clickUi(page, '[data-mode="pass"]');
        const ball = await page.evaluate(() => window.__aim.ball());
        const start = await page.evaluate(() => window.__footballSimulator.board.getBallPosition());
        const end = await page.evaluate(() => window.__aim.spot([[0.12, -0.08], [0.15, 0.1], [0.08, 0.15], [0.2, 0]]));
        if (!ball || !end) {
          return [false, 'ballon ou arrivée cachés'];
        }
        await page.mouse.click(ball.x, ball.y);
        await page.waitForFunction(() => window.__footballSimulator.interaction.state === 'arrow-end', null, { timeout: 5000 });
        await page.mouse.move(end.sx, end.sy);
        await page.waitForFunction(() => window.__footballSimulator.pitchGroup.getObjectByName('arrow-preview').visible, null, { timeout: 5000 });
        await page.mouse.click(end.sx, end.sy);
        await page.waitForFunction(() => window.__footballSimulator.board.getArrows().length === 1, null, { timeout: 5000 });
        const drawn = await readTactics(page);
        await clickUi(page, '[data-action="undo"]');
        const undone = await readTactics(page);
        await clickUi(page, '[data-mode="move"]');
        const [arrow] = drawn.snapshot.arrows;
        const ok = arrow.kind === 'pass' && gapMm(arrow.from, start) < 2 && gapMm(arrow.to, end) < 2 && drawn.arrowMeshes === 1
          && undone.arrowMeshes === 0 && undone.snapshot.arrows.length === 0;
        return [ok, `départ à ${gapMm(arrow.from, start).toFixed(3)} mm, arrivée à ${gapMm(arrow.to, end).toFixed(3)} mm ; annulée : ${undone.arrowMeshes === 0}`];
      }],
      ['DOM Overlay : un toucher sur la barre d\'outils n\'atteint pas la scène (beforexrselect)', async () => {
        await page.evaluate(() => {
          const input = window.__footballSimulator.tacticalInput;
          window.__selects = 0;
          const handleSelect = input.handleSelect.bind(input);
          input.handleSelect = (event) => {
            window.__selects += 1;
            return handleSelect(event);
          };
        });
        const before = await readTactics(page);
        // Entre les deux groupes de la barre (outils, historique) : la barre, mais aucun bouton.
        const box = await page.locator('#tactical-toolbar').boundingBox();
        const modes = await page.locator('#tactical-toolbar .toolbar__group--modes').boundingBox();
        const history = await page.locator('#tactical-toolbar .toolbar__group--history').boundingBox();
        await page.mouse.click(box.x + 3, (modes.y + modes.height + history.y) / 2);
        await page.waitForTimeout(400);
        const blocked = await page.evaluate(() => window.__selects);
        // Contrôle : un toucher sur le gazon, lui, atteint bien la scène.
        const spot = await page.evaluate(() => window.__aim.spot([[0.05, 0.05], [-0.05, -0.05], [0.1, 0]]));
        await page.mouse.click(spot.sx, spot.sy);
        await page.waitForFunction(() => window.__selects > 0, null, { timeout: 5000 });
        const after = await readTactics(page);
        const ok = blocked === 0 && JSON.stringify(after.snapshot) === JSON.stringify(before.snapshot);
        return [ok, `select reçus après un toucher sur la barre : ${blocked} ; après un toucher sur le gazon : 1`];
      }],
      // Sprint 6 : séquence animée (BF9) sur le terrain ancré.
      ['espaces de travail et DOM Overlay : navigation sans déplacement ni sélection accidentelle', async () => verifyArWorkspaces(page, { capture: !webglTest && Boolean(process.env.WORKSPACE_CAPTURE_AR) })],
      ['séquence animée en AR sur le terrain tourné : lecture dans le repère du terrain, terrain toujours ancré', async () => {
        const toggleVisible = await page.evaluate(() => !document.getElementById('sequence-toggle').hidden);
        const { start, to } = await page.evaluate(async () => {
          const { AddKeyframeCommand, MovePlayerCommand } = await import(new URL('src/commands.mjs', document.baseURI).href);
          const app = window.__footballSimulator;
          app.history.execute(new AddKeyframeCommand({ sequence: app.sequence, board: app.board }));
          const from = app.board.getPlayerPosition('red', 10);
          const target = { x: from.x - 0.08, z: from.z + 0.03 };
          app.history.execute(new MovePlayerCommand({ board: app.board, teamId: 'red', number: 10, to: target }));
          app.history.execute(new AddKeyframeCommand({ sequence: app.sequence, board: app.board }));
          return { start: from, to: target };
        });
        await waitForFormationsSettled(page);
        /** Pose du terrain, place affichée du n° 10 rouge, et état de la pose. */
        const read = () => page.evaluate(() => {
          const app = window.__footballSimulator;
          const ten = app.pitchGroup.getObjectByName('player-red-10');
          return {
            pose: [...app.pitchGroup.position.toArray(), ...app.pitchGroup.quaternion.toArray()],
            ten: { x: ten.position.x, z: ten.position.z },
            placed: app.placement.state === 'placed' && app.placement.anchored,
            state: app.sequencePlayer.state,
          };
        });
        const before = await read();
        await clickUi(page, '#sequence-toggle');
        await clickUi(page, '[data-sequence="play"]');
        await page.waitForTimeout(700);
        const middle = await read();
        await page.waitForFunction(() => window.__footballSimulator.sequencePlayer.state === 'paused', null, { timeout: 8000 });
        const after = await read();
        await clickUi(page, '#sequence-toggle');
        const between = middle.ten.x < start.x && middle.ten.x > to.x;
        const exact = Math.abs(after.ten.x - to.x) < 1e-12 && Math.abs(after.ten.z - to.z) < 1e-12;
        const anchored = JSON.stringify(after.pose) === JSON.stringify(before.pose) && after.placed && middle.placed;
        return [toggleVisible && between && exact && anchored,
          `bouton « Séquence » visible : ${toggleVisible}, à mi-lecture entre les deux images : ${between}, fin exacte : ${exact}, pose du terrain inchangée et ancrée : ${anchored}`];
      }],
      ['interface AR étroite et en paysage : outils et sortie accessibles, panneaux défilants', async () => {
        const layouts = [];
        try {
          for (const [width, height] of [[320, 568], [568, 320]]) {
            await page.setViewportSize({ width, height });
            await clickUi(page, '#formations-toggle');
            layouts.push(await page.evaluate(readControlsLayout));
            await clickUi(page, '#sequence-toggle');
            layouts.push(await page.evaluate(readControlsLayout));
            await clickUi(page, '#sequence-toggle');
          }
        } finally {
          await page.setViewportSize(DESKTOP.viewport);
        }
        const failures = layouts.flatMap((layout) => layout.failures);
        return [failures.length === 0 && layouts.every((layout) => !layout.overflow),
          `320 × 568 et 568 × 320 ; commandes masquées ou trop petites : ${failures.join(', ') || 'aucune'}`];
      }],
      ['regard hors de la table : pas de réticule, et un toucher ne pose rien', async () => {
        await clickUi(page, '#move-pitch');
        await aim(0); // regard horizontal : le rayon ne rencontre aucune surface
        await waitForPlacementState('searching');
        await tapScreen();
        await page.waitForTimeout(500);
        const state = await readPlacement();
        const ok = state.state === 'searching' && !state.reticleVisible && !state.pitchVisible && state.hint.includes('Visez');
        return [ok, `état : ${state.state}, réticule visible : ${state.reticleVisible}, terrain visible : ${state.pitchVisible}`];
      }],
      ['sortie par « Quitter l\'AR » et vue 3D restaurée', async () => {
        await clickUi(page, '#exit-ar');
        await page.waitForFunction(() => document.body.dataset.xr === 'inactive', null, { timeout: 15000 });
        const view = await readView();
        const counts = await countLoopCalls(800);
        return [sameAsInitial(view) && counts.updates > 0,
          `vue identique au départ : ${sameAsInitial(view) || viewDiff(view)}, contrôles relancés : ${counts.updates > 0}`];
      }],
      ['fin de session : saisie AR arrêtée, tactique gardée pour la vue 3D', async () => {
        const state = await page.evaluate(() => ({
          inputStopped: window.__footballSimulator.tacticalInput === null,
          interaction: window.__footballSimulator.interaction.state,
          toolbar: !document.getElementById('tactical-toolbar').hidden,
        }));
        const tactics = await readTactics(page);
        const ok = state.inputStopped && state.interaction === 'idle' && state.toolbar && !tactics.initial;
        return [ok, `saisie AR arrêtée : ${state.inputStopped}, interaction : ${state.interaction}, joueur déplacé en AR gardé : ${!tactics.initial}`];
      }],
      ['nouvelle entrée, puis sortie par le système', async () => {
        await enterAr();
        await waitForPlacementState('surface');
        await page.evaluate(() => window.__footballSimulator.renderer.xr.getSession().end());
        await page.waitForFunction(() => document.body.dataset.xr === 'inactive', null, { timeout: 15000 });
        const view = await readView();
        return [sameAsInitial(view), `vue identique au départ : ${sameAsInitial(view)}`];
      }],
      // Sprint 6 : entrées et sorties répétées, sans fuite de ressources.
      ['cinq entrées et sorties de suite, terrain posé à chaque fois : ressources du processeur graphique stables', async () => {
        /** Ressources que three.js a créées sur le processeur graphique. */
        const memory = () => page.evaluate(() => {
          const { geometries, textures, renderTargets } = window.__footballSimulator.renderer.info.memory;
          return { geometries, textures, renderTargets };
        });
        const samples = [];
        for (let cycle = 0; cycle < 5; cycle += 1) {
          await enterAr();
          await waitForPlacementState('surface');
          await tapScreen();
          await waitForPlacementState('placed');
          await clickUi(page, '#exit-ar');
          await page.waitForFunction(() => document.body.dataset.xr === 'inactive', null, { timeout: 15000 });
          await page.waitForTimeout(300);
          samples.push(await memory());
        }
        const [first, last] = [samples[0], samples.at(-1)];
        const stable = last.geometries <= first.geometries && last.textures <= first.textures && last.renderTargets <= first.renderTargets;
        const released = await page.evaluate(() => window.__footballSimulator.tacticalInput === null && window.__footballSimulator.placement === null);
        return [stable && released, `après la 1re sortie : ${JSON.stringify(first)} ; après la 5e : ${JSON.stringify(last)} ; session lâchée : ${released}`];
      }],
      ['sans liaison WebXR/WebGPU : réglage de Chrome indiqué, aucune session', async () => {
        await page.evaluate(() => {
          window.__savedBinding = window.XRGPUBinding;
          delete window.XRGPUBinding;
          window.__sessionRequests = 0;
          const requestSession = navigator.xr.requestSession.bind(navigator.xr);
          navigator.xr.requestSession = (...args) => { window.__sessionRequests += 1; return requestSession(...args); };
        });
        await clickUi(page, '#enter-ar');
        await page.waitForSelector('#ar-message:not([hidden])', { timeout: 15000 });
        const state = await page.evaluate(() => ({
          message: document.getElementById('ar-message').textContent,
          copyButton: !document.getElementById('copy-flag').hidden,
          requests: window.__sessionRequests,
          xr: document.body.dataset.xr,
        }));
        await page.evaluate(() => {
          window.XRGPUBinding = window.__savedBinding;
          document.getElementById('ar-message').hidden = true;
        });
        const ok = state.message.includes('chrome://flags/#webxr-webgpu-binding') && state.copyButton && state.requests === 0 && state.xr === 'inactive';
        return [ok, state.message];
      }],
      ['échec d\'entrée signalé (caméra refusée)', async () => {
        await page.evaluate(() => {
          navigator.xr.requestSession = () => Promise.reject(new DOMException('Refus simulé', 'NotAllowedError'));
        });
        await clickUi(page, '#enter-ar');
        await page.waitForSelector('#ar-message:not([hidden])', { timeout: 15000 });
        const state = await page.evaluate(() => ({
          message: document.getElementById('ar-message').textContent,
          xr: document.body.dataset.xr,
          enterUsable: !document.getElementById('enter-ar').hidden && !document.getElementById('enter-ar').disabled,
        }));
        return [state.xr === 'inactive' && state.enterUsable && state.message.includes('caméra'), state.message];
      }],
    ];

    // La liaison WebXR/WebGPU ne concerne pas le mode test WebGL.
    const modeSteps = webglTest ? steps.filter(([step]) => !step.startsWith('sans liaison WebXR/WebGPU')) : steps;
    let blocked = false;
    for (const [step, run] of modeSteps) {
      if (blocked) {
        record(label(step), 'ignoré', 'étape précédente en échec');
        continue;
      }
      try {
        const [ok, detail] = await run();
        record(label(step), ok ? 'ok' : 'échec', detail);
        blocked = !ok;
      } catch (error) {
        record(label(step), 'échec', error.message.split('\n')[0]);
        blocked = true;
      }
    }
    record(label(webglTest ? 'aucune erreur dans la console' : 'aucune erreur dans la console (WebGPU compris)'), errors.length ? 'échec' : 'ok', errors.slice(0, 3).join(' | '));
  } catch (error) {
    record(label('parcours complet'), 'échec', error.message);
  } finally {
    await context.close();
  }
}

/**
 * Interaction tactique en vue 3D (sprint 5, BF5 à BF8) : sélection et déplacement d'un joueur et
 * du ballon par raycasting, annuler et rétablir, clic refusé hors du terrain, flèche de passe avec
 * aperçu, formation annulée, réinitialisation ; toujours en WebGPU, sans erreur.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests de bout en bout — interaction tactique en vue 3D
 */
async function testTacticalBoard(browser, url) {
  /** Nom d'une étape dans le bilan. */
  const label = (step) => `Interaction tactique en vue 3D : ${step}`;
  const context = await browser.newContext(DESKTOP);
  try {
    await context.addInitScript(recordCanvasContexts);
    await context.addInitScript(installAimTools);
    const { page, errors } = await openApp(context, `${url}?debug`);
    const moved = { number: null, place: null };
    const steps = [
      ['joueur sélectionné par raycasting (clic sur son pion), anneau de sélection et aide', async () => {
        const target = await page.evaluate(() => window.__aim.player('blue'));
        if (!target) {
          return [false, 'aucun joueur bleu visible'];
        }
        await page.mouse.click(target.x, target.y);
        // L'anneau suit la sélection à l'image suivante (tâche de la boucle de rendu).
        await page.waitForFunction(() => window.__footballSimulator.pitchGroup.getObjectByName('selection-ring').visible, null, { timeout: 5000 })
          .catch(() => {});
        const state = await readTactics(page);
        moved.number = target.number;
        const ok = state.selection?.teamId === 'blue' && state.selection?.number === target.number && state.ringVisible
          && state.hint.includes('sélectionné');
        return [ok, `n° ${target.number} des Bleus, anneau : ${state.ringVisible}, aide : « ${state.hint} »`];
      }],
      ['clic sur le gazon : le joueur y va, au millimètre, par une commande annulable', async () => {
        const spot = await page.evaluate(() => window.__aim.spot([[-0.12, 0.19], [-0.2, 0.19], [-0.05, 0.18], [-0.15, -0.19]]));
        if (!spot) {
          return [false, 'aucune place libre visible'];
        }
        await page.mouse.click(spot.sx, spot.sy);
        const sceneGap = await settledSceneGapMm(page);
        const state = await readTactics(page);
        moved.place = state.snapshot.players[`blue:${moved.number}`];
        const ok = gapMm(moved.place, spot) < 1 && sceneGap < 0.01 && state.selection === null && state.canUndo
          && !state.undoDisabled && state.feedback === 'success';
        return [ok, `visé (${spot.x} ; ${spot.z}), placé à ${gapMm(moved.place, spot).toFixed(3)} mm, affiché à ${sceneGap.toFixed(4)} mm de sa place`];
      }],
      ['« Annuler » puis « Rétablir », par la barre d\'outils', async () => {
        await clickUi(page, '[data-action="undo"]');
        await settledSceneGapMm(page);
        const undone = await readTactics(page);
        await clickUi(page, '[data-action="redo"]');
        const sceneGap = await settledSceneGapMm(page);
        const redone = await readTactics(page);
        const ok = undone.initial && undone.canRedo && gapMm(redone.snapshot.players[`blue:${moved.number}`], moved.place) === 0 && sceneGap < 0.01;
        return [ok, `annulé : état de départ ${undone.initial} ; rétabli : place exacte, affichée à ${sceneGap.toFixed(4)} mm`];
      }],
      ['ballon sélectionné puis déplacé', async () => {
        const ball = await page.evaluate(() => window.__aim.ball());
        if (!ball) {
          return [false, 'ballon caché'];
        }
        await page.mouse.click(ball.x, ball.y);
        const selected = (await readTactics(page)).selection;
        const spot = await page.evaluate(() => window.__aim.spot([[0.04, 0.19], [0.1, 0.19], [0.02, 0.15], [0.05, -0.19]]));
        await page.mouse.click(spot.sx, spot.sy);
        await settledSceneGapMm(page);
        const state = await readTactics(page);
        const ok = selected?.type === 'ball' && gapMm(state.snapshot.ball, spot) < 1;
        return [ok, `sélection : ${selected?.type}, ballon placé à ${gapMm(state.snapshot.ball, spot).toFixed(3)} mm du point visé`];
      }],
      ['clic hors du terrain : refusé, avec un retour, et rien ne bouge', async () => {
        const target = await page.evaluate(() => window.__aim.player('red'));
        await page.mouse.click(target.x, target.y);
        const before = await readTactics(page);
        const outside = await page.evaluate(async () => {
          const context = await window.__aim.context();
          for (const [x, z] of [[0, -0.3], [0.2, -0.3], [-0.2, -0.3], [0, 0.3], [0.4, 0]]) {
            const screen = window.__aim.toScreen(context, context.app.pitchGroup.localToWorld(new context.THREE.Vector3(x, 0, z)));
            if (screen.usable) {
              return screen;
            }
          }
          return null;
        });
        if (!outside) {
          return [false, 'aucun point hors du terrain visible'];
        }
        await page.mouse.click(outside.x, outside.y);
        const after = await readTactics(page);
        await page.mouse.click(target.x, target.y); // désélection
        const ok = after.feedback === 'invalid' && after.hint.includes('Hors du terrain')
          && JSON.stringify(after.snapshot) === JSON.stringify(before.snapshot) && after.selection?.number === target.number;
        return [ok, `aide : « ${after.hint} », sélection gardée : n° ${after.selection?.number}`];
      }],
      ['flèche de passe : départ au ballon, aperçu au survol, arrivée au point visé', async () => {
        await clickUi(page, '[data-mode="pass"]');
        const ball = await page.evaluate(() => window.__aim.ball());
        await page.mouse.click(ball.x, ball.y);
        const spot = await page.evaluate(() => window.__aim.spot([[0.1, 0.12], [0.15, -0.15], [0.05, 0.18], [0.2, 0.1]]));
        await page.mouse.move(spot.sx, spot.sy);
        await page.waitForFunction(() => window.__footballSimulator.pitchGroup.getObjectByName('arrow-preview').visible, null, { timeout: 5000 });
        await page.mouse.click(spot.sx, spot.sy);
        const state = await readTactics(page);
        const [arrow] = state.snapshot.arrows;
        const ok = state.arrowMeshes === 1 && arrow?.kind === 'pass' && gapMm(arrow.from, state.snapshot.ball) === 0 && gapMm(arrow.to, spot) < 1
          && state.state === 'arrow-start';
        return [ok, `départ au ballon, arrivée à ${gapMm(arrow.to, spot).toFixed(3)} mm du point visé, flèches 3D : ${state.arrowMeshes}`];
      }],
      ['changement de formation annulé : le joueur déplacé à la main retrouve sa place exacte', async () => {
        await clickUi(page, '[data-mode="move"]');
        await clickUi(page, '#formations-toggle');
        await clickUi(page, '.formation-button[data-team="blue"][data-formation="4-4-2"]');
        await settledSceneGapMm(page);
        const changed = await readTactics(page);
        await clickUi(page, '#formations-toggle');
        await clickUi(page, '[data-action="undo"]');
        const sceneGap = await settledSceneGapMm(page);
        const state = await readTactics(page);
        const chip = await page.evaluate(() => document.getElementById('formation-blue').textContent);
        const ok = changed.snapshot.formations.blue === '4-4-2' && state.snapshot.formations.blue === '4-3-3' && chip === '4-3-3'
          && gapMm(state.snapshot.players[`blue:${moved.number}`], moved.place) === 0 && sceneGap < 0.01;
        return [ok, `pastille : ${chip}, n° ${moved.number} à sa place manuelle, scène à ${sceneGap.toFixed(4)} mm`];
      }],
      ['« Réinitialiser » : état de départ, et « Annuler » rétablit tout', async () => {
        const before = await readTactics(page);
        await clickUi(page, '[data-action="reset"]'); // arme la confirmation
        await page.waitForTimeout(450);
        await clickUi(page, '[data-action="reset"]'); // confirme
        const sceneGap = await settledSceneGapMm(page);
        const reset = await readTactics(page);
        await clickUi(page, '[data-action="undo"]');
        await settledSceneGapMm(page);
        const restored = await readTactics(page);
        const ok = reset.initial && reset.arrowMeshes === 0 && sceneGap < 0.01
          && JSON.stringify(restored.snapshot) === JSON.stringify(before.snapshot) && restored.arrowMeshes === 1;
        return [ok, `réinitialisé : ${reset.initial}, flèches 3D : ${reset.arrowMeshes} ; rétabli à l'identique : ${JSON.stringify(restored.snapshot) === JSON.stringify(before.snapshot)}`];
      }],
      ['toujours rendu en WebGPU, sans contexte WebGL, et sans erreur dans la console', async () => {
        const contexts = await page.evaluate(() => window.__canvasContexts);
        const webgl = contexts.filter((type) => WEBGL_CONTEXTS.includes(type));
        return [webgl.length === 0 && contexts.includes('webgpu') && errors.length === 0,
          `contextes : ${[...new Set(contexts)].join(', ')} ; erreurs : ${errors.slice(0, 2).join(' | ') || 'aucune'}`];
      }],
    ];
    await runSteps(steps, label);
  } catch (error) {
    record(label('parcours complet'), 'échec', error.message);
  } finally {
    await context.close();
  }
}

/**
 * Interaction tactique sur un téléphone de 360 px (sprint 5) : la barre d'outils tient entière à
 * l'écran avec de grands boutons, et un toucher sur un joueur puis sur le gazon le déplace.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests de bout en bout — interaction tactique sur téléphone
 */
async function testTacticalMobile(browser, url) {
  const name = 'Interaction tactique sur téléphone (360 × 740)';
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  try {
    await context.addInitScript(installAimTools);
    const { page, errors } = await openApp(context, `${url}?debug`);
    await openWorkspace(page, 'tactics');
    const layout = await page.evaluate(() => {
      const tools = [...document.querySelectorAll('#tactical-toolbar .tool')];
      const boxes = tools.map((tool) => tool.getBoundingClientRect());
      return {
        count: tools.length,
        inside: boxes.every((box) => box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && box.bottom <= window.innerHeight),
        minHeight: Math.min(...boxes.map((box) => box.height)),
        labelsFit: tools.every((tool) => tool.scrollWidth <= tool.clientWidth),
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    // Huit outils (Déplacer, Passe, Course, Dribble, Centre, Tir, Marquage et, depuis la phase 6,
    // Zone) et trois actions d'historique.
    const layoutOk = layout.count === 11 && layout.inside && layout.minHeight >= 44 && layout.labelsFit && !layout.overflow;
    record(`${name} : barre d'outils entière, ${layout.count} boutons de ${layout.minHeight} px de haut, libellés lisibles`, layoutOk ? 'ok' : 'échec',
      `dans l'écran : ${layout.inside}, libellés entiers : ${layout.labelsFit}, débordement : ${layout.overflow}`);

    const target = await page.evaluate(() => window.__aim.player('red'));
    if (!target) {
      record(`${name} : toucher un joueur puis le gazon le déplace`, 'échec', 'aucun joueur rouge visible');
      return;
    }
    await page.touchscreen.tap(target.x, target.y);
    const selected = (await readTactics(page)).selection;
    const spot = await page.evaluate(() => window.__aim.spot([[0.3, -0.12], [0.3, 0.12], [0.25, -0.17], [-0.3, 0.12], [-0.3, -0.12]]));
    await page.touchscreen.tap(spot.sx, spot.sy);
    await settledSceneGapMm(page);
    const state = await readTactics(page);
    const gap = gapMm(state.snapshot.players[`red:${target.number}`], spot);
    const ok = selected?.number === target.number && gap < 1 && errors.length === 0;
    record(`${name} : toucher un joueur puis le gazon le déplace`, ok ? 'ok' : 'échec', `n° ${target.number} des Rouges placé à ${gap.toFixed(3)} mm du point touché`);
  } catch (error) {
    record(name, 'échec', error.message);
  } finally {
    await context.close();
  }
}

/**
 * Séquence animée en vue 3D (sprint 6, bonus BF9) : images clés par le panneau, lecture par le
 * temps écoulé, pause, vitesse 2×, fin exacte sur la dernière image, arrêt par un changement du
 * tableau, et annulation d'une image clé.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Tests de bout en bout — séquence animée (BF9)
 */
async function testSequencePlayback(browser, url) {
  /** Nom d'une étape dans le bilan. */
  const label = (step) => `Séquence animée (BF9) : ${step}`;
  const context = await browser.newContext(DESKTOP);
  try {
    await context.addInitScript(recordCanvasContexts);
    const { page, errors } = await openApp(context, `${url}?debug`);
    /** Déplace un objet par une commande annulable, comme un geste de l'utilisateur. */
    const move = (teamId, number, to) => page.evaluate(async ([team, n, target]) => {
      const { MoveBallCommand, MovePlayerCommand } = await import(new URL('src/commands.mjs', document.baseURI).href);
      const app = window.__footballSimulator;
      app.history.execute(team === 'ball'
        ? new MoveBallCommand({ board: app.board, to: target })
        : new MovePlayerCommand({ board: app.board, teamId: team, number: n, to: target }));
    }, [teamId, number, to]);
    /** Place affichée du n° 9 bleu et du ballon, état de la lecture et texte du panneau. */
    const read = () => page.evaluate(() => {
      const app = window.__footballSimulator;
      const nine = app.pitchGroup.getObjectByName('player-blue-9');
      const ball = app.pitchGroup.getObjectByName('ball');
      return {
        nine: { x: nine.position.x, z: nine.position.z },
        ball: { x: ball.position.x, z: ball.position.z },
        state: app.sequencePlayer.state,
        keyframes: app.sequence.length,
        status: document.querySelector('[data-sequence="status"]').textContent,
        play: document.querySelector('[data-sequence="play"]').textContent,
      };
    });
    const start = await page.evaluate(() => window.__footballSimulator.board.getPlayerPosition('blue', 9));
    const steps = [
      ['trois images clés enregistrées par le panneau, le n° 9 et le ballon avançant entre elles', async () => {
        await clickUi(page, '#sequence-toggle');
        await clickUi(page, '[data-sequence="keyframe"]');
        await move('blue', 9, { x: 0.05, z: 0.02 });
        await move('ball', 0, { x: 0.06, z: 0.03 });
        await waitForFormationsSettled(page);
        await clickUi(page, '[data-sequence="keyframe"]');
        await move('blue', 9, { x: 0.15, z: -0.05 });
        await waitForFormationsSettled(page);
        await clickUi(page, '[data-sequence="keyframe"]');
        const state = await read();
        return [state.keyframes === 3 && state.status.startsWith('3 images clés'), `${state.keyframes} images clés ; « ${state.status} »`];
      }],
      ['lecture : à mi-étape entre deux images, puis exactement sur la dernière, sans changer le tableau', async () => {
        await clickUi(page, '[data-sequence="play"]');
        await page.waitForTimeout(600);
        const middle = await read();
        await page.waitForFunction(() => window.__footballSimulator.sequencePlayer.state === 'paused', null, { timeout: 8000 });
        const end = await read();
        const board = await page.evaluate(() => window.__footballSimulator.board.getPlayerPosition('blue', 9));
        const between = middle.nine.x > start.x && middle.nine.x < 0.15 && middle.play === 'Pause';
        const exact = end.nine.x === 0.15 && end.nine.z === -0.05 && end.ball.x === 0.06 && end.ball.z === 0.03;
        return [between && exact && board.x === 0.15 && end.status.startsWith('Fin'),
          `pendant la lecture : n° 9 en x = ${middle.nine.x.toFixed(4)} ; à la fin : (${end.nine.x} ; ${end.nine.z}) ; « ${end.status} »`];
      }],
      ['pause : rien ne bouge ; vitesse 2× : la lecture dure deux fois moins', async () => {
        await clickUi(page, '[data-sequence="restart"]');
        await page.waitForTimeout(400);
        await clickUi(page, '[data-sequence="play"]'); // pause
        const paused = await read();
        await page.waitForTimeout(600);
        const still = await read();
        await clickUi(page, '[data-speed="2"]');
        const begin = Date.now();
        await clickUi(page, '[data-sequence="restart"]');
        await page.waitForFunction(() => window.__footballSimulator.sequencePlayer.state === 'paused', null, { timeout: 8000 });
        const seconds = (Date.now() - begin) / 1000;
        await clickUi(page, '[data-speed="1"]');
        const ok = paused.state === 'paused' && JSON.stringify(still.nine) === JSON.stringify(paused.nine) && seconds < 2.6;
        return [ok, `en pause : immobile ; à 2× : ${seconds.toFixed(2)} s pour deux étapes (3 s à 1×)`];
      }],
      ['un changement du tableau arrête la lecture, et la scène rejoint le tableau', async () => {
        await clickUi(page, '[data-sequence="restart"]');
        await page.waitForTimeout(300);
        await move('red', 5, { x: 0.12, z: 0.15 });
        const stopped = await read();
        const gap = await settledSceneGapMm(page);
        return [stopped.state === 'stopped' && gap < 0.01, `état : ${stopped.state}, scène à ${gap.toFixed(4)} mm du tableau`];
      }],
      ['« Annuler » retire la dernière image clé ; rendu toujours en WebGPU, sans erreur', async () => {
        await clickUi(page, '[data-action="undo"]'); // annule le déplacement du n° 5
        await clickUi(page, '[data-action="undo"]'); // annule la troisième image clé
        const state = await read();
        const contexts = await page.evaluate(() => window.__canvasContexts);
        const webgl = contexts.filter((type) => WEBGL_CONTEXTS.includes(type));
        return [state.keyframes === 2 && webgl.length === 0 && errors.length === 0, `${state.keyframes} images clés ; contextes : ${[...new Set(contexts)].join(', ')} ; erreurs : ${errors.length}`];
      }],
    ];
    await runSteps(steps, label);
  } catch (error) {
    record(label('parcours complet'), 'échec', error.message);
  } finally {
    await context.close();
  }
}

/**
 * Service Worker à version de contenu (sprint 6). Un nouveau déploiement est simulé par le
 * serveur : main.mjs utilise une nouvelle exportation de config.mjs, et config.mjs répond lentement.
 * 1. Rechargement : la page doit rester sur une seule version, cohérente (avec un réseau d'abord
 *    et un délai d'attente, main.mjs arrivait neuf et config.mjs ancien : le démarrage échouait).
 * 2. Nouveau sw.mjs : la nouvelle version s'installe d'un bloc, l'avis s'affiche, et après
 *    « Recharger » toute la page est de la nouvelle version.
 * 3. Hors-ligne ensuite : la nouvelle version se lance.
 * @param {import('playwright-core').Browser} browser
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Tests de bout en bout — PWA (versions et mises à jour)
 */
async function testShellVersioning(browser) {
  /** Nom d'une étape dans le bilan. */
  const label = (step) => `PWA, versions : ${step}`;
  const server = await startServer();
  const context = await browser.newContext(DESKTOP);
  try {
    const { page, errors } = await openApp(context, `${server.url}?debug`);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 });
    /** État de la page : prête ou en erreur, marque du déploiement B, caches. */
    const read = () => page.evaluate(async () => ({
      ready: document.body.classList.contains('is-ready'),
      failed: document.getElementById('loader').dataset.state === 'error',
      marker: window.__deployMarker ?? null,
      caches: (await caches.keys()).filter((name) => name.startsWith('football-simulator-')),
    }));
    /** Recharge et attend la fin du démarrage, réussi ou non. */
    const reload = async () => {
      await page.reload();
      await page.waitForFunction(
        () => document.body.classList.contains('is-ready') || document.getElementById('loader')?.dataset.state === 'error',
        null, { timeout: 30000 },
      ).catch(() => {});
    };
    const source = async (file) => readFile(path.join(REPO_ROOT, file), 'utf8');
    const steps = [
      ['nouveau déploiement sur réseau lent : la page reste sur une seule version, cohérente', async () => {
        server.setOverride('src/config.mjs', `${await source('src/config.mjs')}\nexport const DEPLOY_MARKER = 'B';\n`);
        server.setOverride('src/main.mjs', `${await source('src/main.mjs')}\nimport { DEPLOY_MARKER } from './config.mjs';\nwindow.__deployMarker = DEPLOY_MARKER;\n`);
        server.setLatency(5000, { only: ['src/config.mjs'] });
        const before = errors.length;
        await reload();
        const state = await read();
        const ok = state.ready && !state.failed && state.marker === null && errors.length === before && state.caches.length === 1;
        return [ok, `prête : ${state.ready}, version : ${state.marker ?? 'A'}, erreurs : ${errors.slice(before, before + 2).join(' | ') || 'aucune'}`];
      }],
      ['nouveau sw.mjs : la version B s\'installe d\'un bloc, avis affiché, puis rechargement en version B', async () => {
        const sw = await source('sw.mjs');
        const next = sw.replace(/const SHELL_VERSION = '[^']*';/, "const SHELL_VERSION = 'deploiement-b';");
        server.setOverride('sw.mjs', next === sw ? `${sw}\n// déploiement B\n` : next);
        await reload();
        await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
        await page.waitForSelector('#update-notice:not([hidden])', { timeout: 30000 });
        await clickUi(page, '#reload-app');
        await page.waitForFunction(() => window.__deployMarker === 'B' && document.body.classList.contains('is-ready'), null, { timeout: 30000 });
        const state = await read();
        const ok = state.marker === 'B' && state.caches.length === 1 && state.caches[0].endsWith('deploiement-b');
        return [ok, `version : ${state.marker}, caches : ${state.caches.join(', ')}`];
      }],
      ['hors-ligne après la mise à jour : la version B se lance', async () => {
        server.setLatency(0);
        await context.setOffline(true);
        await reload();
        const state = await read();
        await context.setOffline(false);
        return [state.ready && state.marker === 'B', `prête hors-ligne : ${state.ready}, version : ${state.marker}`];
      }],
    ];
    await runSteps(steps, label);
  } catch (error) {
    record(label('parcours complet'), 'échec', error.message);
  } finally {
    await context.close();
    await server.close();
  }
}

/**
 * Mode diagnostic (sprint 5) : désactivé par défaut ; avec ?diagnostics, images par seconde,
 * durée d'une image, moteur de rendu, session XR, appels de dessin et triangles.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests de bout en bout — mode diagnostic
 */
async function testDiagnostics(browser, url) {
  const context = await browser.newContext(DESKTOP);
  try {
    const plain = await openApp(context, `${url}?debug`);
    const off = await plain.page.evaluate(() => document.getElementById('diagnostics').hidden && window.__footballSimulator.diagnostics === null);
    record('Mode diagnostic : désactivé par défaut', off ? 'ok' : 'échec');
    await plain.page.close(); // une seule page à la fois : une page en arrière-plan est ralentie

    const { page, errors } = await openApp(context, `${url}?diagnostics&debug`);
    // Mesure établie : la fenêtre de 120 images ne contient plus le démarrage (compilation des shaders).
    await page.waitForTimeout(2500);
    await page.waitForFunction(() => Number(document.querySelector('#diagnostics [data-field="fps"]')?.textContent) > 0, null, { timeout: 10000 });
    const fields = await page.evaluate(() => ({
      visible: !document.getElementById('diagnostics').hidden,
      ...Object.fromEntries([...document.querySelectorAll('#diagnostics [data-field]')].map((field) => [field.dataset.field, field.textContent])),
    }));
    const ok = fields.visible && Number(fields.fps) > 0 && fields.backend === 'WebGPU' && fields.xr === 'aucune session'
      && Number(fields.calls) > 0 && Number(fields.triangles) > 0 && errors.length === 0;
    record('Mode diagnostic avec ?diagnostics : mesures affichées', ok ? 'ok' : 'échec',
      `${fields.fps} images/s, ${fields.frame} par image, ${fields.backend}, ${fields.xr}, ${fields.calls} appels, ${fields.triangles} triangles`);
  } catch (error) {
    record('Mode diagnostic', 'échec', error.message);
  } finally {
    await context.close();
  }
}

/**
 * Règles des flèches dans la vraie page (docs/regles-des-fleches.md) : chaque action impossible est
 * refusée avant d'exister, avec un aperçu rouge et une raison ; rien de refusé n'entre dans
 * l'historique ; le départ est marqué, l'annulation se fait par Échap ou par le bouton
 * « Abandonner » ; un double clic involontaire ne crée ni n'annule rien ; les raccourcis clavier
 * choisissent l'outil, annulent et rétablissent.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests de bout en bout — règles des flèches et clavier
 */
async function testArrowRules(browser, url) {
  /** Nom d'une étape dans le bilan. */
  const label = (step) => `Règles des flèches (vue 3D) : ${step}`;
  const context = await browser.newContext(DESKTOP);
  try {
    await context.addInitScript(recordCanvasContexts);
    await context.addInitScript(installAimTools);
    const { page, errors } = await openApp(context, `${url}?debug`);
    /** Visibilité et couleur des repères de l'aperçu. */
    const markers = () => page.evaluate(() => {
      const group = window.__footballSimulator.pitchGroup;
      const preview = group.getObjectByName('arrow-preview');
      return {
        origin: group.getObjectByName('pass-origin-0').visible,
        preview: preview.visible,
        previewColor: preview.children[0].material.color.getHex(),
        end: group.getObjectByName('arrow-end').visible,
        receiver: group.getObjectByName('receiver-ring').visible,
        cancelShown: !document.getElementById('cancel-draft').hidden,
        cancelText: document.getElementById('cancel-draft').textContent.trim(),
      };
    });
    /** Attend que l'aperçu soit dessiné (tâche de la boucle de rendu). */
    const previewDrawn = () => page.waitForFunction(() => window.__footballSimulator.pitchGroup.getObjectByName('arrow-preview').visible, null, { timeout: 5000 });
    const invalidColor = 0xff5a4f;
    const steps = [
      ['passe depuis un joueur sans le ballon : refusée avant toute action, avec sa raison ; rien dans l\'historique', async () => {
        await clickUi(page, '[data-mode="pass"]');
        await page.waitForFunction(() => window.__footballSimulator.pitchGroup.getObjectByName('pass-origin-0').visible, null, { timeout: 5000 });
        const player = await page.evaluate(() => window.__aim.player('blue'));
        await page.mouse.click(player.x, player.y);
        const state = await readTactics(page);
        const ok = state.feedback === 'invalid' && state.hint.includes('Une passe part du ballon') && state.state === 'arrow-start'
          && !state.canUndo && state.snapshot.arrows.length === 0;
        return [ok, `n° ${player.number} : « ${state.hint} », historique vide : ${!state.canUndo}, départs marqués : ${(await markers()).origin}`];
      }],
      ['départ au ballon, puis arrivée hors des lignes : aperçu rouge, refus expliqué, le départ reste posé', async () => {
        const ball = await page.evaluate(() => window.__aim.ball());
        await page.mouse.click(ball.x, ball.y);
        // Les repères suivent l'état à l'image suivante (tâche de la boucle de rendu).
        await page.waitForFunction(() => !window.__footballSimulator.pitchGroup.getObjectByName('pass-origin-0').visible, null, { timeout: 5000 });
        const started = await markers();
        const outside = await page.evaluate(() => window.__aim.spot([[0.311, 0.05], [0.311, -0.05], [0.311, 0.12], [-0.311, 0.05]]));
        if (!outside) {
          return [false, 'aucun point de la bande de gazon visible'];
        }
        await page.mouse.move(outside.sx, outside.sy);
        await previewDrawn();
        const preview = await markers();
        await page.mouse.click(outside.sx, outside.sy);
        const state = await readTactics(page);
        const ok = started.cancelShown && started.cancelText === 'Abandonner le tracé' && !started.origin
          && preview.previewColor === invalidColor && preview.end && state.feedback === 'invalid'
          && state.hint.includes('hors du terrain') && state.state === 'arrow-end' && state.snapshot.arrows.length === 0;
        return [ok, `aperçu : #${preview.previewColor.toString(16)}, « ${state.hint} », départ gardé : ${state.state === 'arrow-end'}`];
      }],
      ['Échap abandonne le tracé, et le bouton « Abandonner » disparaît', async () => {
        await page.keyboard.press('Escape');
        const state = await readTactics(page);
        const shown = await markers();
        return [state.state === 'arrow-start' && !shown.cancelShown && state.hint === 'Tracé abandonné.', `état : ${state.state}, « ${state.hint} »`];
      }],
      ['passe du porteur vers un adversaire : refusée ; vers un partenaire : receveur entouré, flèche accrochée à lui', async () => {
        await page.evaluate(async () => {
          const { MoveBallCommand } = await import(new URL('src/commands.mjs', document.baseURI).href);
          const app = window.__footballSimulator;
          const nine = app.board.getPlayerPosition('blue', 9);
          app.history.execute(new MoveBallCommand({ board: app.board, to: { x: nine.x + 0.016, z: nine.z } }));
        });
        await waitForFormationsSettled(page);
        const ball = await page.evaluate(() => window.__aim.ball());
        await page.mouse.click(ball.x, ball.y);
        const started = await readTactics(page);
        const red = await page.evaluate(() => window.__aim.player('red'));
        await page.mouse.click(red.x, red.y);
        const refused = await readTactics(page);
        const mate = await page.evaluate(() => window.__aim.player('blue', [9]));
        await page.mouse.move(mate.x, mate.y);
        await previewDrawn();
        const hovered = await markers();
        await page.mouse.click(mate.x, mate.y);
        const state = await readTactics(page);
        const [arrow] = state.snapshot.arrows;
        const ok = started.hint.startsWith('Passe du n° 9 des Bleus') && refused.feedback === 'invalid' && refused.hint.includes('adversaire')
          && hovered.receiver && state.feedback === 'success' && state.hint === `Passe vers le n° ${mate.number} des Bleus tracée.`
          && gapMm(arrow.to, state.snapshot.players[`blue:${mate.number}`]) === 0 && gapMm(arrow.from, state.snapshot.ball) === 0;
        return [ok, `« ${refused.hint} » puis « ${state.hint} »`];
      }],
      ['double clic involontaire sur le ballon : un seul départ, pas d\'annulation', async () => {
        const ball = await page.evaluate(() => window.__aim.ball());
        await page.mouse.dblclick(ball.x, ball.y);
        const state = await readTactics(page);
        await page.keyboard.press('Escape');
        return [state.state === 'arrow-end', `état après le double clic : ${state.state}`];
      }],
      ['touche C : course ; depuis le ballon, refusée ; depuis un joueur, tracée', async () => {
        await page.keyboard.press('c');
        const pressed = await page.evaluate(() => document.querySelector('[data-mode="run"]').getAttribute('aria-pressed'));
        const ball = await page.evaluate(() => window.__aim.ball());
        await page.mouse.click(ball.x, ball.y);
        const refused = await readTactics(page);
        const runner = await page.evaluate(() => window.__aim.player('red'));
        await page.mouse.click(runner.x, runner.y);
        const spot = await page.evaluate(() => window.__aim.spot([[-0.2, 0.1], [-0.15, -0.12], [-0.22, 0.16], [-0.1, 0.17]]));
        await page.mouse.click(spot.sx, spot.sy);
        const state = await readTactics(page);
        const run = state.snapshot.arrows.find(({ kind }) => kind === 'run');
        const ok = pressed === 'true' && refused.hint.includes('Une course part d’un joueur') && run
          && gapMm(run.from, state.snapshot.players[`red:${runner.number}`]) === 0 && gapMm(run.to, spot) < 1;
        return [ok, `refus : « ${refused.hint} » ; course du n° ${runner.number} des Rouges tracée : ${Boolean(run)}`];
      }],
      ['clavier : Ctrl+Z annule, Ctrl+Y rétablit, D revient à « Déplacer »', async () => {
        const before = (await readTactics(page)).snapshot.arrows.length;
        await page.keyboard.press('Control+z');
        const undone = (await readTactics(page)).snapshot.arrows.length;
        await page.keyboard.press('Control+y');
        const redone = (await readTactics(page)).snapshot.arrows.length;
        await page.keyboard.press('d');
        const mode = (await readTactics(page)).mode;
        return [before === 2 && undone === 1 && redone === 2 && mode === 'move', `flèches : ${before} → ${undone} → ${redone}, outil : ${mode}`];
      }],
      ['toujours rendu en WebGPU, sans contexte WebGL, et sans erreur dans la console', async () => {
        const contexts = await page.evaluate(() => window.__canvasContexts);
        const webgl = contexts.filter((type) => WEBGL_CONTEXTS.includes(type));
        return [webgl.length === 0 && contexts.includes('webgpu') && errors.length === 0, `erreurs : ${errors.slice(0, 2).join(' | ') || 'aucune'}`];
      }],
    ];
    await runSteps(steps, label);
  } catch (error) {
    record(label('parcours complet'), 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Interface sur téléphone (390 × 844, tactile) : aide au premier lancement, bandeau compact et
 * terrain entier visible au-dessus de la barre d'outils, visée au doigt (appui, glissé,
 * relâchement), confirmation de la réinitialisation. Les gestes passent par de vrais événements
 * tactiles de Chrome (protocole CDP), pas par des événements fabriqués dans la page.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests de bout en bout — interface sur téléphone
 */
async function testMobileInterface(browser, url) {
  /** Nom d'une étape dans le bilan. */
  const label = (step) => `Interface sur téléphone (390 × 844) : ${step}`;
  const context = await browser.newContext(MOBILE);
  try {
    await context.addInitScript(installAimTools);
    const { page, errors } = await openApp(context, `${url}?debug`, { onboarding: true });
    const touch = await context.newCDPSession(page);
    /** Geste tactique réel : appui, glissé éventuel, relâchement. */
    const press = (type, x, y) => touch.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 }],
    });
    const steps = [
      ['aide au premier lancement : ouverte à la première visite, fermée par « Commencer », pas rouverte au rechargement, rouverte par « ? »', async () => {
        const first = await page.evaluate(() => !document.getElementById('onboarding').hidden);
        await tapUi(page, '#onboarding-close');
        const closed = await page.evaluate(() => document.getElementById('onboarding').hidden);
        await page.reload();
        await page.waitForSelector('body.is-ready', { timeout: 20000 });
        const afterReload = await page.evaluate(() => document.getElementById('onboarding').hidden);
        await tapUi(page, '#help-toggle');
        const reopened = await page.evaluate(() => !document.getElementById('onboarding').hidden
          && document.getElementById('help-toggle').getAttribute('aria-expanded') === 'true');
        await tapUi(page, '#help-toggle');
        return [first && closed && afterReload && reopened, `première visite : ${first}, fermée : ${closed}, absente au rechargement : ${afterReload}, rouverte : ${reopened}`];
      }],
      ['bandeau supérieur compact ; terrain entier et 22 joueurs visibles entre le bandeau et l\'aide', async () => {
        const layout = await page.evaluate(async () => {
          const context = await window.__aim.context();
          const { THREE, app } = context;
          const top = document.querySelector('.topbar').getBoundingClientRect().bottom;
          const bottom = document.querySelector('.status-line').getBoundingClientRect().top;
          const { PITCH_LENGTH, PITCH_WIDTH } = await import(new URL('src/config.mjs', document.baseURI).href);
          const corners = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => app.pitchGroup.localToWorld(new THREE.Vector3((sx * PITCH_LENGTH) / 2, 0, (sz * PITCH_WIDTH) / 2)));
          const players = ['blue', 'red'].flatMap((teamId) => app.pitchGroup.getObjectByName(`team-${teamId}`).children.map((player) => player.localToWorld(new THREE.Vector3(0, 0.03, 0))));
          const outside = [...corners, ...players].map((world) => window.__aim.toScreen(context, world)).filter(({ y }) => y < top || y > bottom).length;
          return { top: Math.round(top), bottom: Math.round(bottom), outside };
        });
        return [layout.top <= 100 && layout.outside === 0, `bandeau jusqu'à ${layout.top} px, aide à ${layout.bottom} px, points cachés : ${layout.outside} sur 26`];
      }],
      ['joueur touché, puis visée au doigt : aperçu sous le doigt, qui suit le glissé ; relâché, le joueur y va', async () => {
        const target = await page.evaluate(() => window.__aim.player('red'));
        await page.touchscreen.tap(target.x, target.y);
        const selected = await readTactics(page);
        const [a, b] = await page.evaluate(async () => [
          await window.__aim.spot([[0.2, -0.12], [0.22, 0.12], [0.15, -0.16]]),
          await window.__aim.spot([[0.08, 0.15], [0.05, -0.15], [0.1, 0.12]]),
        ]);
        await press('touchStart', a.sx, a.sy);
        await page.waitForFunction(() => window.__footballSimulator.pitchGroup.getObjectByName('move-destination').visible, null, { timeout: 5000 });
        for (let step = 1; step <= 6; step += 1) {
          await press('touchMove', a.sx + ((b.sx - a.sx) * step) / 6, a.sy + ((b.sy - a.sy) * step) / 6);
        }
        await page.waitForTimeout(100);
        const ghost = await page.evaluate(() => {
          const marker = window.__footballSimulator.pitchGroup.getObjectByName('move-destination');
          return { visible: marker.visible, x: marker.position.x, z: marker.position.z };
        });
        await press('touchEnd');
        await settledSceneGapMm(page);
        const state = await readTactics(page);
        const placed = state.snapshot.players[`red:${target.number}`];
        const ok = selected.selection?.number === target.number && ghost.visible && gapMm(ghost, b) < 1 && gapMm(placed, b) < 1
          && state.selection === null;
        return [ok, `aperçu à ${gapMm(ghost, b).toFixed(3)} mm du doigt, n° ${target.number} placé à ${gapMm(placed, b).toFixed(3)} mm`];
      }],
      ['« Réinitialiser » : un toucher arme « Confirmer ? » sans rien effacer ; un second toucher réinitialise', async () => {
        await tapUi(page, '[data-action="reset"]');
        const armed = await page.evaluate(() => {
          const button = document.querySelector('[data-action="reset"]');
          return { armed: button.dataset.armed === 'true', text: button.textContent.trim(), initial: window.__footballSimulator.board.isInInitialState() };
        });
        await page.waitForTimeout(450);
        await tapUi(page, '[data-action="reset"]');
        const state = await readTactics(page);
        await tapUi(page, '[data-action="undo"]');
        const undone = await readTactics(page);
        const ok = armed.armed && armed.text === 'Confirmer ?' && !armed.initial && state.initial && !undone.initial && errors.length === 0;
        return [ok, `armé : « ${armed.text} », rien effacé : ${!armed.initial} ; confirmé : ${state.initial} ; annulé : ${!undone.initial}`];
      }],
    ];
    await runSteps(steps, label);
  } catch (error) {
    record(label('parcours complet'), 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Mesure les commandes permanentes dans la page, y compris leur visibilité réelle au centre.
 * Les boutons des panneaux peuvent défiler ; la barre d'outils et la sortie AR doivent rester visibles.
 * @returns {{failures: string[], overflow: boolean}}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests de bout en bout — accessibilité des commandes
 */
function readControlsLayout() {
  const failures = [...document.querySelectorAll('.topbar button, #workspace-nav button, .view-controls button, .ar-session-actions button, .status-line button')]
    .filter((button) => button.getClientRects().length)
    .filter((button) => {
      const rect = button.getBoundingClientRect();
      const center = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return rect.x < 0 || rect.y < 0 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1
        || rect.width < 38 || rect.height < 38 || !button.contains(center);
    }).map((button) => button.id || button.textContent.trim());
  return { failures, overflow: document.documentElement.scrollWidth > innerWidth };
}

/**
 * Régression des écrans courts : vraie fermeture de l'aide, accès aux deux panneaux sans
 * clic fabriqué, commandes toujours à l'écran, et cadrage des joueurs hors des commandes.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests de bout en bout — mise en page adaptative
 */
async function testResponsivePanels(browser, url) {
  for (const [width, height] of [[320, 568], [360, 740], [390, 844], [568, 320], [740, 360], [844, 390], [1280, 800]]) {
    const name = `Interface ${width} × ${height} : aide, panneaux, commandes accessibles et 26 points du terrain visibles`;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
    try {
      await context.addInitScript(installAimTools);
      const { page, errors } = await openApp(context, `${url}?debug`, { onboarding: true });
      const layouts = [await page.evaluate(readControlsLayout)];
      await tapUi(page, '#onboarding-close'); // Chrome défile jusqu'au bouton si nécessaire.
      await tapUi(page, '#reset-view');
      /** Compte les quatre coins et 22 joueurs que l'aide du geste pourrait couvrir. */
      const hiddenPoints = () => page.evaluate(async () => {
        const context = await window.__aim.context();
        const { THREE, app } = context;
        const { PITCH_LENGTH, PITCH_WIDTH } = await import(new URL('src/config.mjs', document.baseURI).href);
        const top = document.querySelector('.topbar').getBoundingClientRect().bottom;
        const bottom = document.querySelector('.status-line').getBoundingClientRect().top;
        const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => app.pitchGroup.localToWorld(new THREE.Vector3(sx * PITCH_LENGTH / 2, 0, sz * PITCH_WIDTH / 2))));
        const players = ['blue', 'red'].flatMap((id) => app.pitchGroup.getObjectByName(`team-${id}`).children.map((player) => player.localToWorld(new THREE.Vector3(0, 0.03, 0))));
        return [...corners, ...players].map((world) => window.__aim.toScreen(context, world))
          .filter(({ x, y }) => x < 0 || x > innerWidth || y < top || y > bottom).length;
      });
      let points = await hiddenPoints();
      const player = await page.evaluate(() => window.__aim.player('blue'));
      await page.touchscreen.tap(player.x, player.y);
      const selection = await readTactics(page);
      points += await hiddenPoints();
      layouts.push(await page.evaluate(readControlsLayout));
      await page.getByRole('button', { name: 'Désélectionner', exact: true }).tap();
      await tapUi(page, '[data-mode="pass"]');
      const ball = await page.evaluate(() => window.__aim.ball());
      await page.touchscreen.tap(ball.x, ball.y);
      const draft = await readTactics(page);
      points += await hiddenPoints();
      layouts.push(await page.evaluate(readControlsLayout));
      await page.getByRole('button', { name: 'Abandonner le tracé', exact: true }).tap();
      for (const selector of ['#formations-toggle', '#sequence-toggle', '#sequence-toggle', '#help-toggle']) {
        await tapUi(page, selector);
        layouts.push(await page.evaluate(readControlsLayout));
      }
      await tapUi(page, '#onboarding-close');
      await page.keyboard.press('p');
      const selected = await page.getAttribute('[data-mode="pass"]', 'aria-pressed');
      const failures = layouts.flatMap((layout) => layout.failures);
      const ok = failures.length === 0 && layouts.every((layout) => !layout.overflow)
        && points === 0 && selection.state === 'selected' && draft.state === 'arrow-end'
        && selected === 'true' && errors.length === 0;
      record(name, ok ? 'ok' : 'échec', `commandes : ${failures.join(', ') || 'visibles'}, points cachés : ${points}/78 (repos, sélection, passe) ; erreurs : ${errors.length}`);
    } catch (error) {
      record(name, 'échec', error.message.split('\n')[0]);
    } finally {
      await context.close();
    }
  }
}

/**
 * Modules .mjs dans la vraie page : chaque script de l'application est un .mjs servi en
 * text/javascript ; les seuls .js chargés sont ceux de three.js (src/vendor).
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests de bout en bout — migration .mjs
 */
async function testModuleLoading(browser, url) {
  const name = 'Modules .mjs : chaque script de l\'application est un .mjs en text/javascript ; seuls ceux de three.js restent en .js';
  const context = await browser.newContext(DESKTOP);
  try {
    const scripts = [];
    context.on('response', (response) => {
      const { pathname } = new URL(response.url());
      if (/\.m?js$/.test(pathname)) {
        scripts.push({ pathname, type: response.headers()['content-type'] ?? '' });
      }
    });
    const { errors } = await openApp(context, url);
    const firstParty = scripts.filter(({ pathname }) => !pathname.includes('/src/vendor/'));
    const wrongType = scripts.filter(({ type }) => !type.startsWith('text/javascript'));
    const notMjs = firstParty.filter(({ pathname }) => !pathname.endsWith('.mjs'));
    const ok = firstParty.length >= 38 && notMjs.length === 0 && wrongType.length === 0 && errors.length === 0;
    record(name, ok ? 'ok' : 'échec', `${firstParty.length} modules .mjs, ${scripts.length - firstParty.length} fichiers de three.js ; hors .mjs : ${notMjs.map(({ pathname }) => pathname).join(', ') || 'aucun'}`);
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/** Dernière version de main avant la migration en .mjs : elle enregistrait sw.js (PR #14). */
const PRE_MJS_COMMIT = 'f7da74f';

/**
 * Passage d'une application installée avant la migration (sw.js) à la nouvelle (sw.mjs). La
 * version d'avant est tirée de git (PRE_MJS_COMMIT) et servie ; la page est mise en cache par son
 * Service Worker. Puis la nouvelle version est déployée à la même adresse : la vérification de mise
 * à jour trouve le script de migration sw.js, la page est rechargée en nouvelle version, sw.mjs
 * prend le relais, l'ancien cache disparaît, et l'application se relance hors-ligne. Ignoré si git
 * ou ce commit sont absents (dépôt cloné sans historique).
 * @param {import('playwright-core').Browser} browser
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests de bout en bout — PWA (migration sw.js → sw.mjs)
 */
async function testServiceWorkerMigration(browser) {
  /** Nom d'une étape dans le bilan. */
  const label = (step) => `PWA, migration de sw.js vers sw.mjs : ${step}`;
  let oldRoot;
  try {
    oldRoot = await mkdtemp(path.join(os.tmpdir(), 'football-simulator-avant-mjs-'));
    const archive = path.join(oldRoot, 'version.tar');
    execFileSync('git', ['archive', '--format=tar', '-o', archive, PRE_MJS_COMMIT], { cwd: REPO_ROOT, stdio: 'ignore' });
    // Chemin relatif : le tar de Git lirait « C: » comme un hôte distant.
    execFileSync('tar', ['-xf', 'version.tar'], { cwd: oldRoot, stdio: 'ignore' });
  } catch (error) {
    record(label('version d\'avant indisponible'), 'ignoré', `git archive ${PRE_MJS_COMMIT} : ${error.message.split('\n')[0]}`);
    if (oldRoot) {
      await rm(oldRoot, { recursive: true, force: true });
    }
    return;
  }
  let server = await startServer({ root: oldRoot });
  const port = Number(new URL(server.url).port);
  const context = await browser.newContext(DESKTOP);
  try {
    const { page } = await openApp(context, `${server.url}?debug`);
    /** État de la page : version, Service Worker et caches. */
    const read = () => page.evaluate(async () => ({
      ready: document.body.classList.contains('is-ready'),
      module: document.querySelector('script[type="module"]')?.getAttribute('src') ?? null,
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      registrations: (await navigator.serviceWorker.getRegistrations()).map((registration) => registration.active?.scriptURL ?? null),
      caches: (await caches.keys()).filter((name) => name.startsWith('football-simulator-')),
    }));
    const steps = [
      ['ancienne version installée : sw.js contrôle la page, son cache est en place', async () => {
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 });
        const state = await read();
        const ok = state.module === 'src/main.js' && state.controller?.endsWith('/sw.js') && state.caches.length === 1;
        return [ok, `page : ${state.module}, Service Worker : ${state.controller}, caches : ${state.caches.join(', ')}`];
      }],
      ['nouvelle version déployée : sw.js de migration, rechargement, puis sw.mjs en module', async () => {
        let navigations = 0;
        // Une boucle de rechargement ne doit pas survivre au remplacement de l'enregistrement.
        page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations += 1; });
        await server.close();
        server = await startServer({ port });
        await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update()).catch(() => {});
        await page.waitForFunction(
          () => document.querySelector('script[type="module"]')?.getAttribute('src') === 'src/main.mjs'
            && document.body.classList.contains('is-ready') && navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.mjs'),
          null, { timeout: 45000, polling: 250 },
        );
        await page.waitForFunction(async () => (await caches.keys()).filter((name) => name.startsWith('football-simulator-')).length === 1, null, { timeout: 15000 });
        const state = await read();
        const version = readShellVersion();
        const afterMigration = navigations;
        await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
        await page.waitForTimeout(1000);
        const ok = state.registrations.length === 1 && state.registrations[0].endsWith('/sw.mjs')
          && state.caches.length === 1 && state.caches[0] === `football-simulator-${version}`
          && afterMigration === 1 && navigations === afterMigration;
        return [ok, `Service Worker : ${state.controller}, enregistrements : ${state.registrations.length}, rechargements : ${navigations}, cache : ${state.caches.join(', ')}`];
      }],
      ['hors-ligne après la migration : la nouvelle version se lance depuis le cache de sw.mjs', async () => {
        await context.setOffline(true);
        await page.reload().catch(() => {});
        const ready = await page.waitForSelector('body.is-ready', { timeout: 20000 }).then(() => true).catch(() => false);
        const state = ready ? await read() : null;
        await context.setOffline(false);
        return [ready && state.module === 'src/main.mjs', `prête hors-ligne : ${ready}, page : ${state?.module}`];
      }],
    ];
    await runSteps(steps, label);
  } catch (error) {
    record(label('parcours complet'), 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
    await server.close();
    await rm(oldRoot, { recursive: true, force: true });
  }
}

/**
 * Lance tous les tests, affiche le bilan et renvoie un code de sortie non nul en cas d'échec.
 * @responsable Bilel Khlif
 * @date 2026-11-09
 * @role Tests de bout en bout — outillage
 */
async function main() {
  const browser = await chromium.launch({ channel: CHANNEL, headless: true, args: LAUNCH_ARGS });
  const root = await startServer();
  const subPath = await startServer({ basePath: '/footballsimulator/' });
  const slow = await startServer();
  try {
    await testLoading(browser, root.url, 'bureau, 1280 × 800', DESKTOP);
    await testLoading(browser, root.url, 'mobile, 390 × 844', MOBILE);
    await testFormations(browser, root.url);
    await testFormationButtons(browser, root.url);
    await testReducedMotion(browser, root.url);
    await testTacticAutosave(browser, root.url);
    await runSavedTacticsTests(browser, root.url, record);
    await testPhaseToggle(browser, root.url);
    await testAnalysisAndOffside(browser, root.url);
    await runCoachViewTests(browser, root.url, record);
    await testShotArrow(browser, root.url);
    await testTeamIdentity(browser, root.url);
    await testScenarioLibrary(browser, root.url);
    await testTacticalBoard(browser, root.url);
    await testTacticalMobile(browser, root.url);
    await testArrowRules(browser, root.url);
    await testMobileInterface(browser, root.url);
    await testResponsivePanels(browser, root.url);
    await testModuleLoading(browser, root.url);
    await runWorkspaceTests(browser, root.url, record);
    await runFinalUxReviewTests(browser, root.url, record);
    await runSafeAreaReviewTests(browser, root.url, record);
    await testDiagnostics(browser, root.url);
    await testSequencePlayback(browser, root.url);
    await testMatchVisualizer(browser, root.url, record, recordCanvasContexts);
    await testVisualizerModes(browser, { root: root.url, subPath: subPath.url }, record);
    await runVisualizerReviewTests(browser, root.url, record);
    await testRealDemo(browser, { root: root.url, subPath: subPath.url }, record);
    await testVisualizerGpuReset(() => chromium.launch({ channel: CHANNEL, headless: true, args: LAUNCH_ARGS }), root.url, record);
    await testShellVersioning(browser);
    await testServiceWorkerMigration(browser);
    await testWebGpuRendering(browser, root.url);
    await testWithoutWebGpu(browser, root.url);
    await testWebGlTestMode(browser, root.url);
    await testManifest(browser, root.url);
    await testPwa(browser, root.url, 'racine');
    await testLoading(browser, subPath.url, 'sous-chemin, comme GitHub Pages', DESKTOP);
    await testPwa(browser, subPath.url, 'sous-chemin');
    await runServiceWorkerMediaTests(browser, { root: root.url, subPath: subPath.url }, record);
    await testSlowNetwork(browser, slow);
    await testEmulator(browser, root.url);
    await testArSession(browser, root.url);
    await testArSession(browser, root.url, { webglTest: true });
    await runCoachingWorkflowTests(browser, root.url, record);
  } finally {
    await browser.close();
    await root.close();
    await subPath.close();
    await slow.close();
  }

  const symbols = { ok: '✓', échec: '✗', ignoré: '–' };
  for (const { name, status, detail } of results) {
    console.log(`${symbols[status]} ${name}${detail ? `  (${detail})` : ''}`);
  }
  const failed = results.filter((r) => r.status === 'échec').length;
  const skipped = results.filter((r) => r.status === 'ignoré').length;
  console.log(`\n${results.length - failed - skipped} réussi(s), ${skipped} ignoré(s), ${failed} échec(s).`);
  process.exitCode = failed ? 1 : 0;
}

await main();
