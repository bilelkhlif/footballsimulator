/**
 * Tests de bout en bout de la phase 6 B, « le regard de l'entraîneur », dans Chrome avec WebGPU :
 * calques de lecture du terrain (tiers, cinq couloirs, demi-espaces, zone 14).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { clickUi } from './workspace-test-helpers.mjs';

/** Contexte de bureau, comme les autres parcours. */
const DESKTOP = { viewport: { width: 1280, height: 800 } };

/**
 * Script injecté avant la page : l'aide au premier lancement est réputée vue.
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — outillage du regard de l'entraîneur
 */
function skipOnboarding() {
  try {
    window.localStorage.setItem('football-simulator:aide-vue', '1');
  } catch {
    // stockage refusé : l'aide s'ouvrira
  }
}

/**
 * Ouvre l'application et collecte les erreurs de la page.
 * @param {import('playwright-core').BrowserContext} context
 * @param {string} url
 * @returns {Promise<{page: import('playwright-core').Page, errors: string[]}>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — outillage du regard de l'entraîneur
 */
async function openApp(context, url) {
  await context.addInitScript(skipOnboarding);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('body.is-ready', { timeout: 20000 });
  return { page, errors };
}

/**
 * Calques : les quatre boutons de la carte Analyse tactique affichent et masquent leur calque, en
 * 3D dans le repère du terrain ; la tactique et l'historique ne changent pas.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — calques de lecture du terrain
 */
async function testPitchLayers(browser, url, record) {
  const name = 'Calques du terrain : tiers, couloirs, demi-espaces et zone 14 affichés depuis l\'analyse, sans changer la tactique';
  const context = await browser.newContext(DESKTOP);
  try {
    const { page, errors } = await openApp(context, `${url}?debug`);
    const before = await page.evaluate(() => JSON.stringify(window.__footballSimulator.board.snapshot()));
    const problems = [];
    const layers = ['thirds', 'lanes', 'half-spaces', 'zone-14'];
    for (const layer of layers) {
      await clickUi(page, `[data-pitch-layer="${layer}"]`);
    }
    const shown = await page.evaluate((names) => {
      const { pitchZones, pitchGroup } = window.__footballSimulator;
      return names.map((layer) => ({
        layer,
        visible: pitchZones.isVisible(layer),
        pressed: document.querySelector(`[data-pitch-layer="${layer}"]`).getAttribute('aria-pressed'),
        inPitch: pitchGroup.getObjectByName('pitch-zones') === pitchZones.objectFor(layer).parent,
      }));
    }, layers);
    for (const { layer, visible, pressed, inPitch } of shown) {
      if (!visible || pressed !== 'true' || !inPitch) problems.push(`${layer} : visible ${visible}, aria-pressed ${pressed}, repère du terrain ${inPitch}`);
    }
    await page.waitForTimeout(300);
    await clickUi(page, '[data-pitch-layer="lanes"]');
    const hidden = await page.evaluate(() => window.__footballSimulator.pitchZones.isVisible('lanes'));
    if (hidden) problems.push('« Cinq couloirs » ne se masque pas');
    const after = await page.evaluate(() => ({
      snapshot: JSON.stringify(window.__footballSimulator.board.snapshot()),
      canUndo: window.__footballSimulator.history.canUndo,
    }));
    if (after.snapshot !== before || after.canUndo) problems.push('un calque a changé la tactique ou l\'historique');
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || 'quatre calques affichés, « Cinq couloirs » masqué de nouveau');
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Parcours du regard de l'entraîneur.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @returns {Promise<void>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — regard de l'entraîneur
 */
export async function runCoachViewTests(browser, url, record) {
  await testPitchLayers(browser, url, record);
}
