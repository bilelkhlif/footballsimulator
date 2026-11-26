/**
 * Tests unitaires de la bascule attaque / défense : TacticsBoard.setPhase, ChangePhaseCommand et
 * les instantanés. Une équipe passe de la base à sa disposition en possession (le 4-3-3 devient un
 * 2-3-5) ou hors possession (4-5-1), de façon annulable, sans toucher à l'autre équipe.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TacticsBoard } from '../../src/tactics-board.mjs';
import { ChangeFormationCommand, ChangePhaseCommand, CommandHistory, MovePlayerCommand } from '../../src/commands.mjs';
import { computeTeamTargets } from '../../src/formation-transition.mjs';
import { FORMATIONS, PHASES } from '../../src/formations.mjs';
import { DEFAULT_FORMATIONS, TEAMS } from '../../src/config.mjs';

/**
 * Vrai si chaque joueur de l'équipe est à la place de la formation dans cette phase.
 * @param {TacticsBoard} board
 * @param {string} teamId
 * @param {string} formation
 * @param {string} phase
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests unitaires (bascule attaque / défense) — vérification
 */
function isInShape(board, teamId, formation, phase) {
  const targets = computeTeamTargets(FORMATIONS[formation], TEAMS[teamId].attacksPositiveX, phase);
  return [...targets].every(([number, { x, z }]) => {
    const position = board.getPlayerPosition(teamId, number);
    return Math.abs(position.x - x) < 1e-9 && Math.abs(position.z - z) < 1e-9;
  });
}

test('au départ, chaque équipe est dans sa disposition de base', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  assert.equal(board.getPhase('blue'), PHASES.BASE);
  assert.equal(board.getPhase('red'), PHASES.BASE);
  assert.deepEqual(board.snapshot().phases, { blue: 'base', red: 'base' });
});

test('bascule en possession : les Bleus passent en 2-3-5, les Rouges ne bougent pas', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const redBefore = board.snapshot().players;
  const events = [];
  board.on('phasechange', (detail) => events.push(detail));
  assert.equal(board.setPhase('blue', PHASES.POSSESSION), PHASES.BASE);
  assert.ok(isInShape(board, 'blue', '4-3-3', PHASES.POSSESSION));
  for (const number of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    assert.deepEqual(board.getPlayerPosition('red', number), redBefore[`red:${number}`]);
  }
  assert.deepEqual(events, [{ teamId: 'blue', phase: 'possession', previous: 'base' }]);
  // En possession, l'avant-centre bleu joue dans la moitié adverse (x > 0 pour les Bleus).
  assert.ok(board.getPlayerPosition('blue', 9).x > 0);
  assert.equal(board.setPhase('blue', PHASES.POSSESSION), PHASES.POSSESSION, 'déjà en possession : sans effet');
  assert.equal(events.length, 1);
  assert.throws(() => board.setPhase('blue', 'pressing'), /Phase de jeu inconnue/);
});

test('ChangePhaseCommand : annulable, et l\'annulation rend aussi les joueurs déplacés à la main', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const history = new CommandHistory();
  history.execute(new MovePlayerCommand({ board, teamId: 'blue', number: 9, to: { x: 0.05, z: 0.08 } }));
  const before = board.snapshot();
  const command = new ChangePhaseCommand({ board, teamId: 'blue', phase: PHASES.DEFENSE });
  assert.equal(command.label, 'Hors possession (4-5-1) pour les Bleus');
  assert.equal(history.execute(command), true);
  assert.ok(isInShape(board, 'blue', '4-3-3', PHASES.DEFENSE));
  history.undo();
  assert.deepEqual(board.snapshot(), before);
  history.redo();
  assert.equal(board.getPhase('blue'), PHASES.DEFENSE);
  assert.equal(history.execute(new ChangePhaseCommand({ board, teamId: 'blue', phase: PHASES.DEFENSE })), false,
    'une bascule sans effet n\'entre pas dans l\'historique');
});

test('un changement de formation garde la phase : le 3-4-3 en possession prend sa disposition 3-2-5', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const history = new CommandHistory();
  history.execute(new ChangePhaseCommand({ board, teamId: 'blue', phase: PHASES.POSSESSION }));
  history.execute(new ChangeFormationCommand({ board, teamId: 'blue', formation: '3-4-3' }));
  assert.equal(board.getPhase('blue'), PHASES.POSSESSION);
  assert.ok(isInShape(board, 'blue', '3-4-3', PHASES.POSSESSION));
  history.undo();
  assert.ok(isInShape(board, 'blue', '4-3-3', PHASES.POSSESSION), 'l\'annulation rend le 4-3-3 en possession');
});

test('instantanés : la phase est rétablie ; un instantané sans phases revient à la base ; réinitialiser rend la base', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  board.setPhase('red', PHASES.DEFENSE);
  const snapshot = board.snapshot();
  const other = new TacticsBoard(DEFAULT_FORMATIONS);
  other.restore(snapshot);
  assert.equal(other.getPhase('red'), PHASES.DEFENSE);
  assert.deepEqual(other.snapshot(), snapshot);

  const legacy = structuredClone(snapshot);
  delete legacy.phases;
  other.restore(legacy);
  assert.equal(other.getPhase('red'), PHASES.BASE, 'tactique enregistrée avant les phases');

  assert.equal(board.reset(), true);
  assert.equal(board.getPhase('red'), PHASES.BASE);
});
