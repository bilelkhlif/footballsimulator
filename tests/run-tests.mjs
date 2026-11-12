/**
 * Tests de bout en bout des sprints 1 et 2, exécutés dans Chrome sans interface.
 * Ils rejouent les vérifications consignées dans docs/sprint-1.md et docs/sprint-2.md.
 *
 * Prérequis : Node.js 18 ou plus, Google Chrome installé, puis « npm install ».
 * Usage : npm run test:e2e, ou npm test pour lancer aussi les tests unitaires
 * (BROWSER_CHANNEL=msedge pour utiliser Microsoft Edge)
 */
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

/** Navigateur utilisé : Chrome par défaut. */
const CHANNEL = process.env.BROWSER_CHANNEL ?? 'chrome';

/** Rendu WebGL logiciel, pour que les tests tournent même sans carte graphique. */
const LAUNCH_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

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
 * Vérifie l'émulateur IWER : avec ?iwer, une session immersive-ar doit s'ouvrir avec local-floor.
 * Le test est ignoré si le CDN de l'émulateur est injoignable (pas de réseau).
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 */
async function testEmulator(browser, url) {
  const name = 'Émulateur IWER : session immersive-ar avec local-floor';
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
      button.style.cssText = 'position:fixed;left:0;top:0;z-index:99;pointer-events:auto';
      document.body.append(button);
      button.addEventListener('click', async () => {
        try {
          const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['local-floor'], optionalFeatures: ['anchors'] });
          window.testSession = { ok: true, features: [...(session.enabledFeatures ?? [])] };
          await session.end();
        } catch (error) {
          window.testSession = { ok: false, error: `${error.name} : ${error.message}` };
        }
      });
    });
    await page.click('#test-session');
    const session = await (await page.waitForFunction(() => window.testSession, null, { timeout: 15000 })).jsonValue();
    const ok = session.ok && session.features.includes('local-floor');
    record(name, ok ? 'ok' : 'échec', session.ok ? `fonctionnalités : ${session.features.join(', ')}` : session.error);
  } catch (error) {
    record(name, 'échec', error.message);
  } finally {
    await context.close();
  }
}

/**
 * Parcours AR complet avec l'émulateur IWER, par les boutons de l'application (sprint 2) :
 * entrée, terrain placé devant la vue, contrôles d'orbite en pause, sortie et restauration de
 * la vue 3D, nouvelle entrée puis sortie décidée par le système, et échec d'entrée signalé.
 * Les objets internes sont lus grâce au paramètre ?debug. Le parcours est ignoré si le CDN de
 * l'émulateur est injoignable ; une étape en échec fait ignorer les suivantes.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 */
async function testArSession(browser, url) {
  const label = (step) => `Session AR avec IWER : ${step}`;
  const context = await browser.newContext(DESKTOP);
  try {
    const { page, errors } = await openApp(context, `${url}?iwer&debug`);
    await page.waitForFunction(() => document.getElementById('xr-status')?.dataset.state !== 'checking', null, { timeout: 30000 });
    if (await page.evaluate(() => document.getElementById('xr-status').dataset.state) !== 'emulated') {
      record(label('parcours complet'), 'ignoré', 'émulateur indisponible (réseau ?)');
      return;
    }

    /** Entre en AR par le bouton et attend que le terrain soit placé. */
    const enterAr = async () => {
      await page.click('#enter-ar');
      await page.waitForFunction(() => document.body.dataset.xr === 'active', null, { timeout: 15000 });
      await page.waitForFunction(() => !window.__footballSimulator.arView.needsPlacement, null, { timeout: 15000 });
    };

    /** État de la vue 3D, à comparer avant l'entrée et après la sortie. */
    const readView = () => page.evaluate(() => {
      const app = window.__footballSimulator;
      const { position, rotation } = app.pitchGroup;
      const visible = (id) => !document.getElementById(id).hidden;
      return {
        presenting: app.renderer.xr.isPresenting,
        background: app.scene.background ? app.scene.background.getHexString() : null,
        tableVisible: app.table.visible,
        pitchAtOrigin: position.length() === 0 && rotation.y === 0 && app.pitchGroup.visible,
        controlsEnabled: app.controls.enabled,
        fov: app.camera.fov,
        buttons: { enter: visible('enter-ar'), exit: visible('exit-ar'), reset: visible('reset-view') },
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

    const initialView = await readView();
    const sameAsInitial = (view) => JSON.stringify(view) === JSON.stringify(initialView);

    const steps = [
      ['entrée par « Entrer en AR »', async () => {
        await enterAr();
        const state = await page.evaluate(() => {
          const app = window.__footballSimulator;
          const { baseLayer, layers } = app.renderer.xr.getSession().renderState;
          const visible = (id) => !document.getElementById(id).hidden;
          return {
            presenting: app.renderer.xr.isPresenting,
            layer: baseLayer ? 'XRWebGLLayer' : (layers?.length ? 'XRProjectionLayer' : 'aucune'),
            space: Boolean(app.renderer.xr.getReferenceSpace()),
            tableHidden: !app.table.visible,
            transparent: app.scene.background === null,
            buttons: visible('exit-ar') && !visible('enter-ar') && !visible('reset-view'),
          };
        });
        const ok = state.presenting && state.space && state.tableHidden && state.transparent && state.buttons && state.layer !== 'aucune';
        return [ok, `couche ${state.layer}, table masquée : ${state.tableHidden}, fond transparent : ${state.transparent}`];
      }],
      ['terrain placé devant la vue', async () => {
        const placement = await page.evaluate(async () => {
          const THREE = await import('three');
          const { BOARD_LENGTH, BOARD_WIDTH } = await import(new URL('src/config.js', document.baseURI).href);
          const app = window.__footballSimulator;
          app.pitchGroup.updateWorldMatrix(true, false);
          const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => {
            const ndc = app.pitchGroup.localToWorld(new THREE.Vector3((sx * BOARD_LENGTH) / 2, 0, (sz * BOARD_WIDTH) / 2)).project(app.camera);
            return Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z > -1 && ndc.z < 1;
          }));
          const distance = app.camera.getWorldPosition(new THREE.Vector3()).distanceTo(app.pitchGroup.getWorldPosition(new THREE.Vector3()));
          return { inView: corners.filter(Boolean).length, distance, visible: app.pitchGroup.visible };
        });
        const ok = placement.visible && placement.inView === 4 && placement.distance > 0.8 && placement.distance < 1.3;
        return [ok, `${placement.inView} coins sur 4 à l'écran, à ${placement.distance.toFixed(2)} m`];
      }],
      ['contrôles d\'orbite en pause', async () => {
        const counts = await countLoopCalls(1000);
        return [counts.updates === 0 && counts.renders > 0, `${counts.updates} mise(s) à jour des contrôles pour ${counts.renders} images`];
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
        await page.evaluate(() => window.__footballSimulator.renderer.xr.getSession().end());
        await page.waitForFunction(() => document.body.dataset.xr === 'inactive', null, { timeout: 15000 });
        const view = await readView();
        return [sameAsInitial(view), `vue identique au départ : ${sameAsInitial(view)}`];
      }],
      ['échec d\'entrée signalé', async () => {
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
        record(label(step), 'échec', error.message);
        blocked = true;
      }
    }
    record(label('aucune erreur dans la console'), errors.length ? 'échec' : 'ok', errors.join(' | '));
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
    await testPwa(browser, root.url, 'racine');
    await testLoading(browser, subPath.url, 'sous-chemin, comme GitHub Pages', DESKTOP);
    await testPwa(browser, subPath.url, 'sous-chemin');
    await testSlowNetwork(browser, slow);
    await testEmulator(browser, root.url);
    await testArSession(browser, root.url);
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
