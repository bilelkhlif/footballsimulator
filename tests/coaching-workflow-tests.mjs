/**
 * Parcours complet d'un entraîneur : commandes réelles dans la page, puis même tactique en AR.
 * IWER émule la session sur PC ; aucun essai de téléphone physique n'est déduit de ce test.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import assert from 'node:assert/strict';
import { clickUi, installAimTools, openWorkspace } from './workspace-test-helpers.mjs';

/**
 * Attend la fin des déplacements réels avant de viser le prochain pion.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<void>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout — stabilité de la visée tactique
 */
async function settleMovement(page) {
  await page.waitForFunction(() => !window.__footballSimulator.animator.isAnimating, null, { timeout: 5000 });
}

/**
 * Déplace un joueur visible par deux vrais clics, sans exécuter directement de commande métier.
 * @param {import('playwright-core').Page} page
 * @param {string} teamId équipe à viser
 * @param {number[]} exclude numéros déjà utilisés
 * @param {number[][]} candidates destinations possibles sur le gazon
 * @returns {Promise<{number: number, position: {x: number, z: number}}>} joueur et place obtenue
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout — déplacement d'un joueur dans le parcours
 */
async function movePlayerByClicks(page, teamId, exclude, candidates) {
  await clickUi(page, '[data-mode="move"]');
  await settleMovement(page);
  const player = await page.evaluate(([team, ignored]) => window.__aim.player(team, ignored), [teamId, exclude]);
  assert.ok(player, `Joueur ${teamId} visible et non masqué`);
  await page.mouse.click(player.x, player.y);
  const destination = await page.evaluate((points) => window.__aim.spot(points), candidates);
  assert.ok(destination, 'Destination de déplacement visible et libre');
  await page.mouse.click(destination.sx, destination.sy);
  await settleMovement(page);
  const position = await page.evaluate(([team, number]) => window.__footballSimulator.board.getPlayerPosition(team, number), [teamId, player.number]);
  assert.ok(Math.hypot(position.x - destination.x, position.z - destination.z) < 0.001, 'Le joueur rejoint la destination cliquée à moins de 1 mm');
  assert.equal(await page.evaluate(() => window.__footballSimulator.interaction.selection), null);
  return { number: player.number, position };
}

/**
 * Lit le tableau et les propriétés de l'historique sans changer la scène ni la tactique.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<object>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout — comparaison du même état entre les espaces
 */
async function readCoachingState(page) {
  return page.evaluate(() => {
    const app = window.__footballSimulator;
    return {
      board: app.board.snapshot(),
      keyframes: app.sequence.length,
      undoLabel: app.history.undoLabel,
      canUndo: app.history.canUndo,
      canRedo: app.history.canRedo,
    };
  });
}

/**
 * Rejoue le parcours demandé : deux formations, joueur, ballon, passe, course, animation,
 * retour Accueil, annulation / rétablissement, puis transition et retour AR sur le même état.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url origine du serveur de test
 * @param {(name: string, status: string, detail?: string) => void} record bilan partagé
 * @returns {Promise<void>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout — parcours complet de coaching et continuité AR
 */
export async function runCoachingWorkflowTests(browser, url, record) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(installAimTools);
  // L'aide de première visite est couverte séparément ; ce parcours commence dans Accueil.
  await context.addInitScript(() => localStorage.setItem('football-simulator:aide-vue', '1'));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let workflowPassed = false;
  let expected;
  try {
    await page.goto(`${url}?iwer&debug`);
    await page.waitForSelector('body.is-ready', { timeout: 60000 });
    await page.waitForFunction(() => document.getElementById('xr-status').dataset.state !== 'checking');
    await page.evaluate(() => {
      const app = window.__footballSimulator;
      window.__coachingObjects = [app.scene, app.renderer, app.board, app.history, app.sequence];
      window.__coachingCommands = [];
      app.history.on('change', ({ action, label }) => window.__coachingCommands.push({ action, label }));
    });
    try {
      await openWorkspace(page, 'home');
      await clickUi(page, '.formation-button[data-team="blue"][data-formation="4-4-2"]');
      await clickUi(page, '.formation-button[data-team="red"][data-formation="3-5-2"]');
      await settleMovement(page);
      const firstPlayer = await movePlayerByClicks(page, 'blue', [], [[-0.12, 0.18], [-0.18, 0.17], [-0.08, -0.16]]);
      assert.ok(firstPlayer.number >= 1);

      const ball = await page.evaluate(() => window.__aim.ball());
      assert.ok(ball, 'Ballon visible pour son déplacement');
      await page.mouse.click(ball.x, ball.y);
      const ballDestination = await page.evaluate(() => window.__aim.spot([[-0.03, 0.12], [0.04, 0.05], [0.1, 0.1], [0, -0.12]]));
      assert.ok(ballDestination, 'Place libre du ballon');
      await page.mouse.click(ballDestination.sx, ballDestination.sy);
      await settleMovement(page);
      const movedBall = await page.evaluate(() => window.__footballSimulator.board.getBallPosition());
      assert.ok(Math.hypot(movedBall.x - ballDestination.x, movedBall.z - ballDestination.z) < 0.001);

      await clickUi(page, '[data-mode="pass"]');
      const passStart = await page.evaluate(() => window.__aim.ball());
      assert.ok(passStart, 'Ballon déplacé sélectionnable comme départ de passe');
      await page.mouse.click(passStart.x, passStart.y);
      const passEnd = await page.evaluate(() => window.__aim.spot([[0.12, -0.08], [0.15, 0.1], [0.08, 0.15], [0.2, 0]]));
      assert.ok(passEnd, 'Arrivée libre de la passe');
      await page.mouse.move(passEnd.sx, passEnd.sy);
      await page.waitForFunction(() => window.__footballSimulator.interaction.hoverVerdict?.valid === true);
      await page.mouse.click(passEnd.sx, passEnd.sy);
      await page.waitForFunction(() => window.__footballSimulator.board.getArrows().length === 1);

      await clickUi(page, '[data-mode="run"]');
      const runner = await page.evaluate(() => window.__aim.player('red'));
      assert.ok(runner, 'Joueur rouge visible comme départ de course');
      await page.mouse.click(runner.x, runner.y);
      const runEnd = await page.evaluate(() => window.__aim.spot([[0.18, 0.15], [0.2, -0.16], [0.09, 0.16]]));
      assert.ok(runEnd, 'Arrivée libre de la course');
      await page.mouse.move(runEnd.sx, runEnd.sy);
      await page.waitForFunction(() => window.__footballSimulator.interaction.hoverVerdict?.valid === true);
      await page.mouse.click(runEnd.sx, runEnd.sy);
      await page.waitForFunction(() => window.__footballSimulator.board.getArrows().length === 2);

      const firstFrame = await readCoachingState(page);
      assert.deepEqual(firstFrame.board.formations, { blue: '4-4-2', red: '3-5-2' });
      assert.deepEqual(firstFrame.board.arrows.map(({ kind }) => kind), ['pass', 'run']);
      await clickUi(page, '[data-sequence="keyframe"]');
      await movePlayerByClicks(page, 'red', [runner.number], [[0.04, -0.16], [-0.03, -0.17], [0.05, 0.17]]);
      await clickUi(page, '[data-sequence="keyframe"]');
      expected = await readCoachingState(page);
      assert.equal(expected.keyframes, 2);

      await clickUi(page, '[data-sequence="play"]');
      await page.waitForFunction(() => window.__footballSimulator.sequencePlayer.cursor > 0.05);
      await clickUi(page, '[data-sequence="play"]');
      const paused = await page.evaluate(() => ({ state: window.__footballSimulator.sequencePlayer.state, cursor: window.__footballSimulator.sequencePlayer.cursor }));
      assert.equal(paused.state, 'paused');
      assert.ok(paused.cursor > 0 && paused.cursor < 1, 'Pause réelle entre les deux images clés');
      await openWorkspace(page, 'home');
      assert.deepEqual(await readCoachingState(page), expected);

      await page.keyboard.press('Control+z');
      assert.equal((await readCoachingState(page)).keyframes, 1);
      await page.keyboard.press('Control+z');
      const undoneMove = await readCoachingState(page);
      assert.deepEqual(undoneMove.board, firstFrame.board);
      await page.keyboard.press('Control+y');
      await page.keyboard.press('Control+y');
      await settleMovement(page);
      assert.deepEqual(await readCoachingState(page), expected);
      const commands = await page.evaluate(() => window.__coachingCommands.map(({ action }) => action));
      assert.deepEqual(commands, [...Array(9).fill('execute'), 'undo', 'undo', 'redo', 'redo']);
      const sameObjects = await page.evaluate(() => {
        const app = window.__footballSimulator;
        return [app.scene, app.renderer, app.board, app.history, app.sequence].every((object, index) => object === window.__coachingObjects[index]);
      });
      assert.equal(sameObjects, true);
      assert.deepEqual(errors, []);
      workflowPassed = true;
      record('Coaching complet : formations, joueur, ballon, passe, course, deux images clés, lecture / pause, Accueil et historique uniques', 'ok', '9 commandes exécutées une seule fois, deux annulations et deux rétablissements ; état intégral conservé');
    } catch (error) {
      record('Coaching complet : parcours des commandes réelles', 'échec', error.message);
    }

    if (!workflowPassed) {
      record('Coaching complet : continuité de la même tactique en AR émulée', 'ignoré', 'parcours 3D préalable en échec');
      return;
    }
    if (await page.locator('#xr-status').getAttribute('data-state') !== 'emulated') {
      record('Coaching complet : continuité de la même tactique en AR émulée', 'ignoré', 'IWER indisponible ; téléchargement CDN nécessaire');
      return;
    }
    try {
      await page.evaluate(() => {
        const halfPitch = -(35 * Math.PI) / 360;
        window.__footballSimulator.xrDevice.quaternion.set(Math.sin(halfPitch), 0, 0, Math.cos(halfPitch));
      });
      await clickUi(page, '#enter-ar');
      await page.waitForFunction(() => window.__footballSimulator.placement?.state === 'surface');
      await page.mouse.click(640, 380);
      await page.waitForFunction(() => window.__footballSimulator.placement?.anchored === true);
      await page.evaluate(() => {
        const app = window.__footballSimulator;
        window.__coachingXrSelects = 0;
        app.renderer.xr.getSession().addEventListener('select', () => { window.__coachingXrSelects += 1; });
        app.pitchGroup.updateMatrixWorld(true);
        window.__coachingAnchoredPose = app.pitchGroup.matrixWorld.toArray();
      });
      await openWorkspace(page, 'formations');
      await openWorkspace(page, 'tactics');
      assert.deepEqual(await readCoachingState(page), expected);
      const overlay = await page.evaluate(() => {
        const app = window.__footballSimulator;
        app.pitchGroup.updateMatrixWorld(true);
        return { selects: window.__coachingXrSelects, anchored: app.placement.anchored, pose: app.pitchGroup.matrixWorld.toArray(), expectedPose: window.__coachingAnchoredPose };
      });
      assert.equal(overlay.selects, 0);
      assert.equal(overlay.anchored, true);
      // Les poses WebXR passent par Float32 : tolérance de 1 µm, bien sous le centimètre du cahier.
      const poseError = Math.max(...overlay.pose.map((value, index) => Math.abs(value - overlay.expectedPose[index])));
      assert.ok(Number.isFinite(poseError) && poseError <= 1e-6, `pose modifiée : écart maximal ${poseError}`);
      await clickUi(page, '#exit-ar');
      await page.waitForFunction(() => document.body.dataset.xr === 'inactive' && !window.__footballSimulator.renderer.xr.isPresenting);
      assert.deepEqual(await readCoachingState(page), expected);
      const restored = await page.evaluate(() => {
        const app = window.__footballSimulator;
        return {
          sameObjects: [app.scene, app.renderer, app.board, app.history, app.sequence].every((object, index) => object === window.__coachingObjects[index]),
          table: app.table.visible,
          controls: app.controls.enabled,
          placement: app.placement,
        };
      });
      assert.deepEqual(restored, { sameObjects: true, table: true, controls: true, placement: null });
      assert.deepEqual(errors, []);
      record('Coaching complet : continuité de la même tactique en AR émulée', 'ok', 'pose ancrée, deux espaces sans select XR parasite, sortie vers la même scène et le même historique');
    } catch (error) {
      record('Coaching complet : continuité de la même tactique en AR émulée', 'échec', error.message);
    }
  } catch (error) {
    record('Coaching complet : chargement de la page', 'échec', error.message);
    record('Coaching complet : continuité de la même tactique en AR émulée', 'ignoré', 'page indisponible');
  } finally {
    await context.close();
  }
}
