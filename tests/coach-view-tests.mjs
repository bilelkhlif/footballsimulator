/**
 * Tests de bout en bout de la phase 6 B, « le regard de l'entraîneur », dans Chrome avec WebGPU :
 * calques de lecture du terrain (tiers, cinq couloirs, demi-espaces, zone 14), notes des images clés,
 * zones surlignées, situation du coup franc contre un mur et une défense en zone, mode présentation.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { clickUi, installAimTools } from './workspace-test-helpers.mjs';

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
 * Notes des images clés : saisie dans le panneau de la séquence, légende affichée pendant la
 * lecture (note de l'image la plus proche), annulation, puis note gardée après un rechargement.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — notes des images clés
 */
async function testKeyframeNotes(browser, url, record) {
  const name = 'Notes des images clés : saisie, légende pendant la lecture, Annuler, gardées au rechargement';
  const context = await browser.newContext(DESKTOP);
  try {
    const { page, errors } = await openApp(context, `${url}?debug`);
    await clickUi(page, '[data-sequence="keyframe"]');
    await page.evaluate(() => window.__footballSimulator.board.setPlayerPosition('blue', 9, { x: 0.15, z: 0.02 }));
    await clickUi(page, '[data-sequence="keyframe"]');
    const problems = [];
    await page.fill('[data-keyframe-note="0"]', 'Relance courte du gardien');
    await page.press('[data-keyframe-note="0"]', 'Enter');
    await page.fill('[data-keyframe-note="1"]', 'Le 9 attaque la profondeur');
    await page.press('[data-keyframe-note="1"]', 'Enter');
    const notes = await page.evaluate(() => [0, 1].map((index) => window.__footballSimulator.sequence.noteAt(index)));
    if (notes.join('|') !== 'Relance courte du gardien|Le 9 attaque la profondeur') problems.push(`notes : ${notes.join(' | ')}`);
    await clickUi(page, '[data-sequence="play"]');
    await page.waitForFunction(() => !document.getElementById('sequence-note').hidden);
    const first = await page.$eval('#sequence-note', (element) => element.textContent);
    if (!first.includes('Relance courte du gardien')) problems.push(`légende au départ : « ${first} »`);
    await page.waitForFunction(() => document.getElementById('sequence-note').textContent.includes('profondeur'), null, { timeout: 5000 });
    const visible = await page.$eval('#sequence-note', (element) => element.getBoundingClientRect().height > 0);
    if (!visible) problems.push('légende invisible');
    await page.evaluate(() => window.__footballSimulator.history.undo());
    const undone = await page.evaluate(() => ({ note: window.__footballSimulator.sequence.noteAt(1), field: document.querySelector('[data-keyframe-note="1"]').value, caption: document.getElementById('sequence-note').hidden }));
    if (undone.note !== '' || undone.field !== '') problems.push('« Annuler » ne retire pas la seconde note');
    if (!undone.caption) problems.push('la légende reste après l\'arrêt de la lecture');
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('body.is-ready', { timeout: 20000 });
    const kept = await page.evaluate(() => window.__footballSimulator.sequence.noteAt(0));
    if (kept !== 'Relance courte du gardien') problems.push(`après rechargement : « ${kept} »`);
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || 'deux notes, légende suivie pendant la lecture, première note gardée');
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Zone surlignée : l'outil « Zone » de la barre, deux clics sur le gazon, la zone listée dans sa
 * carte, dessinée en 3D, annulable par Ctrl+Z, retirée par « Retirer », puis gardée au rechargement.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — zones surlignées
 */
async function testHighlightedZone(browser, url, record) {
  const name = 'Zone surlignée : deux clics sur le terrain, listée, dessinée, annulable, retirée, gardée au rechargement';
  const context = await browser.newContext(DESKTOP);
  try {
    await context.addInitScript(installAimTools);
    const { page, errors } = await openApp(context, `${url}?debug`);
    await clickUi(page, '[data-mode="zone"]');
    await page.evaluate(() => document.activeElement?.blur());
    const problems = [];
    // Le panneau se replie : le terrain est entier pour viser.
    await page.keyboard.press('Escape');
    const corners = await page.evaluate(async () => ({
      a: await window.__aim.spot([[0.04, -0.06], [0.05, -0.07], [0.03, -0.05]]),
      b: await window.__aim.spot([[0.16, 0.05], [0.15, 0.06], [0.17, 0.04]]),
    }));
    if (!corners.a || !corners.b) throw new Error('coins de zone introuvables à l\'écran');
    await page.mouse.click(corners.a.sx, corners.a.sy);
    await page.mouse.move(corners.b.sx, corners.b.sy, { steps: 4 });
    const preview = await page.evaluate(() => window.__footballSimulator.zoneLayer.previewVisible);
    if (!preview) problems.push('pas d\'aperçu de la zone pendant le tracé');
    await page.mouse.click(corners.b.sx, corners.b.sy);
    const drawn = await page.evaluate(() => ({ zones: window.__footballSimulator.board.getZones(), count: window.__footballSimulator.zoneLayer.count }));
    if (drawn.zones.length !== 1 || drawn.count !== 1) problems.push(`zones après deux clics : ${drawn.zones.length}, dessinées : ${drawn.count}`);
    const listed = await page.$$eval('#zone-panel [data-zone]', (items) => items.map((item) => item.textContent));
    if (listed.length !== 1 || !/m · tiers/.test(listed[0])) problems.push(`liste : ${listed.join(' | ')}`);
    await page.keyboard.press('Control+z');
    if ((await page.evaluate(() => window.__footballSimulator.board.getZones().length)) !== 0) problems.push('Ctrl+Z ne retire pas la zone');
    await page.keyboard.press('Control+y');
    await clickUi(page, '#zone-panel [data-remove-zone]');
    if ((await page.evaluate(() => window.__footballSimulator.board.getZones().length)) !== 0) problems.push('« Retirer » ne retire pas la zone');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('body.is-ready', { timeout: 20000 });
    const kept = await page.evaluate(() => window.__footballSimulator.board.getZones());
    if (kept.length !== 1 || JSON.stringify(kept) !== JSON.stringify(drawn.zones)) problems.push('zone perdue au rechargement');
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || listed[0]);
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Coup franc contre un mur et une défense en zone : la situation se charge depuis sa carte, se
 * joue avec ses notes affichées, et s'annule.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — situation du coup franc
 */
async function testFreeKickScenario(browser, url, record) {
  const name = 'Situation : coup franc contre un mur et une défense en zone, chargée, jouée avec ses notes, annulée';
  const context = await browser.newContext(DESKTOP);
  try {
    const { page, errors } = await openApp(context, `${url}?debug`);
    const before = await page.evaluate(() => JSON.stringify(window.__footballSimulator.board.snapshot()));
    const selector = '[data-load-scenario="coup-franc-mur-defense-en-zone"]';
    await page.waitForSelector(selector, { state: 'attached', timeout: 10000 });
    await clickUi(page, selector);
    const problems = [];
    const loaded = await page.evaluate(() => ({
      arrows: window.__footballSimulator.board.getArrows().map(({ kind }) => kind),
      keyframes: window.__footballSimulator.sequence.length,
      wall: ['red:7', 'red:8'].map((key) => window.__footballSimulator.board.snapshot().players[key]),
      markings: window.__footballSimulator.board.getMarkings().length,
    }));
    if (loaded.arrows.join(',') !== 'cross,run,run,run,run,shot' || loaded.keyframes !== 4 || loaded.markings !== 0) problems.push(`chargé : ${JSON.stringify(loaded)}`);
    await clickUi(page, '[data-sequence="play"]');
    await page.waitForFunction(() => document.getElementById('sequence-note').textContent.includes('mur de deux'));
    await page.waitForFunction(() => document.getElementById('sequence-note').textContent.includes('premier poteau'), null, { timeout: 8000 });
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => JSON.stringify(window.__footballSimulator.board.snapshot()));
    if (after !== before) problems.push('Ctrl+Z ne rend pas le tableau de départ');
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || 'centre, quatre courses et tir ; notes lues pendant la lecture');
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Mode présentation : le bouton de l'espace Plus d'outils masque l'interface et agrandit les numéros ;
 * un clic sur le terrain ne déplace rien ; Espace joue la séquence ; Échap rend l'interface,
 * et la tactique inchangée.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — mode présentation
 */
async function testPresentationMode(browser, url, record) {
  const name = 'Mode présentation : interface masquée, numéros agrandis, tactique protégée, Espace joue, Échap sort';
  const context = await browser.newContext(DESKTOP);
  try {
    await context.addInitScript(installAimTools);
    const { page, errors } = await openApp(context, `${url}?debug`);
    await page.evaluate(() => {
      const { board, sequence } = window.__footballSimulator;
      sequence.add({ players: board.snapshot().players, ball: board.getBallPosition() });
      board.setPlayerPosition('blue', 9, { x: 0.15, z: 0 });
      sequence.add({ players: board.snapshot().players, ball: board.getBallPosition() });
    });
    const before = await page.evaluate(() => JSON.stringify(window.__footballSimulator.board.snapshot()));
    const problems = [];
    await clickUi(page, '#presentation-open');
    const shown = await page.evaluate(() => {
      const visible = (selector) => {
        const element = document.querySelector(selector);
        return Boolean(element) && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
      };
      const label = window.__footballSimulator.pitchGroup.getObjectByName('team-blue').children[0].children.find((child) => child.isSprite);
      return {
        state: document.body.dataset.presentation,
        nav: visible('#workspace-nav'), topbar: visible('.topbar'), bottombar: visible('.bottombar'),
        exit: visible('#presentation-exit'), focus: document.activeElement?.id, labelScale: label.scale.x,
      };
    });
    if (shown.state !== 'on' || shown.nav || shown.topbar || shown.bottombar) problems.push(`interface encore visible : ${JSON.stringify(shown)}`);
    if (!shown.exit || shown.focus !== 'presentation-exit') problems.push('bouton de sortie absent ou sans focus');
    if (!(shown.labelScale > 0.02)) problems.push(`numéros non agrandis (${shown.labelScale})`);
    const target = await page.evaluate(() => window.__aim.player('red'));
    const spot = await page.evaluate(() => window.__aim.spot([[0.05, 0.1], [0.02, 0.12]]));
    if (target && spot) {
      await page.mouse.click(target.x, target.y);
      await page.mouse.click(spot.sx, spot.sy);
    }
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Space');
    const playing = await page.evaluate(() => window.__footballSimulator.sequencePlayer.state);
    if (playing !== 'playing') problems.push(`Espace ne lance pas la séquence (${playing})`);
    await page.keyboard.press('Escape');
    const after = await page.evaluate(() => ({
      state: document.body.dataset.presentation ?? null,
      nav: document.querySelector('#workspace-nav').getClientRects().length > 0,
      focus: document.activeElement?.id,
      snapshot: JSON.stringify(window.__footballSimulator.board.snapshot()),
    }));
    if (after.state !== null || !after.nav) problems.push('Échap ne rend pas l\'interface');
    if (after.focus === 'presentation-exit') problems.push('le focus reste sur un bouton masqué');
    if (after.snapshot !== before) problems.push('la tactique a changé pendant la présentation');
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || `numéros ×${(shown.labelScale / 0.014).toFixed(1)}, clics sans effet, sortie par Échap`);
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
  await testKeyframeNotes(browser, url, record);
  await testHighlightedZone(browser, url, record);
  await testFreeKickScenario(browser, url, record);
  await testPresentationMode(browser, url, record);
}
