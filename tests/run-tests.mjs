/**
 * Tests de bout en bout du sprint 1, exécutés dans Chrome sans interface.
 * Ils rejouent les vérifications consignées dans docs/sprint-1.md.
 *
 * Prérequis : Node.js 18 ou plus, Google Chrome installé, puis « npm install ».
 * Usage : npm test   (BROWSER_CHANNEL=msedge pour utiliser Microsoft Edge)
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
 * Lance tous les tests, affiche le bilan et renvoie un code de sortie non nul en cas d'échec.
 */
async function main() {
  const browser = await chromium.launch({ channel: CHANNEL, headless: true, args: LAUNCH_ARGS });
  const root = await startServer();
  const subPath = await startServer({ basePath: '/footballsimulator/' });
  try {
    await testLoading(browser, root.url, 'bureau, 1280 × 800', DESKTOP);
    await testLoading(browser, root.url, 'mobile, 390 × 844', MOBILE);
    await testFormations(browser, root.url);
    await testPwa(browser, root.url, 'racine');
    await testLoading(browser, subPath.url, 'sous-chemin, comme GitHub Pages', DESKTOP);
    await testPwa(browser, subPath.url, 'sous-chemin');
    await testEmulator(browser, root.url);
  } finally {
    await browser.close();
    await root.close();
    await subPath.close();
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
