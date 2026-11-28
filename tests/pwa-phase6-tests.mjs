/**
 * Tests de bout en bout de la PWA (phase 6), dans Chrome, avec le vrai Service Worker : page
 * hors-ligne dédiée à l'analyse de match, à la racine et sous un sous-chemin comme GitHub Pages ;
 * rendu suspendu quand l'onglet est masqué.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/** Contexte de bureau, comme les autres parcours. */
const DESKTOP = { viewport: { width: 1280, height: 800 } };

/**
 * Script injecté avant la page : l'aide au premier lancement est réputée vue.
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — outillage de la PWA
 */
function skipOnboarding() {
  try {
    window.localStorage.setItem('football-simulator:aide-vue', '1');
  } catch {
    // stockage refusé : l'aide s'ouvrira
  }
}

/**
 * Analyse de match jamais ouverte, réseau coupé : sa page hors-ligne s'affiche (et non le tableau
 * tactique), son lien rouvre le tableau hors-ligne, et elle revient à l'analyse avec le réseau.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url adresse de l'application (racine ou sous-chemin)
 * @param {string} label racine ou sous-chemin
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — page hors-ligne de l'analyse de match
 */
async function testVisualizerOfflinePage(browser, url, label, record) {
  const name = `Hors-ligne (${label}) : l'analyse de match jamais ouverte affiche sa page dédiée, pas le tableau tactique`;
  const context = await browser.newContext(DESKTOP);
  try {
    await context.addInitScript(skipOnboarding);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('body.is-ready', { timeout: 20000 });
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    // Deuxième chargement : la page est contrôlée par le Service Worker, la coquille est en cache.
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('body.is-ready', { timeout: 20000 });
    await context.setOffline(true);
    const problems = [];
    await page.goto(new URL('visualizer.html', url).href, { waitUntil: 'load' });
    const offline = await page.evaluate(() => ({ title: document.title, heading: document.querySelector('h1')?.textContent ?? '', board: Boolean(document.getElementById('scene-container')) }));
    if (offline.board || !offline.heading.includes('besoin du réseau')) problems.push(`page servie : « ${offline.title} »`);
    await page.click('a.button--primary');
    await page.waitForURL((address) => !address.pathname.endsWith('/visualizer.html'), { timeout: 15000 });
    const board = await page.waitForSelector('body.is-ready', { timeout: 30000 }).then(() => true).catch(() => false);
    if (!board) problems.push('le lien ne rouvre pas le tableau tactique hors-ligne');
    await page.goto(new URL('visualizer.html', url).href, { waitUntil: 'load' });
    // Retour du réseau : la page ouvre l'analyse de match d'elle-même à l'événement « online »
    // (envoyé ici, l'émulation hors-ligne ne l'émettant pas toujours ; la navigation interrompt l'appel).
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online'))).catch(() => {});
    const reopened = await page.waitForFunction(() => document.readyState === 'complete'
      && window.location.pathname.endsWith('/visualizer.html') && !document.title.includes('hors-ligne'), null, { timeout: 20000 })
      .then(() => true).catch(() => false);
    if (!reopened) problems.push('l\'analyse ne s\'ouvre pas au retour du réseau');
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || 'page dédiée, tableau rouvert, analyse ouverte au retour du réseau');
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Rendu suspendu : onglet masqué (visibilitychange), plus aucune image rendue ; au retour, les
 * images reprennent, la lecture de la séquence repart au même instant et la tactique est intacte.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — rendu suspendu quand l'onglet est masqué
 */
async function testRenderSuspension(browser, url, record) {
  const name = 'Onglet masqué : aucune image rendue, puis reprise du rendu et de la lecture sans perte d\'état';
  const context = await browser.newContext(DESKTOP);
  try {
    await context.addInitScript(skipOnboarding);
    // Visibilité de la page pilotable par le test : l'onglet sans interface reste « visible » sinon.
    await context.addInitScript(() => {
      let state = 'visible';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' });
      window.__setVisibility = (next) => {
        state = next;
        document.dispatchEvent(new Event('visibilitychange'));
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${url}?debug`, { waitUntil: 'load' });
    await page.waitForSelector('body.is-ready', { timeout: 20000 });
    const problems = [];
    const before = await page.evaluate(() => {
      const { board, sequence, sequencePlayer } = window.__footballSimulator;
      sequence.add({ players: board.snapshot().players, ball: board.getBallPosition() });
      board.setBallPosition({ x: 0.2, z: 0.05 });
      sequence.add({ players: board.snapshot().players, ball: board.getBallPosition() });
      sequencePlayer.setSpeed(0.5);
      sequencePlayer.play();
      return JSON.stringify(board.snapshot());
    });
    // Les premières images suivent la compilation des shaders : on attend que la lecture ait avancé.
    const started = await page.waitForFunction(() => window.__footballSimulator.sequencePlayer.cursor > 0.1, null, { timeout: 10000 })
      .then(() => true).catch(() => false);
    if (!started) problems.push('la lecture n\'avance pas avant le masquage');
    const frames = () => page.evaluate(() => window.__footballSimulator.renderer.info.render.calls);
    const hidden = await page.evaluate(() => {
      window.__setVisibility('hidden');
      const app = window.__footballSimulator;
      return { suspended: app.renderSuspension.suspended, state: app.sequencePlayer.state, cursor: app.sequencePlayer.cursor };
    });
    const frozenAt = await frames();
    await page.waitForTimeout(700);
    const frozen = await frames();
    if (!hidden.suspended || frozen !== frozenAt) problems.push(`images rendues onglet masqué : ${frozen - frozenAt}`);
    if (hidden.state !== 'paused') problems.push(`lecture pas mise en pause (${hidden.state})`);
    await page.evaluate(() => window.__setVisibility('visible'));
    await page.waitForTimeout(150);
    const resumed = await page.evaluate(() => {
      const app = window.__footballSimulator;
      return { state: app.sequencePlayer.state, cursor: app.sequencePlayer.cursor, snapshot: JSON.stringify(app.board.snapshot()) };
    });
    const after = await frames();
    if (!(after > frozen)) problems.push('le rendu ne reprend pas');
    if (resumed.state !== 'playing' || resumed.cursor < hidden.cursor || resumed.cursor > hidden.cursor + 0.2) {
      problems.push(`lecture : ${resumed.state}, curseur ${hidden.cursor.toFixed(3)} → ${resumed.cursor.toFixed(3)}`);
    }
    if (resumed.snapshot !== before) problems.push('la tactique a changé');
    problems.push(...errors);
    record(name, problems.length ? 'échec' : 'ok', problems.join(' | ') || `0 image en 700 ms masqué, ${after - frozen} images après le retour, lecture reprise à ${hidden.cursor.toFixed(2)}`);
  } catch (error) {
    record(name, 'échec', error.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

/**
 * Parcours PWA de la phase 6.
 * @param {import('playwright-core').Browser} browser
 * @param {{root: string, subPath: string}} urls adresses à la racine et sous un sous-chemin
 * @param {(name: string, status: string, detail?: string) => void} record
 * @returns {Promise<void>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests de bout en bout — PWA
 */
export async function runPwaPhase6Tests(browser, { root, subPath }, record) {
  await testVisualizerOfflinePage(browser, root, 'racine', record);
  await testVisualizerOfflinePage(browser, subPath, 'sous-chemin', record);
  await testRenderSuspension(browser, root, record);
}
