/**
 * Tests de bout en bout de la pose du terrain en AR (phase 6), avec l'émulateur IWER : taille du
 * terrain choisie avant l'entrée en AR, changée après la pose, puis vue 3D rendue à l'échelle 1.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { clickUi, installAimTools } from './workspace-test-helpers.mjs';

/** Contexte de bureau, comme le parcours AR existant. */
const DESKTOP = { viewport: { width: 1280, height: 800 } };

/**
 * Script injecté avant la page : l'aide au premier lancement est réputée vue.
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — outillage de la pose en AR
 */
function skipOnboarding() {
  try {
    window.localStorage.setItem('football-simulator:aide-vue', '1');
  } catch {
    // stockage refusé : l'aide s'ouvrira
  }
}

/**
 * Ouvre l'application avec l'émulateur IWER, et entre en AR, le téléphone émulé visant la table ;
 * rend null si l'émulateur (téléchargé depuis son CDN) est indisponible.
 * @param {import('playwright-core').BrowserContext} context
 * @param {string} url
 * @returns {Promise<{page: import('playwright-core').Page, errors: string[]}|null>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — outillage de la pose en AR
 */
async function openAr(context, url) {
  await context.addInitScript(skipOnboarding);
  await context.addInitScript(installAimTools);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${url}?iwer&debug`, { waitUntil: 'load' });
  await page.waitForSelector('body.is-ready', { timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('xr-status')?.dataset.state !== 'checking', null, { timeout: 30000 });
  if (await page.evaluate(() => document.getElementById('xr-status').dataset.state) !== 'emulated') {
    return null;
  }
  return { page, errors };
}

/**
 * Oriente le téléphone émulé vers le bas (en degrés), puis entre en AR et pose le terrain sur la
 * table virtuelle par un toucher au centre de l'écran.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<void>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — outillage de la pose en AR
 */
async function enterAndPlace(page) {
  await page.evaluate(() => {
    const half = -(35 * Math.PI) / 360;
    window.__footballSimulator.xrDevice.quaternion.set(Math.sin(half), 0, 0, Math.cos(half));
  });
  await clickUi(page, '#enter-ar');
  await page.waitForFunction(() => document.body.dataset.xr === 'active', null, { timeout: 15000 });
  await page.waitForFunction(() => window.__footballSimulator.placement?.state === 'surface', null, { timeout: 15000 });
  await page.mouse.click(640, 380);
  await page.waitForFunction(() => window.__footballSimulator.placement?.state === 'placed', null, { timeout: 15000 });
}

/**
 * Taille du terrain : « Sol · 2 m » choisi avant l'entrée, appliqué à la pose ; « Table · 60 cm »
 * pendant la session le réduit, posé au même endroit ; la sortie rend la vue 3D à l'échelle 1.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — taille du terrain en AR
 */
async function testArPitchSize(browser, url, record) {
  const name = 'AR (IWER) : taille du terrain choisie avant l\'entrée, changée après la pose, vue 3D à l\'échelle 1 à la sortie';
  const context = await browser.newContext(DESKTOP);
  try {
    const opened = await openAr(context, url);
    if (!opened) {
      record(name, 'ignoré', 'émulateur indisponible (réseau ?)');
      return;
    }
    const { page, errors } = opened;
    await clickUi(page, '[data-ar-size="floor"]');
    await enterAndPlace(page);
    const read = () => page.evaluate(() => {
      const { pitchGroup } = window.__footballSimulator;
      return { scale: Number(pitchGroup.scale.x.toFixed(3)), x: pitchGroup.position.x, y: pitchGroup.position.y, z: pitchGroup.position.z };
    });
    const floor = await read();
    const problems = [];
    if (floor.scale !== 3.333) problems.push(`échelle à la pose : ${floor.scale}`);
    await clickUi(page, '[data-ar-size="table"]');
    const table = await read();
    if (table.scale !== 1) problems.push(`échelle après « Table » : ${table.scale}`);
    if (Math.hypot(table.x - floor.x, table.z - floor.z) > 1e-6) problems.push('le terrain a quitté sa place en changeant de taille');
    if (!(floor.y > table.y)) problems.push('le plateau agrandi n\'est pas relevé');
    const pressed = await page.getAttribute('[data-ar-size="table"]', 'aria-pressed');
    if (pressed !== 'true') problems.push('bouton « Table » non marqué');
    await clickUi(page, '#exit-ar');
    await page.waitForFunction(() => document.body.dataset.xr === 'inactive', null, { timeout: 15000 });
    const after = await read();
    if (after.scale !== 1) problems.push(`vue 3D à l'échelle ${after.scale}`);
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || `× ${floor.scale} au sol, × 1 sur la table, relevé de ${((floor.y - table.y) * 1000).toFixed(1)} mm`);
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Parcours de la pose du terrain en AR.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @returns {Promise<void>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — pose du terrain en AR
 */
export async function runArPlacementTests(browser, url, record) {
  await testArPitchSize(browser, url, record);
}
