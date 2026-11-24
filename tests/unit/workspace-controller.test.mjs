/**
 * Contrat de navigation : aucun état tactique n'appartient aux espaces de l'interface.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORKSPACES, WorkspaceController } from '../../src/workspace-controller.mjs';
import { TacticsBoard } from '../../src/tactics-board.mjs';
import { AddArrowCommand, CommandHistory, MovePlayerCommand } from '../../src/commands.mjs';
import { DEFAULT_FORMATIONS } from '../../src/config.mjs';

test('sept espaces : ouvrir et fermer ne modifie ni les joueurs, ni les flèches, ni la commande annulable', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const history = new CommandHistory();
  history.execute(new MovePlayerCommand({ board, teamId: 'blue', number: 9, to: { x: -0.1, z: 0.08 } }));
  history.execute(new AddArrowCommand({ board, arrow: { kind: 'pass', from: { x: 0, z: 0 }, to: { x: 0.1, z: 0.1 } } }));
  const state = board.snapshot();
  const undoLabel = history.undoLabel;
  const controller = new WorkspaceController();
  assert.equal(Object.keys(WORKSPACES).length, 7);
  for (let repeat = 0; repeat < 20; repeat += 1) {
    for (const id of Object.keys(WORKSPACES)) {
      controller.open(id);
      assert.deepEqual(board.snapshot(), state);
      assert.equal(history.undoLabel, undoLabel);
    }
    controller.close();
  }
  history.undo();
  assert.equal(board.getArrows().length, 0);
  history.redo();
  assert.deepEqual(board.snapshot(), state);
});

test('avant la pose AR, les espaces tactiques sont bloqués et un panneau ouvert est replié', () => {
  const controller = new WorkspaceController();
  controller.open('formations');
  controller.setUnavailable(['formations', 'tactics', 'animation']);
  assert.deepEqual(controller.state, { active: 'home', open: false });
  for (const id of ['formations', 'tactics', 'animation']) assert.equal(controller.open(id), false);
  assert.equal(controller.open('ar'), true);
  assert.equal(controller.open('more'), true);
  controller.setUnavailable([]);
  assert.equal(controller.open('tactics'), true);
});

test('une navigation identique ne notifie pas deux fois ; un espace inconnu ne corrompt pas l’état', () => {
  const controller = new WorkspaceController();
  let changes = 0;
  const off = controller.on('change', () => { changes += 1; });
  controller.open('animation');
  controller.open('animation');
  assert.equal(changes, 1);
  assert.throws(() => controller.open('inconnu'), RangeError);
  assert.deepEqual(controller.state, { active: 'animation', open: true });
  assert.equal(controller.close(), true);
  assert.equal(controller.close(), false);
  off();
  controller.open('settings');
  assert.equal(changes, 2);
});
