/**
 * Tests de bout en bout des sprints 1 à 4, et du mode test WebGL, exécutés dans Chrome sans interface.
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
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { REPO_ROOT, startServer } from './serve.mjs';

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
 * Ouvre l'application et collecte les erreurs : console, script et réponses HTTP en échec.
 * @param {import('playwright-core').BrowserContext} context
 * @param {string} url
 * @returns {Promise<{page: import('playwright-core').Page, errors: string[]}>}
 * @responsable Bilel Khlif
 * @date 2026-11-09
 * @role Tests de bout en bout — outillage
 */
async function openApp(context, url) {
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('body.is-ready', { timeout: 20000 });
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
      const { FORMATIONS } = await import(`${base}src/formations.js`);
      const { PITCH_LENGTH, PITCH_WIDTH, PLAYER_SIZE } = await import(`${base}src/config.js`);
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
 * places de cette formation (src/formation-transition.js). Page ouverte avec ?debug.
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
    const { computeTeamTargets } = await import(`${base}src/formation-transition.js`);
    const { TEAMS } = await import(`${base}src/config.js`);
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
 * Script de page (sprint 5) : outils de visée, installés dans window.__aim. La caméra active est
 * celle de la vue 3D, ou en AR la caméra de la vue WebXR (pose et projection de la session). Un
 * point ne convient que s'il est à l'écran, hors de l'interface, et si le rayon qui passe par ce
 * pixel touche bien ce qui est visé : le test vérifie le raycasting de l'application, pas un clic
 * caché par un autre joueur.
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests de bout en bout — outillage de l'interaction tactique
 */
function installAimTools() {
  /** Éléments d'interface qui reçoivent les touchers. */
  const ui = 'button, .toolbar, .formation-panel, .notice';
  window.__aim = {
    async context() {
      const THREE = await import('three');
      const app = window.__footballSimulator;
      const camera = app.renderer.xr.isPresenting ? app.renderer.xr.getCamera().cameras[0] : app.camera;
      app.pitchGroup.updateMatrixWorld(true);
      return { THREE, app, camera, rect: app.renderer.domElement.getBoundingClientRect() };
    },
    // Pixel d'un point monde, et s'il est utilisable (à l'écran, hors de l'interface).
    toScreen({ THREE, camera, rect }, world) {
      const ndc = world.clone().applyMatrix4(new THREE.Matrix4().copy(camera.matrixWorld).invert()).applyMatrix4(camera.projectionMatrix);
      const x = rect.left + ((ndc.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - ndc.y) / 2) * rect.height;
      const onScreen = Math.abs(ndc.x) < 0.92 && Math.abs(ndc.y) < 0.92 && ndc.z > -1 && ndc.z < 1;
      return { x, y, usable: onScreen && !document.elementFromPoint(x, y)?.closest(ui) };
    },
    // Premier objet touché par le rayon de la caméra vers un point monde.
    firstHit({ THREE, app, camera }, world) {
      const origin = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
      const raycaster = new THREE.Raycaster(origin, world.clone().sub(origin).normalize());
      return raycaster.intersectObjects(app.tacticalView.hitboxes, false)[0]?.object.parent ?? null;
    },
    async player(teamId) {
      const context = await this.context();
      const { THREE, app } = context;
      for (const player of app.pitchGroup.getObjectByName(`team-${teamId}`).children) {
        const head = player.localToWorld(new THREE.Vector3(0, 0.03, 0));
        const screen = this.toScreen(context, head);
        if (screen.usable && this.firstHit(context, head) === player) {
          return { number: player.userData.number, x: screen.x, y: screen.y };
        }
      }
      return null;
    },
    async ball() {
      const context = await this.context();
      const { THREE, app } = context;
      const ball = app.pitchGroup.getObjectByName('ball');
      const center = ball.getWorldPosition(new THREE.Vector3());
      const screen = this.toScreen(context, center);
      return screen.usable && this.firstHit(context, center) === ball ? { x: screen.x, y: screen.y } : null;
    },
    async spot(candidates) {
      const context = await this.context();
      const { THREE, app } = context;
      for (const [x, z] of candidates) {
        const world = app.pitchGroup.localToWorld(new THREE.Vector3(x, 0, z));
        const screen = this.toScreen(context, world);
        if (screen.usable && this.firstHit(context, world) === null) {
          return { x, z, sx: screen.x, sy: screen.y };
        }
      }
      return null;
    },
  };
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
    const choose = (teamId, name) => page.click(`.formation-button[data-team="${teamId}"][data-formation="${name}"]`);

    // Le panneau s'ouvre et se ferme par le bouton « Formations ».
    const closedAtStart = await page.evaluate(() => document.getElementById('formation-panel').hidden);
    await page.click('#formations-toggle');
    const opened = await page.evaluate(() => !document.getElementById('formation-panel').hidden
      && document.getElementById('formations-toggle').getAttribute('aria-expanded') === 'true');
    const buttonCount = await page.locator('.formation-button').count();
    record('Formations : panneau ouvert par « Formations », 4 boutons par équipe', closedAtStart && opened && buttonCount === 8 ? 'ok' : 'échec',
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
    await page.click('#formations-toggle');
    await page.click('.formation-button[data-team="red"][data-formation="3-5-2"]');
    const state = await readTeamPlacement(page, 'red');
    record(name, !state.animating && isInFormation(state, '3-5-2') ? 'ok' : 'échec', `écart juste après le clic : ${state.worstCm} cm`);
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
    await page.click('#test-session');
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
    const table = await page.evaluate(async () => (await import(new URL('src/dev-xr-emulation.js', document.baseURI).href)).VIRTUAL_TABLE);

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

    /** Attend un état de la pose du terrain (src/ar-surface.js). */
    const waitForPlacementState = (state) => page.waitForFunction(
      (expected) => window.__footballSimulator.placement?.state === expected, state, { timeout: 15000 },
    );

    /** Touche l'écran au centre, hors des boutons : l'émulateur en fait un select WebXR. */
    const tapScreen = () => page.mouse.click(640, 380);

    /** Entre en AR par le bouton, le téléphone émulé visant la table. */
    const enterAr = async () => {
      await aim(35);
      await page.click('#enter-ar');
      await page.waitForFunction(() => document.body.dataset.xr === 'active', null, { timeout: 15000 });
      await page.waitForFunction(() => Boolean(window.__footballSimulator.placement?.state), null, { timeout: 15000 });
    };

    /** Pose du terrain et du réticule, dans l'espace local-floor. */
    const readPlacement = () => page.evaluate(async () => {
      const THREE = await import('three');
      const { BOARD_LENGTH, BOARD_WIDTH } = await import(new URL('src/config.js', document.baseURI).href);
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
        const toggleHidden = await page.evaluate(() => document.getElementById('formations-toggle').hidden);
        const ok = state.reticleVisible && onTable && !state.pitchVisible && state.hint.includes('Touchez') && toggleHidden;
        return [ok, `réticule en (${state.reticle.join(' ; ')}), terrain masqué : ${!state.pitchVisible}, bouton « Formations » caché : ${toggleHidden}`];
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
        await page.click('#formations-toggle');
        await page.click('.formation-button[data-team="blue"][data-formation="4-2-3-1"]');
        await page.click('.formation-button[data-team="red"][data-formation="3-5-2"]');
        await waitForFormationsSettled(page);
        const blue = await readTeamPlacement(page, 'blue');
        const red = await readTeamPlacement(page, 'red');
        const stillPlaced = await page.evaluate(() => window.__footballSimulator.placement.state === 'placed');
        // Retour au scénario de démonstration, panneau fermé, pour les étapes suivantes.
        await page.click('.formation-button[data-team="blue"][data-formation="4-3-3"]');
        await page.click('.formation-button[data-team="red"][data-formation="4-4-2"]');
        await waitForFormationsSettled(page);
        await page.click('#formations-toggle');
        const ok = toggleVisible && stillPlaced && isInFormation(blue, '4-2-3-1') && isInFormation(red, '3-5-2');
        return [ok, `bouton visible : ${toggleVisible}, Bleus ${blue.chip} (${blue.worstCm} cm), Rouges ${red.chip} (${red.worstCm} cm), terrain toujours posé : ${stillPlaced}`];
      }],
      ['« Déplacer le terrain », puis nouvelle pose face à l\'utilisateur', async () => {
        await page.click('#move-pitch');
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
      ['flèche de passe en AR : aperçu guidé par la source d\'entrée, puis « Annuler »', async () => {
        await page.click('[data-mode="pass"]');
        const start = await page.evaluate(() => window.__aim.spot([[-0.1, 0.05], [-0.05, 0.1], [0, 0.12], [-0.15, 0.12]]));
        const end = await page.evaluate(() => window.__aim.spot([[0.12, -0.08], [0.15, 0.1], [0.08, 0.15], [0.2, 0]]));
        if (!start || !end) {
          return [false, 'points de la flèche cachés'];
        }
        await page.mouse.click(start.sx, start.sy);
        await page.waitForFunction(() => window.__footballSimulator.interaction.state === 'arrow-end', null, { timeout: 5000 });
        await page.mouse.move(end.sx, end.sy);
        await page.waitForFunction(() => window.__footballSimulator.pitchGroup.getObjectByName('arrow-preview').visible, null, { timeout: 5000 });
        await page.mouse.click(end.sx, end.sy);
        await page.waitForFunction(() => window.__footballSimulator.board.getArrows().length === 1, null, { timeout: 5000 });
        const drawn = await readTactics(page);
        await page.click('[data-action="undo"]');
        const undone = await readTactics(page);
        await page.click('[data-mode="move"]');
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
        const box = await page.locator('#tactical-toolbar').boundingBox();
        await page.mouse.click(box.x + 3, box.y + box.height / 2); // bord de la barre, entre les boutons
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
      ['séquence animée en AR sur le terrain tourné : lecture dans le repère du terrain, terrain toujours ancré', async () => {
        const toggleVisible = await page.evaluate(() => !document.getElementById('sequence-toggle').hidden);
        const { start, to } = await page.evaluate(async () => {
          const { AddKeyframeCommand, MovePlayerCommand } = await import(new URL('src/commands.js', document.baseURI).href);
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
        await page.click('#sequence-toggle');
        await page.click('[data-sequence="play"]');
        await page.waitForTimeout(700);
        const middle = await read();
        await page.waitForFunction(() => window.__footballSimulator.sequencePlayer.state === 'paused', null, { timeout: 8000 });
        const after = await read();
        await page.click('#sequence-toggle');
        const between = middle.ten.x < start.x && middle.ten.x > to.x;
        const exact = Math.abs(after.ten.x - to.x) < 1e-12 && Math.abs(after.ten.z - to.z) < 1e-12;
        const anchored = JSON.stringify(after.pose) === JSON.stringify(before.pose) && after.placed && middle.placed;
        return [toggleVisible && between && exact && anchored,
          `bouton « Séquence » visible : ${toggleVisible}, à mi-lecture entre les deux images : ${between}, fin exacte : ${exact}, pose du terrain inchangée et ancrée : ${anchored}`];
      }],
      ['regard hors de la table : pas de réticule, et un toucher ne pose rien', async () => {
        await page.click('#move-pitch');
        await aim(0); // regard horizontal : le rayon ne rencontre aucune surface
        await waitForPlacementState('searching');
        await tapScreen();
        await page.waitForTimeout(500);
        const state = await readPlacement();
        const ok = state.state === 'searching' && !state.reticleVisible && !state.pitchVisible && state.hint.includes('Visez');
        return [ok, `état : ${state.state}, réticule visible : ${state.reticleVisible}, terrain visible : ${state.pitchVisible}`];
      }],
      ['sortie par « Quitter l\'AR » et vue 3D restaurée', async () => {
        await page.click('#exit-ar');
        await page.waitForFunction(() => document.body.dataset.xr === 'inactive', null, { timeout: 15000 });
        const view = await readView();
        const counts = await countLoopCalls(800);
        return [sameAsInitial(view) && counts.updates > 0, `vue identique au départ : ${sameAsInitial(view)}, contrôles relancés : ${counts.updates > 0}`];
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
          await page.click('#exit-ar');
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
        await page.click('#enter-ar');
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
        await page.click('#enter-ar');
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
        await page.click('[data-action="undo"]');
        await settledSceneGapMm(page);
        const undone = await readTactics(page);
        await page.click('[data-action="redo"]');
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
      ['flèche de passe : deux clics, aperçu au survol, flèche 3D accrochée au joueur', async () => {
        await page.click('[data-mode="pass"]');
        const from = await page.evaluate(() => window.__aim.player('blue'));
        await page.mouse.click(from.x, from.y);
        const spot = await page.evaluate(() => window.__aim.spot([[0.1, 0.12], [0.15, -0.15], [0.05, 0.19], [0.2, 0.1]]));
        await page.mouse.move(spot.sx, spot.sy);
        await page.waitForFunction(() => window.__footballSimulator.pitchGroup.getObjectByName('arrow-preview').visible, null, { timeout: 5000 });
        await page.mouse.click(spot.sx, spot.sy);
        const state = await readTactics(page);
        const [arrow] = state.snapshot.arrows;
        const start = state.snapshot.players[`blue:${from.number}`];
        const ok = state.arrowMeshes === 1 && arrow?.kind === 'pass' && gapMm(arrow.from, start) === 0 && gapMm(arrow.to, spot) < 1
          && state.state === 'arrow-start';
        return [ok, `départ accroché au n° ${from.number}, arrivée à ${gapMm(arrow.to, spot).toFixed(3)} mm du point visé, flèches 3D : ${state.arrowMeshes}`];
      }],
      ['changement de formation annulé : le joueur déplacé à la main retrouve sa place exacte', async () => {
        await page.click('[data-mode="move"]');
        await page.click('#formations-toggle');
        await page.click('.formation-button[data-team="blue"][data-formation="4-4-2"]');
        await settledSceneGapMm(page);
        const changed = await readTactics(page);
        await page.click('#formations-toggle');
        await page.click('[data-action="undo"]');
        const sceneGap = await settledSceneGapMm(page);
        const state = await readTactics(page);
        const chip = await page.evaluate(() => document.getElementById('formation-blue').textContent);
        const ok = changed.snapshot.formations.blue === '4-4-2' && state.snapshot.formations.blue === '4-3-3' && chip === '4-3-3'
          && gapMm(state.snapshot.players[`blue:${moved.number}`], moved.place) === 0 && sceneGap < 0.01;
        return [ok, `pastille : ${chip}, n° ${moved.number} à sa place manuelle, scène à ${sceneGap.toFixed(4)} mm`];
      }],
      ['« Réinitialiser » : état de départ, et « Annuler » rétablit tout', async () => {
        const before = await readTactics(page);
        await page.click('[data-action="reset"]');
        const sceneGap = await settledSceneGapMm(page);
        const reset = await readTactics(page);
        await page.click('[data-action="undo"]');
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
    const layoutOk = layout.count === 6 && layout.inside && layout.minHeight >= 44 && layout.labelsFit && !layout.overflow;
    record(`${name} : barre d'outils entière, six boutons de ${layout.minHeight} px de haut, libellés lisibles`, layoutOk ? 'ok' : 'échec',
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
      const { MoveBallCommand, MovePlayerCommand } = await import(new URL('src/commands.js', document.baseURI).href);
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
        await page.click('#sequence-toggle');
        await page.click('[data-sequence="keyframe"]');
        await move('blue', 9, { x: 0.05, z: 0.02 });
        await move('ball', 0, { x: 0.06, z: 0.03 });
        await waitForFormationsSettled(page);
        await page.click('[data-sequence="keyframe"]');
        await move('blue', 9, { x: 0.15, z: -0.05 });
        await waitForFormationsSettled(page);
        await page.click('[data-sequence="keyframe"]');
        const state = await read();
        return [state.keyframes === 3 && state.status.startsWith('3 images clés'), `${state.keyframes} images clés ; « ${state.status} »`];
      }],
      ['lecture : à mi-étape entre deux images, puis exactement sur la dernière, sans changer le tableau', async () => {
        await page.click('[data-sequence="play"]');
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
        await page.click('[data-sequence="restart"]');
        await page.waitForTimeout(400);
        await page.click('[data-sequence="play"]'); // pause
        const paused = await read();
        await page.waitForTimeout(600);
        const still = await read();
        await page.click('[data-speed="2"]');
        const begin = Date.now();
        await page.click('[data-sequence="restart"]');
        await page.waitForFunction(() => window.__footballSimulator.sequencePlayer.state === 'paused', null, { timeout: 8000 });
        const seconds = (Date.now() - begin) / 1000;
        await page.click('[data-speed="1"]');
        const ok = paused.state === 'paused' && JSON.stringify(still.nine) === JSON.stringify(paused.nine) && seconds < 2.6;
        return [ok, `en pause : immobile ; à 2× : ${seconds.toFixed(2)} s pour deux étapes (3 s à 1×)`];
      }],
      ['un changement du tableau arrête la lecture, et la scène rejoint le tableau', async () => {
        await page.click('[data-sequence="restart"]');
        await page.waitForTimeout(300);
        await move('red', 5, { x: 0.12, z: 0.15 });
        const stopped = await read();
        const gap = await settledSceneGapMm(page);
        return [stopped.state === 'stopped' && gap < 0.01, `état : ${stopped.state}, scène à ${gap.toFixed(4)} mm du tableau`];
      }],
      ['« Annuler » retire la dernière image clé ; rendu toujours en WebGPU, sans erreur', async () => {
        await page.click('[data-action="undo"]'); // annule le déplacement du n° 5
        await page.click('[data-action="undo"]'); // annule la troisième image clé
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
 * serveur : main.js utilise une nouvelle exportation de config.js, et config.js répond lentement.
 * 1. Rechargement : la page doit rester sur une seule version, cohérente (avec un réseau d'abord
 *    et un délai d'attente, main.js arrivait neuf et config.js ancien : le démarrage échouait).
 * 2. Nouveau sw.js : la nouvelle version s'installe d'un bloc, l'avis s'affiche, et après
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
        server.setOverride('src/config.js', `${await source('src/config.js')}\nexport const DEPLOY_MARKER = 'B';\n`);
        server.setOverride('src/main.js', `${await source('src/main.js')}\nimport { DEPLOY_MARKER } from './config.js';\nwindow.__deployMarker = DEPLOY_MARKER;\n`);
        server.setLatency(5000, { only: ['src/config.js'] });
        const before = errors.length;
        await reload();
        const state = await read();
        const ok = state.ready && !state.failed && state.marker === null && errors.length === before && state.caches.length === 1;
        return [ok, `prête : ${state.ready}, version : ${state.marker ?? 'A'}, erreurs : ${errors.slice(before, before + 2).join(' | ') || 'aucune'}`];
      }],
      ['nouveau sw.js : la version B s\'installe d\'un bloc, avis affiché, puis rechargement en version B', async () => {
        const sw = await source('sw.js');
        const next = sw.replace(/const SHELL_VERSION = '[^']*';/, "const SHELL_VERSION = 'deploiement-b';");
        server.setOverride('sw.js', next === sw ? `${sw}\n// déploiement B\n` : next);
        await reload();
        await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
        await page.waitForSelector('#update-notice:not([hidden])', { timeout: 30000 });
        await page.click('#reload-app');
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
    await testTacticalBoard(browser, root.url);
    await testTacticalMobile(browser, root.url);
    await testDiagnostics(browser, root.url);
    await testSequencePlayback(browser, root.url);
    await testShellVersioning(browser);
    await testWebGpuRendering(browser, root.url);
    await testWithoutWebGpu(browser, root.url);
    await testWebGlTestMode(browser, root.url);
    await testManifest(browser, root.url);
    await testPwa(browser, root.url, 'racine');
    await testLoading(browser, subPath.url, 'sous-chemin, comme GitHub Pages', DESKTOP);
    await testPwa(browser, subPath.url, 'sous-chemin');
    await testSlowNetwork(browser, slow);
    await testEmulator(browser, root.url);
    await testArSession(browser, root.url);
    await testArSession(browser, root.url, { webglTest: true });
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
