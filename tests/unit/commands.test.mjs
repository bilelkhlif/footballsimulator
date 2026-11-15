/**
 * Tests unitaires de src/commands.js (sprint 5, patron Command) : chaque commande s'exécute, s'annule
 * et se rétablit exactement ; l'historique garde, oublie et notifie comme prévu.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TacticsBoard } from '../../src/tactics-board.js';
import {
  AddArrowCommand, ChangeFormationCommand, Command, CommandHistory, MoveBallCommand, MovePlayerCommand, ResetBoardCommand,
} from '../../src/commands.js';
import { DEFAULT_FORMATIONS } from '../../src/config.js';

/**
 * Tableau du scénario de démonstration et historique vide.
 * @returns {{board: TacticsBoard, history: CommandHistory}}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (src/commands.js) — montage du test
 */
function createSetup() {
  return { board: new TacticsBoard(DEFAULT_FORMATIONS), history: new CommandHistory() };
}

test('MovePlayerCommand : le joueur va à sa place, Annuler le ramène exactement, Rétablir le renvoie', () => {
  const { board, history } = createSetup();
  const before = board.getPlayerPosition('blue', 9);
  const command = new MovePlayerCommand({ board, teamId: 'blue', number: 9, to: { x: 0.12, z: -0.03 } });
  assert.equal(history.execute(command), true);
  assert.deepEqual(board.getPlayerPosition('blue', 9), { x: 0.12, z: -0.03 });
  assert.equal(command.label, 'Déplacer le n° 9 des Bleus');
  history.undo();
  assert.deepEqual(board.getPlayerPosition('blue', 9), before);
  history.redo();
  assert.deepEqual(board.getPlayerPosition('blue', 9), { x: 0.12, z: -0.03 });
});

test('MoveBallCommand : le ballon se déplace et revient exactement', () => {
  const { board, history } = createSetup();
  history.execute(new MoveBallCommand({ board, to: { x: -0.08, z: 0.04 } }));
  assert.deepEqual(board.getBallPosition(), { x: -0.08, z: 0.04 });
  history.undo();
  assert.deepEqual(board.getBallPosition(), { x: 0, z: 0 });
});

test('AddArrowCommand : la flèche annulée puis rétablie garde son identifiant', () => {
  const { board, history } = createSetup();
  const command = new AddArrowCommand({ board, arrow: { kind: 'pass', from: { x: -0.1, z: 0 }, to: { x: 0.05, z: 0.08 } } });
  history.execute(command);
  const [arrow] = board.getArrows();
  assert.equal(arrow.id, command.arrowId);
  history.undo();
  assert.deepEqual(board.getArrows(), []);
  history.redo();
  assert.deepEqual(board.getArrows(), [arrow]);
});

test('ChangeFormationCommand : l\'annulation rétablit la formation et les places exactes, joueurs déplacés compris', () => {
  const { board, history } = createSetup();
  history.execute(new MovePlayerCommand({ board, teamId: 'blue', number: 7, to: { x: 0.2, z: 0.15 } }));
  const before = board.captureTeam('blue');
  history.execute(new ChangeFormationCommand({ board, teamId: 'blue', formation: '3-5-2' }));
  assert.equal(board.getFormation('blue').name, '3-5-2');
  assert.notDeepEqual(board.getPlayerPosition('blue', 7), { x: 0.2, z: 0.15 });
  history.undo();
  assert.deepEqual(board.captureTeam('blue'), before);
  assert.deepEqual(board.getPlayerPosition('blue', 7), { x: 0.2, z: 0.15 });
});

test('changements de formation enchaînés : chaque annulation revient à l\'état exact d\'avant', () => {
  const { board, history } = createSetup();
  const states = [board.snapshot()];
  for (const formation of ['3-5-2', '4-2-3-1', '4-4-2']) {
    history.execute(new ChangeFormationCommand({ board, teamId: 'red', formation }));
    states.push(board.snapshot());
  }
  for (let index = states.length - 2; index >= 0; index -= 1) {
    history.undo();
    assert.deepEqual(board.snapshot(), states[index]);
  }
  assert.equal(history.canUndo, false);
});

test('une action sans effet n\'est pas gardée : même formation, même place, terrain déjà réinitialisé', () => {
  const { board, history } = createSetup();
  assert.equal(history.execute(new ChangeFormationCommand({ board, teamId: 'blue', formation: '4-3-3' })), false);
  const place = board.getPlayerPosition('red', 5);
  assert.equal(history.execute(new MovePlayerCommand({ board, teamId: 'red', number: 5, to: place })), false);
  assert.equal(history.execute(new ResetBoardCommand({ board })), false);
  assert.equal(history.canUndo, false);
});

test('ResetBoardCommand : tout revient au départ, et Annuler rétablit tout', () => {
  const { board, history } = createSetup();
  history.execute(new ChangeFormationCommand({ board, teamId: 'red', formation: '3-5-2' }));
  history.execute(new MovePlayerCommand({ board, teamId: 'blue', number: 10, to: { x: 0.1, z: 0.1 } }));
  history.execute(new MoveBallCommand({ board, to: { x: 0.1, z: 0.12 } }));
  history.execute(new AddArrowCommand({ board, arrow: { kind: 'run', from: { x: 0.1, z: 0.1 }, to: { x: 0.2, z: 0.05 } } }));
  const before = board.snapshot();
  history.execute(new ResetBoardCommand({ board }));
  assert.equal(board.isInInitialState(), true);
  history.undo();
  assert.deepEqual(board.snapshot(), before);
});

test('historique : une nouvelle action efface les actions annulées, et les observateurs sont prévenus', () => {
  const { board, history } = createSetup();
  const changes = [];
  history.on('change', (detail) => changes.push(detail));
  history.execute(new MoveBallCommand({ board, to: { x: 0.05, z: 0 } }));
  history.undo();
  assert.equal(history.canRedo, true);
  assert.equal(history.redoLabel, 'Déplacer le ballon');
  history.execute(new MoveBallCommand({ board, to: { x: -0.05, z: 0 } }));
  assert.equal(history.canRedo, false);
  assert.equal(history.redo(), null);
  assert.deepEqual(changes.map(({ action, canUndo, canRedo }) => [action, canUndo, canRedo]), [
    ['execute', true, false], ['undo', false, true], ['execute', true, false],
  ]);
  history.clear();
  assert.equal(history.canUndo, false);
  assert.equal(history.undo(), null);
});

test('historique limité : les actions les plus anciennes sont oubliées', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const history = new CommandHistory({ limit: 3 });
  for (const x of [0.01, 0.02, 0.03, 0.04, 0.05]) {
    history.execute(new MoveBallCommand({ board, to: { x, z: 0 } }));
  }
  let undone = 0;
  while (history.undo()) {
    undone += 1;
  }
  assert.equal(undone, 3);
  assert.deepEqual(board.getBallPosition(), { x: 0.02, z: 0 });
});

test('une commande refusée par le tableau (place hors du plateau) n\'est pas gardée et ne change rien', () => {
  const { board, history } = createSetup();
  const before = board.snapshot();
  assert.throws(() => history.execute(new MovePlayerCommand({ board, teamId: 'blue', number: 2, to: { x: 0.9, z: 0 } })), RangeError);
  assert.equal(history.canUndo, false);
  assert.deepEqual(board.snapshot(), before);
  assert.throws(() => new Command().execute(), /execute/);
});
