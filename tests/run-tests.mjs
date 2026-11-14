/**
 * Tests de bout en bout des sprints 1 à 4, et du mode test WebGL, exécutés dans Chrome sans interface.
 * Ils rejouent les vérifications consignées dans docs/sprint-1.md, docs/sprint-2.md et
 * docs/sprint-3.md.
 *
 * Prérequis : Node.js 18 ou plus, Google Chrome installé, un processeur graphique compatible
 * WebGPU (l'application n'a pas de repli WebGL), puis « npm install ».
 * Usage : npm run test:e2e, ou npm test pour lancer aussi les tests unitaires
 * (BROWSER_CHANNEL=msedge pour utiliser Microsoft Edge)
 */
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

/** Navigateur utilisé : Chrome par défaut. */
const CHANNEL = process.env.BROWSER_CHANNEL ?? 'chrome';

/**
 * Options de Chrome. Depuis le sprint 3, l'application rend en WebGPU, sur le vrai processeur
 * graphique : le rendu logiciel SwiftShader des sprints 1 et 2 ne fournit pas d'adaptateur WebGPU.
 * --enable-unsafe-webgpu active WebGPU là où Chrome ne l'active pas encore par défaut (Linux).
 */
const LAUNCH_ARGS = ['--enable-unsafe-webgpu'];

/** Script injecté avant la page : enregistre chaque type de contexte demandé à un canvas. */
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
 */
function record(name, status, detail = '') {
  results.push({ name, status, detail });
}

/**
 * Attend une promesse au plus `ms` millisecondes.
 * @param {Promise<any>} promise
 * @param {number} ms
 * @returns {Promise<any>}
 */
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`délai de ${ms} ms dépassé`)), ms))]);
}

/**
 * Ouvre l'application et collecte les erreurs : console, script et réponses HTTP en échec.
 * @param {import('playwright-core').BrowserContext} context
 * @param {string} url
 * @returns {Promise<{page: import('playwright-core').Page, errors: string[]}>}
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
 */
function waitForFormationsSettled(page) {
  return page.waitForFunction(() => !window.__footballSimulator.animator.isAnimating, null, { timeout: 5000 });
}

/**
 * Vérifie qu'une équipe est entièrement en place dans la formation attendue, interface comprise.
 * @param {{formation: string, worstCm: number, chip: string, pressed: string[], roles: boolean}} state
 * @param {string} expected nom de la formation
 * @returns {boolean}
 */
function isInFormation(state, expected) {
  return state.formation === expected && state.worstCm < 0.01 && state.roles && state.chip === expected
    && state.pressed.length === 1 && state.pressed[0] === expected;
}

/**
 * Changement de formation par les boutons (sprint 4, BF4) : scénario de démonstration du cahier
 * (§4.1, étape 5), toutes les formations pour les deux équipes, et transition animée.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 */
async function testFormationButtons(browser, url) {
  const context = await browser.newContext(MOBILE);
  try {
    const { page, errors } = await openApp(context, `${url}?debug`);
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
 */
async function testArSession(browser, url, { webglTest = false } = {}) {
  const label = (step) => `${webglTest ? 'Mode test WebGL, AR avec IWER' : 'Session AR avec IWER'} : ${step}`;
  const context = await browser.newContext(DESKTOP);
  try {
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

    const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
    const initialView = await readView();
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
      ['nouvelle entrée, puis sortie par le système', async () => {
        await enterAr();
        await waitForPlacementState('surface');
        await page.evaluate(() => window.__footballSimulator.renderer.xr.getSession().end());
        await page.waitForFunction(() => document.body.dataset.xr === 'inactive', null, { timeout: 15000 });
        const view = await readView();
        return [sameAsInitial(view), `vue identique au départ : ${sameAsInitial(view)}`];
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
 * Lance tous les tests, affiche le bilan et renvoie un code de sortie non nul en cas d'échec.
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
