/**
 * Tests navigateur des espaces : vrais clics, état partagé, clavier, gestes et fonctionnement PWA.
 * Exécution ciblée : node tests/workspace-tests.mjs ; aussi inclus dans npm test.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';
import { clickUi, installAimTools, openWorkspace } from './workspace-test-helpers.mjs';

/** Espaces du produit et boutons dont l'accès doit être préservé. */
const CONTROLS = {
  home: ['[data-workspace-panel="home"] [data-workspace="tactics"]'],
  formations: ['.formation-button[data-team="blue"][data-formation="4-4-2"]', '.formation-button[data-team="red"][data-formation="4-2-3-1"]'],
  tactics: ['[data-mode="move"]', '[data-mode="pass"]', '[data-mode="run"]', '[data-action="undo"]', '[data-action="redo"]', '[data-action="reset"]'],
  animation: ['[data-sequence="keyframe"]', '[data-sequence="play"]', '[data-sequence="restart"]', '[data-sequence="clear"]', '[data-speed="0.5"]', '[data-speed="1"]', '[data-speed="2"]'],
  ar: ['#ar-capability'],
  more: ['#connection-summary', '#offline-cache-status', '#diagnostics-toggle'],
  settings: ['#help-toggle', '.shortcut-list', '#motion-preference'],
};

/**
 * Compte les nouvelles liaisons du rail et les contextes WebGPU, avant tout module de l'app.
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout — instrumentation de la navigation
 */
function instrumentWorkspace() {
  localStorage.setItem('football-simulator:aide-vue', '1');
  window.__workspaceAdds = 0;
  window.__workspaceGpuContexts = 0;
  const gpuContexts = new Set();
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function countedListener(type, ...args) {
    if (this.id === 'overlay' || this.id === 'workspace-nav') window.__workspaceAdds += 1;
    return add.call(this, type, ...args);
  };
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function countedContext(type, ...args) {
    const context = getContext.call(this, type, ...args);
    if (type === 'webgpu' && context) gpuContexts.add(context);
    window.__workspaceGpuContexts = gpuContexts.size;
    return context;
  };
}

/**
 * Vérifie les quatre coins et les 22 têtes dans le canvas, hors de la navigation et des panneaux.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<number>} nombre de points masqués
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout — visibilité réelle du terrain
 */
async function hiddenPitchPoints(page) {
  return page.evaluate(async () => {
    const context = await window.__aim.context();
    const { THREE, app, rect } = context;
    const { PITCH_LENGTH, PITCH_WIDTH } = await import(new URL('src/config.mjs', document.baseURI).href);
    const corners = [-1, 1].flatMap((x) => [-1, 1].map((z) => app.pitchGroup.localToWorld(new THREE.Vector3(x * PITCH_LENGTH / 2, 0, z * PITCH_WIDTH / 2))));
    const players = ['blue', 'red'].flatMap((id) => app.pitchGroup.getObjectByName(`team-${id}`).children.map((player) => player.localToWorld(new THREE.Vector3(0, 0.03, 0))));
    const top = document.querySelector('.topbar').getBoundingClientRect().bottom;
    const bottom = document.querySelector('.bottombar').getBoundingClientRect().top;
    return [...corners, ...players].map((world) => window.__aim.toScreen(context, world)).filter(({ x, y }) => {
      const surface = document.elementFromPoint(x, y);
      return x < rect.left || x > rect.right || y < top || y > bottom || surface?.closest('.workspace-panel, #workspace-nav');
    }).length;
  });
}

/**
 * Parcours de navigation supplémentaires, avec le même navigateur que la suite historique.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout — espaces de coaching
 */
export async function runWorkspaceTests(browser, url, record) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(instrumentWorkspace);
  await context.addInitScript(installAimTools);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  /** Exécute une assertion et conserve les échecs sans masquer les autres parcours. */
  const check = async (name, action) => {
    try { await action(); record(`Espaces : ${name}`, 'ok'); }
    catch (error) { record(`Espaces : ${name}`, 'échec', error.message); }
  };
  try {
    await page.goto(`${url}?debug`);
    await page.waitForSelector('body.is-ready');
    await page.evaluate(() => {
      const app = window.__footballSimulator;
      window.__sharedObjects = [app.scene, app.renderer, app.board, app.history, app.sequence, app.tacticalView, app.renderer.domElement];
      window.__initialWorkspaceListeners = window.__workspaceAdds;
    });
    for (const [id, selectors] of Object.entries(CONTROLS)) {
      await check(`ouvrir ${id} et atteindre ses commandes`, async () => {
        await openWorkspace(page, id);
        assert.equal(await page.locator('[data-workspace-panel]:visible').count(), 1);
        assert.equal(await page.locator('#workspace-nav [aria-current="page"]').getAttribute('data-workspace'), id);
        for (const selector of selectors) {
          const target = page.locator(selector);
          await target.scrollIntoViewIfNeeded();
          assert.equal(await target.isVisible(), true, selector);
        }
        assert.equal(await hiddenPitchPoints(page), 0);
      });
    }
    await check('formation, passe, image clé et historique partagés entre les espaces', async () => {
      await clickUi(page, '.formation-button[data-team="blue"][data-formation="4-4-2"]');
      await clickUi(page, '[data-mode="pass"]');
      await page.waitForTimeout(600);
      const ball = await page.evaluate(() => window.__aim.ball());
      assert.ok(ball, 'ballon visible et sélectionnable');
      await page.mouse.click(ball.x, ball.y);
      const end = await page.evaluate(() => window.__aim.spot([[0.12, -0.08], [0.15, 0.1], [0.08, 0.15], [0.2, 0]]));
      assert.ok(end, 'arrivée libre');
      await page.mouse.click(end.sx, end.sy);
      await page.waitForFunction(() => window.__footballSimulator.board.getArrows().length === 1);
      const snapshot = await page.evaluate(() => window.__footballSimulator.board.snapshot());
      await clickUi(page, '[data-sequence="keyframe"]');
      for (const id of ['home', 'formations', 'tactics', 'ar', 'more', 'settings', 'animation']) await openWorkspace(page, id);
      const current = await page.evaluate(() => {
        const app = window.__footballSimulator;
        return { snapshot: app.board.snapshot(), keyframes: app.sequence.length, canUndo: app.history.canUndo };
      });
      assert.deepEqual(current.snapshot, snapshot);
      assert.equal(current.keyframes, 1);
      assert.equal(current.canUndo, true);
      await page.keyboard.press('Control+z');
      assert.equal(await page.evaluate(() => window.__footballSimulator.sequence.length), 0);
      await page.keyboard.press('Control+y');
      assert.equal(await page.evaluate(() => window.__footballSimulator.sequence.length), 1);
    });
    await check('sélection, tracé et Abandonner conservés pendant un changement d’espace', async () => {
      await clickUi(page, '[data-mode="move"]');
      const player = await page.evaluate(() => window.__aim.player('red'));
      await page.mouse.click(player.x, player.y);
      const selected = await page.evaluate(() => window.__footballSimulator.interaction.selection);
      assert.ok(selected);
      await openWorkspace(page, 'formations');
      assert.deepEqual(await page.evaluate(() => window.__footballSimulator.interaction.selection), selected);
      await page.locator('#cancel-draft').click();
      assert.equal(await page.evaluate(() => window.__footballSimulator.interaction.selection), null);
      await clickUi(page, '[data-mode="run"]');
      const blue = await page.evaluate(() => window.__aim.player('blue'));
      await page.mouse.click(blue.x, blue.y);
      const draft = await page.evaluate(() => window.__footballSimulator.interaction.draft);
      assert.ok(draft);
      await openWorkspace(page, 'animation');
      assert.deepEqual(await page.evaluate(() => window.__footballSimulator.interaction.draft), draft);
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => window.__footballSimulator.interaction.draft), null);
      assert.equal(await page.locator('#workspace-panel').isVisible(), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#workspace-panel').isVisible(), false);
    });
    await check('Retour navigateur, Avancer, Fermer et restitution du focus', async () => {
      await openWorkspace(page, 'formations');
      await page.goBack();
      await page.waitForFunction(() => document.body.dataset.panelOpen === 'false');
      await page.goForward();
      await page.waitForFunction(() => document.body.dataset.workspace === 'formations' && document.body.dataset.panelOpen === 'true');
      await page.locator('[data-workspace-close]').first().click();
      assert.equal(await page.locator('#workspace-panel').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'formations-toggle');
      // Attend le popstate de fermeture avant l'ouverture suivante.
      await page.waitForFunction(() => !history.state?.footballWorkspace);
    });
    await check('clavier : flèches, Début / Fin, Entrée, Tab et focus visible', async () => {
      await page.locator('#home-toggle').focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'formations-toggle');
      await page.keyboard.press('End');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'settings-toggle');
      await page.keyboard.press('Home');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'home-toggle');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('[data-workspace-panel="home"]').isVisible(), true);
      const outline = await page.locator('#home-toggle').evaluate((el) => getComputedStyle(el).outlineWidth);
      assert.equal(outline, '3px');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'formations-toggle');
    });
    await check('libellés du rail : agrandir puis replier sans perdre la tactique ni masquer les joueurs', async () => {
      await openWorkspace(page, 'settings');
      const snapshot = await page.evaluate(() => window.__footballSimulator.board.snapshot());
      await page.locator('[data-expand-rail]').click();
      assert.equal(await page.locator('[data-expand-rail]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#workspace-nav').evaluate((el) => el.getBoundingClientRect().width), 224);
      await page.waitForTimeout(100);
      assert.equal(await hiddenPitchPoints(page), 0);
      await page.locator('[data-expand-rail]').click();
      assert.equal(await page.locator('#workspace-nav').evaluate((el) => el.getBoundingClientRect().width), 76);
      assert.deepEqual(await page.evaluate(() => window.__footballSimulator.board.snapshot()), snapshot);
    });
    await check('changements rapides : une scène, un contexte WebGPU, pas de nouveaux écouteurs ni double image clé', async () => {
      const result = await page.evaluate(async () => {
        const app = window.__footballSimulator;
        const { createWorkspaceNavigation } = await import(new URL('src/workspace-navigation.mjs', document.baseURI).href);
        const before = window.__workspaceAdds;
        let sameBinding = true;
        for (let index = 0; index < 70; index += 1) {
          document.querySelector(`#workspace-nav [data-workspace="${['home', 'formations', 'tactics', 'animation', 'ar', 'more', 'settings'][index % 7]}"]`).click();
          sameBinding &&= createWorkspaceNavigation({ root: document.getElementById('overlay'), controller: app.workspaces }) === app.navigation;
        }
        const current = [app.scene, app.renderer, app.board, app.history, app.sequence, app.tacticalView, app.renderer.domElement];
        return { sameObjects: current.every((object, index) => object === window.__sharedObjects[index]), sameBinding, adds: window.__workspaceAdds - before, gpu: window.__workspaceGpuContexts, canvas: document.querySelectorAll('#scene-container canvas').length };
      });
      assert.deepEqual(result, { sameObjects: true, sameBinding: true, adds: 0, gpu: 1, canvas: 1 });
      const before = await page.evaluate(() => window.__footballSimulator.sequence.length);
      await clickUi(page, '[data-sequence="keyframe"]');
      assert.equal(await page.evaluate(() => window.__footballSimulator.sequence.length), before + 1);
    });
    await check('fermer puis rouvrir immédiatement ne laisse pas un Retour différé fermer le nouvel espace', async () => {
      await openWorkspace(page, 'formations');
      await page.evaluate(() => {
        document.getElementById('formations-toggle').click();
        document.getElementById('tactics-toggle').click();
        document.getElementById('sequence-toggle').click();
      });
      await page.waitForFunction(() => history.state?.footballWorkspace === 'animation');
      assert.equal(await page.locator('[data-workspace-panel="animation"]').isVisible(), true);
    });
    await check('zoom et recentrage réels, diagnostics activables sans rechargement', async () => {
      const before = await page.evaluate(() => window.__footballSimulator.camera.position.length());
      await page.locator('#zoom-in').click();
      assert.ok(await page.evaluate(() => window.__footballSimulator.camera.position.length()) < before);
      await page.locator('#zoom-out').click();
      await page.locator('#reset-view').click();
      await clickUi(page, '#diagnostics-toggle');
      await page.waitForFunction(() => Number(document.querySelector('#diagnostics [data-field="fps"]').textContent) > 0);
      assert.equal(await page.locator('#diagnostics').isVisible(), true);
      await clickUi(page, '#diagnostics-toggle');
      assert.equal(await page.locator('#diagnostics').isVisible(), false);
    });
    await check('capacités honnêtes : pas d’entrée AR sans support ; installation PWA conditionnelle', async () => {
      await openWorkspace(page, 'ar');
      assert.equal(await page.locator('#xr-status').getAttribute('data-state'), 'unsupported');
      assert.equal(await page.locator('#enter-ar').isVisible(), false);
      assert.match(await page.locator('#ar-capability').textContent(), /indisponible/);
      await openWorkspace(page, 'more');
      assert.equal(await page.locator('#install-app').evaluate((el) => el.hidden), true);
      await page.evaluate(() => {
        window.__installCount = 0;
        const event = new Event('beforeinstallprompt', { cancelable: true });
        event.prompt = async () => { window.__installCount += 1; };
        event.userChoice = Promise.resolve({ outcome: 'accepted' });
        dispatchEvent(event);
      });
      await page.locator('#install-app').click();
      assert.equal(await page.evaluate(() => window.__installCount), 1);
      assert.equal(await page.locator('#install-app').isVisible(), false);
    });
    await check('tous les espaces accessibles après un rechargement hors ligne', async () => {
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
      await context.setOffline(true);
      await page.reload();
      await page.waitForSelector('body.is-ready');
      for (const id of Object.keys(CONTROLS)) {
        await openWorkspace(page, id);
        assert.equal(await page.locator(`[data-workspace-panel="${id}"]`).isVisible(), true);
      }
      await openWorkspace(page, 'more');
      assert.match(await page.locator('#connection-summary').textContent(), /Hors ligne/);
      await context.setOffline(false);
    });
    await check('absence d’erreur de script', async () => { assert.deepEqual(errors, []); });
    await check('détruire puis relier le rail libère les anciens écouteurs ; destruction répétée sans effet', async () => {
      const result = await page.evaluate(async () => {
        const app = window.__footballSimulator;
        const { createWorkspaceNavigation } = await import(new URL('src/workspace-navigation.mjs', document.baseURI).href);
        app.navigation.destroy();
        const binding = createWorkspaceNavigation({ root: document.getElementById('overlay'), controller: app.workspaces });
        app.navigation.destroy();
        const same = binding === createWorkspaceNavigation({ root: document.getElementById('overlay'), controller: app.workspaces });
        let changes = 0;
        const off = app.workspaces.on('change', () => { changes += 1; });
        document.getElementById('formations-toggle').click();
        off();
        binding.destroy();
        return { same, changes, state: app.workspaces.state };
      });
      assert.deepEqual(result, { same: true, changes: 1, state: { active: 'formations', open: true } });
    });
  } finally { await context.close(); }

  for (const [width, height] of [[320, 568], [390, 844], [568, 320], [844, 390]]) {
    const mobile = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
    await mobile.addInitScript(instrumentWorkspace);
    await mobile.addInitScript(installAimTools);
    const touchPage = await mobile.newPage();
    touchPage.setDefaultTimeout(8000);
    try {
      await touchPage.goto(`${url}?debug`);
      await touchPage.waitForSelector('body.is-ready');
      for (const id of Object.keys(CONTROLS)) {
        await openWorkspace(touchPage, id);
        assert.equal(await touchPage.locator(`[data-workspace-panel="${id}"]`).isVisible(), true);
        assert.equal(await hiddenPitchPoints(touchPage), 0, `${id} : joueur ou coin masqué`);
        const dimensions = await touchPage.evaluate(() => {
          const rect = document.getElementById('scene-container').getBoundingClientRect();
          const close = document.querySelector('[data-workspace-close]').getBoundingClientRect();
          const panel = document.querySelector('.workspace-panel__content');
          return { area: rect.width * rect.height / (innerWidth * innerHeight), overflow: document.documentElement.scrollWidth > innerWidth, closeSize: Math.min(close.width, close.height), scroll: getComputedStyle(panel).overflowY };
        });
        assert.ok(dimensions.area >= 0.45, `surface du terrain ${dimensions.area}`);
        assert.equal(dimensions.overflow, false);
        assert.ok(dimensions.closeSize >= 44);
        assert.equal(dimensions.scroll, 'auto');
        await touchPage.locator('[data-workspace-close]').first().tap();
        await touchPage.waitForFunction(() => !history.state?.footballWorkspace);
      }
      record(`Espaces tactiles ${width} × ${height} : sept espaces, débordement, fermeture et terrain dégagé`, 'ok');
    } catch (error) { record(`Espaces tactiles ${width} × ${height}`, 'échec', error.message); }
    finally { await mobile.close(); }
  }
}

/**
 * Sur une vraie session IWER, parcourt les espaces et vérifie la protection DOM Overlay.
 * Les clics passent par le navigateur ; aucun résultat de téléphone physique n'est déduit.
 * @param {import('playwright-core').Page} page
 * @param {{capture?: boolean}} [options] capture optionnelle de l'AR émulée
 * @returns {Promise<[boolean, string]>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout — navigation pendant la session AR émulée
 */
export async function verifyArWorkspaces(page, { capture = false } = {}) {
  const before = await page.evaluate(() => {
    const app = window.__footballSimulator;
    return { snapshot: app.board.snapshot(), pose: app.pitchGroup.matrixWorld.toArray(), keyframes: app.sequence.length, selects: window.__selects };
  });
  for (const id of Object.keys(CONTROLS)) {
    await openWorkspace(page, id);
    assert.equal(await page.locator(`[data-workspace-panel="${id}"]`).isVisible(), true);
    const protectedSurfaces = await page.evaluate(() => ['#workspace-nav', '.workspace-panel__header', '.workspace-panel__content'].every((selector) => {
      const event = new Event('beforexrselect', { bubbles: true, cancelable: true });
      document.querySelector(selector).dispatchEvent(event);
      return event.defaultPrevented;
    }));
    assert.equal(protectedSurfaces, true);
  }
  if (capture) {
    await openWorkspace(page, 'formations');
    await page.mouse.move(1250, 80);
    await page.screenshot({ path: fileURLToPath(new URL('../docs/images/sidebar/apres-ar-emulation.png', import.meta.url)) });
  }
  await page.locator('[data-workspace-close]').first().click();
  const after = await page.evaluate(() => {
    const app = window.__footballSimulator;
    return { snapshot: app.board.snapshot(), pose: app.pitchGroup.matrixWorld.toArray(), keyframes: app.sequence.length, selects: window.__selects, presenting: app.renderer.xr.isPresenting, anchored: app.placement.anchored };
  });
  assert.deepEqual(after.snapshot, before.snapshot);
  assert.deepEqual(after.pose, before.pose);
  assert.equal(after.keyframes, before.keyframes);
  assert.equal(after.selects, before.selects);
  assert.equal(after.presenting, true);
  assert.equal(after.anchored, true);
  return [true, 'sept espaces, pose et tactique conservées ; aucun select XR provoqué par la navigation'];
}

// Exécution directe pour le développement ; l'import par run-tests ne relance aucun navigateur.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startServer();
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
  let failed = 0;
  let passed = 0;
  try {
    await runWorkspaceTests(browser, server.url, (name, status, detail = '') => {
      if (status === 'ok') passed += 1;
      else failed += 1;
      console.log(`${status === 'ok' ? '✓' : '✗'} ${name}${detail ? ` : ${detail}` : ''}`);
    });
  } finally { await browser.close(); await server.close(); }
  console.log(`${passed} réussi(s), ${failed} échec(s).`);
  process.exitCode = failed ? 1 : 0;
}
