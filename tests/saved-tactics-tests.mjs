/**
 * Tests de bout en bout du panneau « Tactiques enregistrées » (phase 6), dans Chrome, avec le vrai
 * IndexedDB : renommer une tactique enregistrée, par les vrais boutons du panneau.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { clickUi, openWorkspace } from './workspace-test-helpers.mjs';

/** Contexte de bureau, comme les autres parcours. */
const DESKTOP = { viewport: { width: 1280, height: 800 } };

/**
 * Script injecté avant la page : l'aide au premier lancement est réputée vue.
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — outillage des tactiques enregistrées
 */
function skipOnboarding() {
  try {
    window.localStorage.setItem('football-simulator:aide-vue', '1');
  } catch {
    // stockage refusé : l'aide s'ouvrira
  }
}

/**
 * Ouvre l'application avec ?debug et collecte les erreurs de la page.
 * @param {import('playwright-core').BrowserContext} context
 * @param {string} url
 * @returns {Promise<{page: import('playwright-core').Page, errors: string[]}>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — outillage des tactiques enregistrées
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
 * Enregistre la tactique en cours sous un nom, par le champ et le bouton du panneau.
 * @param {import('playwright-core').Page} page
 * @param {string} name
 * @returns {Promise<void>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — outillage des tactiques enregistrées
 */
async function saveCurrentTactic(page, name) {
  await openWorkspace(page, 'home');
  await page.fill('[data-tactic-name]', name);
  await page.click('[data-save-tactic]');
  await page.waitForFunction((expected) => [...document.querySelectorAll('.saved-tactics__item strong')]
    .some((element) => element.textContent === expected), name);
}

/**
 * Noms affichés dans la liste des tactiques enregistrées.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<string[]>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — outillage des tactiques enregistrées
 */
function listedNames(page) {
  return page.$$eval('.saved-tactics__item strong', (elements) => elements.map((element) => element.textContent));
}

/**
 * Renommer : la ligne devient un formulaire ; un nom déjà pris est refusé sans rien changer,
 * Échap rend la ligne, puis un nouveau nom est gardé après un rechargement.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — renommer une tactique enregistrée
 */
async function testRenameTactic(browser, url, record) {
  const name = 'Tactiques enregistrées : renommer, refus d\'un nom pris, Échap, nom gardé au rechargement';
  const context = await browser.newContext(DESKTOP);
  try {
    const { page, errors } = await openApp(context, `${url}?debug`);
    await saveCurrentTactic(page, 'Bloc bas');
    await saveCurrentTactic(page, 'Pressing haut');
    const id = await page.$eval('.saved-tactics__item:has(strong[title="Bloc bas"])', (item) => item.dataset.savedTactic);
    const problems = [];
    await clickUi(page, `[data-rename-tactic="${id}"]`);
    if (!(await page.evaluate(() => document.activeElement?.matches('[data-rename-input]')))) problems.push('le champ du nouveau nom n\'a pas le focus');
    await page.fill(`[data-rename-input="${id}"]`, 'pressing HAUT');
    await page.click(`[data-confirm-rename="${id}"]`);
    await page.waitForTimeout(200);
    const refused = await page.$eval('#saved-tactics-panel [role="status"]', (status) => status.textContent);
    if (!refused.includes('déjà')) problems.push(`refus non expliqué : « ${refused} »`);
    await page.press(`[data-rename-input="${id}"]`, 'Escape');
    if (await page.$(`[data-rename-input="${id}"]`)) problems.push('Échap ne ferme pas le formulaire');
    if (JSON.stringify((await listedNames(page)).sort()) !== JSON.stringify(['Bloc bas', 'Pressing haut'])) problems.push('un refus a changé la liste');
    await clickUi(page, `[data-rename-tactic="${id}"]`);
    await page.fill(`[data-rename-input="${id}"]`, '  Bloc   médian ');
    await page.press(`[data-rename-input="${id}"]`, 'Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('.saved-tactics__item strong')].some((element) => element.textContent === 'Bloc médian'));
    const focused = await page.evaluate(() => document.activeElement?.dataset.renameTactic ?? null);
    if (focused !== id) problems.push('le focus ne revient pas sur « Renommer »');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('body.is-ready', { timeout: 20000 });
    await openWorkspace(page, 'home');
    await page.waitForSelector('.saved-tactics__item', { state: 'attached' });
    const after = (await listedNames(page)).sort();
    if (JSON.stringify(after) !== JSON.stringify(['Bloc médian', 'Pressing haut'])) problems.push(`après rechargement : ${after.join(', ')}`);
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || '« Bloc bas » devient « Bloc médian »');
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Parcours du panneau « Tactiques enregistrées ».
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @returns {Promise<void>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — tactiques enregistrées
 */
export async function runSavedTacticsTests(browser, url, record) {
  await testRenameTactic(browser, url, record);
}
