/**
 * Tests de bout en bout du panneau « Tactiques enregistrées » (phase 6), dans Chrome, avec le vrai
 * IndexedDB : renommer, dupliquer, supprimer et partager par un lien une tactique enregistrée, puis
 * ouvrir ce lien sur un autre appareil, par les vrais boutons du panneau.
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
 * Dupliquer : la copie, nommée « Nom (copie) », s'ouvre sur la même tactique que l'original ;
 * le focus va sur son bouton « Renommer ».
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — dupliquer une tactique enregistrée
 */
async function testDuplicateTactic(browser, url, record) {
  const name = 'Tactiques enregistrées : dupliquer, copie identique ouverte, focus sur « Renommer »';
  const context = await browser.newContext(DESKTOP);
  try {
    const { page, errors } = await openApp(context, `${url}?debug`);
    const original = await page.evaluate(() => {
      const { board } = window.__footballSimulator;
      board.setFormation('blue', '3-5-2');
      board.setPlayerPosition('blue', 9, { x: 0.1, z: 0.03 });
      return board.snapshot();
    });
    await saveCurrentTactic(page, 'Bloc haut');
    const id = await page.$eval('.saved-tactics__item', (item) => item.dataset.savedTactic);
    await clickUi(page, `[data-duplicate-tactic="${id}"]`);
    await page.waitForFunction(() => [...document.querySelectorAll('.saved-tactics__item strong')].some((element) => element.textContent === 'Bloc haut (copie)'));
    const problems = [];
    const copyId = await page.$eval('.saved-tactics__item:has(strong[title="Bloc haut (copie)"])', (item) => item.dataset.savedTactic);
    const focused = await page.evaluate(() => document.activeElement?.dataset.renameTactic ?? null);
    if (focused !== copyId) problems.push('le focus ne va pas sur « Renommer » de la copie');
    await page.evaluate(() => window.__footballSimulator.board.reset());
    await clickUi(page, `[data-open-tactic="${copyId}"]`);
    await page.waitForFunction(() => window.__footballSimulator.board.getFormation('blue').name === '3-5-2');
    const opened = await page.evaluate(() => window.__footballSimulator.board.snapshot());
    if (JSON.stringify(opened) !== JSON.stringify(original)) problems.push('la copie ouverte diffère de l\'original');
    if (JSON.stringify((await listedNames(page)).sort()) !== JSON.stringify(['Bloc haut', 'Bloc haut (copie)'])) problems.push('liste inattendue');
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || '« Bloc haut (copie) » rouvre le 3-5-2 et le n° 9 déplacé');
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Supprimer : la confirmation reste dans le panneau, sans fenêtre du navigateur ; « Garder » et
 * Échap ne suppriment rien ; « Supprimer définitivement » retire la tactique, même après un
 * rechargement, et le focus passe à la ligne suivante.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — supprimer une tactique enregistrée
 */
async function testDeleteTactic(browser, url, record) {
  const name = 'Tactiques enregistrées : supprimer après confirmation dans le panneau, Garder et Échap sans effet';
  const context = await browser.newContext(DESKTOP);
  try {
    const { page, errors } = await openApp(context, `${url}?debug`);
    const dialogs = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.type());
      await dialog.dismiss();
    });
    await saveCurrentTactic(page, 'Bloc bas');
    await saveCurrentTactic(page, 'Pressing haut');
    const id = await page.$eval('.saved-tactics__item:has(strong[title="Pressing haut"])', (item) => item.dataset.savedTactic);
    const problems = [];
    await clickUi(page, `[data-delete-tactic="${id}"]`);
    if (!(await page.evaluate(() => document.activeElement?.matches('[data-keep-tactic]')))) problems.push('« Garder » n\'a pas le focus');
    await page.click(`[data-keep-tactic="${id}"]`);
    await clickUi(page, `[data-delete-tactic="${id}"]`);
    await page.keyboard.press('Escape');
    const panelOpen = await page.evaluate(() => document.body.dataset.panelOpen);
    if (panelOpen !== 'true') problems.push('Échap a fermé le panneau au lieu de la confirmation');
    if ((await listedNames(page)).length !== 2) problems.push('« Garder » ou Échap a supprimé une tactique');
    await clickUi(page, `[data-delete-tactic="${id}"]`);
    await page.click(`[data-confirm-delete="${id}"]`);
    await page.waitForFunction(() => document.querySelectorAll('.saved-tactics__item').length === 1);
    const focused = await page.evaluate(() => document.activeElement?.closest('.saved-tactics__item')?.querySelector('strong')?.textContent ?? null);
    if (focused !== 'Bloc bas') problems.push(`focus après suppression : ${focused}`);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('body.is-ready', { timeout: 20000 });
    await openWorkspace(page, 'home');
    await page.waitForSelector('.saved-tactics__item', { state: 'attached' });
    const after = await listedNames(page);
    if (JSON.stringify(after) !== JSON.stringify(['Bloc bas'])) problems.push(`après rechargement : ${after.join(', ')}`);
    if (dialogs.length) problems.push(`fenêtre du navigateur ouverte : ${dialogs.join(', ')}`);
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || '« Pressing haut » supprimée, « Bloc bas » gardée');
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Forme canonique d'une valeur JSON : clés triées à chaque niveau, -0 écrit 0. Deux tactiques
 * égales ont la même forme, quel que soit l'ordre de leurs champs.
 * @param {unknown} value
 * @returns {string}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — outillage des tactiques enregistrées
 */
function canonical(value) {
  /** Copie aux clés triées. */
  const sort = (item) => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().map((key) => [key, sort(item[key])]));
    return item;
  };
  return JSON.stringify(sort(JSON.parse(JSON.stringify(value))));
}

/**
 * Lien de partage : « Lien de partage » copie dans le presse-papiers une adresse de l'application
 * dont le fragment contient la tactique en cours ; le lien est aussi affiché, et « Partager » d'une
 * tactique enregistrée donne le lien de celle-ci. Aucune requête ne part avec la tactique.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — lien de partage d'une tactique
 */
async function testShareLink(browser, url, record) {
  const name = 'Tactiques enregistrées : lien de partage copié, tactique dans le fragment, sans serveur';
  const context = await browser.newContext(DESKTOP);
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
    const { page, errors } = await openApp(context, `${url}?debug`);
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    const expected = await page.evaluate(() => {
      const { board, sequence } = window.__footballSimulator;
      board.setFormation('red', '4-3-3');
      board.setPlayerPosition('red', 10, { x: -0.05, z: 0.06 });
      sequence.add({ players: board.snapshot().players, ball: board.getBallPosition() });
      return board.snapshot();
    });
    const problems = [];
    await openWorkspace(page, 'home');
    await page.fill('[data-tactic-name]', 'Contre rouge');
    await clickUi(page, '[data-share-current-tactic]');
    await page.waitForFunction(() => document.querySelector('[data-share-link]')?.value.includes('#tactique='));
    const link = await page.$eval('[data-share-link]', (field) => field.value);
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    if (clipboard !== link) problems.push('le presse-papiers ne contient pas le lien affiché');
    const parsed = new URL(link);
    if (parsed.search !== '' || parsed.pathname !== new URL(url).pathname) problems.push(`adresse inattendue : ${parsed.origin}${parsed.pathname}${parsed.search}`);
    const decoded = await page.evaluate(async (hash) => {
      const share = await import(new URL('src/tactic-share.mjs', document.baseURI).href);
      const reference = window.__footballSimulator.board.snapshot();
      return share.decodeSharedTactic(share.readSharePayload(hash), reference);
    }, parsed.hash);
    if (!decoded.ok || decoded.name !== 'Contre rouge') problems.push(`lien illisible : ${decoded.error ?? decoded.name}`);
    else if (canonical(decoded.tactic.board) !== canonical(expected) || decoded.tactic.keyframes.length !== 1) problems.push('le lien ne contient pas la tactique en cours');
    const payload = parsed.hash.slice('#tactique='.length);
    if (requests.some((request) => request.includes(payload.slice(0, 40)))) problems.push('la tactique est partie dans une requête');
    // « Partager » d'une tactique enregistrée.
    await saveCurrentTactic(page, 'Contre rouge');
    const id = await page.$eval('.saved-tactics__item', (item) => item.dataset.savedTactic);
    await page.evaluate(() => window.__footballSimulator.board.reset());
    await clickUi(page, `[data-share-tactic="${id}"]`);
    await page.waitForFunction((previous) => document.querySelector('[data-share-link]')?.value !== previous, link);
    const savedLink = await page.$eval('[data-share-link]', (field) => field.value);
    const savedDecoded = await page.evaluate(async (hash) => {
      const share = await import(new URL('src/tactic-share.mjs', document.baseURI).href);
      return share.decodeSharedTactic(share.readSharePayload(hash), window.__footballSimulator.board.snapshot());
    }, new URL(savedLink).hash);
    if (!savedDecoded.ok || canonical(savedDecoded.tactic.board) !== canonical(expected)) problems.push('« Partager » ne donne pas la tactique enregistrée');
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || `lien de ${link.length} caractères`);
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Ouvrir un lien partagé, sur un autre appareil (contexte neuf) : la tactique s'ouvre par une
 * commande annulable, est enregistrée sous un nom libre (« Nom (2) » si le nom est pris), et le
 * fragment quitte l'adresse ; un lien abîmé est refusé sans rien changer.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — ouvrir un lien de partage
 */
async function testOpenSharedLink(browser, url, record) {
  const name = 'Lien partagé : ouvert sur un autre appareil, vérifié, enregistré sous un nom libre, annulable';
  const sender = await browser.newContext(DESKTOP);
  const receiver = await browser.newContext(DESKTOP);
  try {
    const { page: source } = await openApp(sender, `${url}?debug`);
    const shared = await source.evaluate(async () => {
      const { board, sequence } = window.__footballSimulator;
      board.setFormation('blue', '4-2-3-1');
      board.setPlayerPosition('blue', 7, { x: 0.15, z: -0.12 });
      sequence.add({ players: board.snapshot().players, ball: board.getBallPosition() });
      const share = await import(new URL('src/tactic-share.mjs', document.baseURI).href);
      const storage = await import(new URL('src/tactic-storage.mjs', document.baseURI).href);
      const payload = await share.encodeSharedTactic({ name: 'Bloc médian', tactic: storage.captureTactic(board, sequence) });
      return { payload, snapshot: board.snapshot() };
    });
    const { page, errors } = await openApp(receiver, `${url}?debug`);
    await saveCurrentTactic(page, 'Bloc médian');
    const before = await page.evaluate(() => window.__footballSimulator.board.snapshot());
    const problems = [];
    // Lien abîmé, collé dans l'adresse de l'application déjà ouverte (hashchange) : refusé, rien ne change.
    await page.goto(`${url}?debug#tactique=1.${shared.payload.slice(2, 40)}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('hint').textContent.includes('Lien de partage'));
    const refused = await page.evaluate(() => ({ snapshot: window.__footballSimulator.board.snapshot(), hint: document.getElementById('hint').textContent }));
    if (canonical(refused.snapshot) !== canonical(before)) problems.push('un lien abîmé a changé la tactique');
    if (!refused.hint.includes('Lien de partage')) problems.push(`refus non expliqué : « ${refused.hint} »`);
    // Lien valide, ouvert au lancement d'une page neuve.
    await page.goto('about:blank');
    await page.goto(`${url}?debug#tactique=${shared.payload}`, { waitUntil: 'load' });
    await page.waitForSelector('body.is-ready', { timeout: 20000 });
    const opened = await page.evaluate(async () => {
      const app = window.__footballSimulator;
      const result = await app.sharedLink;
      return { result, snapshot: app.board.snapshot(), canUndo: app.history.canUndo, keyframes: app.sequence.length, hash: window.location.hash, search: window.location.search, hint: document.getElementById('hint').textContent };
    });
    if (!opened.result) problems.push('le lien n\'a pas été ouvert');
    if (canonical(opened.snapshot) !== canonical(shared.snapshot) || opened.keyframes !== 1) problems.push('la tactique ouverte diffère de celle partagée');
    if (!opened.canUndo) problems.push('l\'ouverture n\'est pas annulable');
    if (opened.hash !== '' || opened.search !== '?debug') problems.push(`adresse après ouverture : ${opened.search}${opened.hash.slice(0, 20)}`);
    if (!opened.hint.includes('Bloc médian (2)')) problems.push(`message : « ${opened.hint} »`);
    await openWorkspace(page, 'home');
    await page.waitForFunction(() => document.querySelectorAll('.saved-tactics__item').length === 2);
    const names = (await listedNames(page)).sort();
    if (JSON.stringify(names) !== JSON.stringify(['Bloc médian', 'Bloc médian (2)'])) problems.push(`liste : ${names.join(', ')}`);
    await page.evaluate(() => window.__footballSimulator.history.undo());
    const undone = await page.evaluate(() => window.__footballSimulator.board.snapshot());
    if (canonical(undone) !== canonical(before)) problems.push('« Annuler » ne rend pas la tactique précédente');
    problems.push(...errors.filter((error) => !error.includes('Lien de partage')));
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || '4-2-3-1 reçu, enregistré sous « Bloc médian (2) », annulé');
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await sender.close();
    await receiver.close();
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
  await testDuplicateTactic(browser, url, record);
  await testDeleteTactic(browser, url, record);
  await testShareLink(browser, url, record);
  await testOpenSharedLink(browser, url, record);
}
