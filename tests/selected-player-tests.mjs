/**
 * Tests de bout en bout des actions du joueur sélectionné (src/selected-player-actions.mjs) :
 * « Point de vue » et « Personnaliser le joueur », par de vrais clics, dans Chrome avec WebGPU.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { installAimTools } from './workspace-test-helpers.mjs';

/** Contexte de bureau, comme les autres parcours. */
const DESKTOP = { viewport: { width: 1280, height: 800 } };

/**
 * Script injecté avant la page : l'aide au premier lancement est réputée vue.
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — outillage des actions du joueur sélectionné
 */
function skipOnboarding() {
  try {
    window.localStorage.setItem('football-simulator:aide-vue', '1');
  } catch {
    // stockage refusé : l'aide s'ouvrira
  }
}

/**
 * Boutons masqués sans sélection, visibles et nommés après un clic sur un joueur ; la
 * personnalisation s'applique par une commande annulable ; le point de vue s'ouvre, dit qui l'on
 * regarde, masque l'interface, puis se ferme par Échap sans changer la tactique.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — actions du joueur sélectionné
 */
async function testSelectedPlayerActions(browser, url, record) {
  const name = 'Joueur sélectionné : « Personnaliser le joueur » annulable, « Point de vue » ouvert puis fermé par Échap';
  const context = await browser.newContext(DESKTOP);
  try {
    await context.addInitScript(skipOnboarding);
    await context.addInitScript(installAimTools);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${url}?debug`, { waitUntil: 'load' });
    await page.waitForSelector('body.is-ready', { timeout: 20000 });
    const problems = [];
    if (await page.isVisible('#point-of-view') || await page.isVisible('#customize-player')) problems.push('boutons visibles sans sélection');
    const target = await page.evaluate(() => window.__aim.player('blue'));
    if (!target) throw new Error('aucun joueur bleu visible');
    await page.mouse.click(target.x, target.y);
    const labels = await page.evaluate(() => ['point-of-view', 'customize-player'].map((id) => document.getElementById(id).getAttribute('aria-label')));
    if (!labels.every((label) => label?.includes(`n° ${target.number}`))) problems.push(`libellés : ${labels.join(' | ')}`);
    const before = await page.evaluate(() => JSON.stringify(window.__footballSimulator.board.snapshot()));
    // Personnaliser : cheveux bouclés, appliqués, puis annulés.
    await page.click('#customize-player');
    await page.click('#player-customization [data-hair-style="curly"]');
    await page.click('#player-customization [data-customize-apply]');
    const applied = await page.evaluate((number) => window.__footballSimulator.board.getAppearance('blue', number).hair, target.number);
    if (applied !== 'curly') problems.push(`coupe appliquée : ${applied}`);
    await page.evaluate(() => window.__footballSimulator.history.undo());
    const undone = await page.evaluate(() => JSON.stringify(window.__footballSimulator.board.snapshot()));
    if (undone !== before) problems.push('« Annuler » ne rend pas l\'apparence d\'avant');
    // Point de vue : le joueur est toujours sélectionné, son bouton ouvre la vue.
    if (!(await page.isVisible('#point-of-view'))) {
      await page.mouse.click(target.x, target.y);
    }
    await page.click('#point-of-view');
    const opened = await page.evaluate(() => ({
      active: window.__footballSimulator.pointOfView.active,
      title: document.querySelector('[data-pov-title]').textContent,
      nav: document.getElementById('workspace-nav').getClientRects().length > 0,
    }));
    if (!opened.active || !opened.title.includes(`n° ${target.number}`) || opened.nav) problems.push(`point de vue : ${JSON.stringify(opened)}`);
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(() => ({ active: window.__footballSimulator.pointOfView.active, snapshot: JSON.stringify(window.__footballSimulator.board.snapshot()) }));
    if (closed.active) problems.push('Échap ne ferme pas le point de vue');
    if (closed.snapshot !== before) problems.push('la tactique a changé');
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || `n° ${target.number} des Bleus : coupe appliquée puis annulée, point de vue ouvert puis fermé`);
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Parcours des actions du joueur sélectionné.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @returns {Promise<void>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — actions du joueur sélectionné
 */
export async function runSelectedPlayerTests(browser, url, record) {
  await testSelectedPlayerActions(browser, url, record);
}
