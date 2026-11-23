/**
 * Tests unitaires de src/tactics-board.mjs : formation en place de chaque équipe, et événement
 * formationchange (patron Observer). Depuis le sprint 5 : places des joueurs et du ballon, limites
 * du plateau, flèches, instantanés et réinitialisation.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARROW_KINDS, BOARD_HALF_EXTENTS, clampToBoard, isOnBoard, PLAYER_MARGIN, TacticsBoard,
} from '../../src/tactics-board.mjs';
import { FORMATIONS } from '../../src/formations.mjs';
import { computeTeamTargets } from '../../src/formation-transition.mjs';

/**
 * Crée un tableau tactique avec les formations du scénario de démonstration, et enregistre ses
 * événements.
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests unitaires (src/tactics-board.mjs) — montage du test
 */
function createBoard() {
  const board = new TacticsBoard({ blue: '4-3-3', red: '4-4-2' });
  const events = [];
  board.on('formationchange', (detail) => events.push(detail));
  return { board, events };
}

test('au départ, chaque équipe a la formation demandée', () => {
  const { board } = createBoard();
  assert.deepEqual(board.teamIds, ['blue', 'red']);
  assert.equal(board.getFormation('blue'), FORMATIONS['4-3-3']);
  assert.equal(board.getFormation('red'), FORMATIONS['4-4-2']);
});

test('changer de formation prévient les observateurs, avec l\'ancienne et la nouvelle', () => {
  const { board, events } = createBoard();

  const previous = board.setFormation('blue', '3-5-2');

  assert.equal(previous, FORMATIONS['4-3-3']);
  assert.equal(board.getFormation('blue'), FORMATIONS['3-5-2']);
  assert.deepEqual(events, [{ teamId: 'blue', formation: FORMATIONS['3-5-2'], previous: FORMATIONS['4-3-3'] }]);
  assert.equal(board.getFormation('red'), FORMATIONS['4-4-2'], 'l\'autre équipe ne change pas');
});

test('choisir la formation déjà en place ne déclenche rien', () => {
  const { board, events } = createBoard();
  board.setFormation('red', '4-4-2');
  assert.deepEqual(events, []);
});

test('formation ou équipe inconnue : erreur, et rien ne change', () => {
  const { board, events } = createBoard();
  assert.throws(() => board.setFormation('blue', '2-3-5'), /Formation inconnue/);
  assert.throws(() => board.setFormation('green', '4-4-2'), /Équipe inconnue/);
  assert.equal(board.getFormation('blue'), FORMATIONS['4-3-3']);
  assert.deepEqual(events, []);
});

test('la formation renvoyée permet de revenir en arrière (annulation du sprint 5)', () => {
  const { board } = createBoard();
  const previous = board.setFormation('blue', '4-2-3-1');
  board.setFormation('blue', previous.name);
  assert.equal(board.getFormation('blue'), FORMATIONS['4-3-3']);
});

test('sprint 5 : au départ, chaque joueur est à sa place de formation, le ballon au centre, sans flèche', () => {
  const { board } = createBoard();
  for (const [teamId, attacksPositiveX] of [['blue', true], ['red', false]]) {
    for (const [number, { x, z }] of computeTeamTargets(board.getFormation(teamId), attacksPositiveX)) {
      assert.deepEqual(board.getPlayerPosition(teamId, number), { x, z });
    }
  }
  assert.deepEqual(board.getBallPosition(), { x: 0, z: 0 });
  assert.deepEqual(board.getArrows(), []);
  assert.equal(board.isInInitialState(), true);
});

test('sprint 5 : déplacer un joueur, reconnu par son équipe et son numéro ; place hors du plateau refusée', () => {
  const { board } = createBoard();
  const changes = [];
  board.on('change', (detail) => changes.push(detail));
  const redNine = board.getPlayerPosition('red', 9);

  assert.equal(board.setPlayerPosition('blue', 9, { x: 0.05, z: -0.1 }), true);
  assert.deepEqual(board.getPlayerPosition('blue', 9), { x: 0.05, z: -0.1 });
  assert.deepEqual(board.getPlayerPosition('red', 9), redNine, 'le n° 9 de l\'autre équipe ne bouge pas');
  assert.deepEqual(changes, [{ type: 'player', teamId: 'blue', number: 9 }]);

  assert.equal(board.setPlayerPosition('blue', 9, { x: 0.05, z: -0.1 }), false, 'même place : rien ne change');
  assert.throws(() => board.setPlayerPosition('blue', 9, { x: BOARD_HALF_EXTENTS.x, z: 0 }), RangeError);
  assert.throws(() => board.setBallPosition({ x: 0, z: 1 }), RangeError);
  assert.throws(() => board.getPlayerPosition('blue', 12), /Joueur inconnu/);
  assert.deepEqual(board.getPlayerPosition('blue', 9), { x: 0.05, z: -0.1 }, 'un refus ne modifie rien');
  assert.equal(changes.length, 1);
});

test('sprint 5 : limites du plateau, socle du pion compris', () => {
  assert.equal(isOnBoard({ x: 0, z: 0 }), true);
  assert.equal(isOnBoard({ x: BOARD_HALF_EXTENTS.x + 0.001, z: 0 }), false);
  assert.equal(isOnBoard({ x: BOARD_HALF_EXTENTS.x - 0.001, z: 0 }, PLAYER_MARGIN), false);
  assert.equal(isOnBoard({ x: Number.NaN, z: 0 }), false);
  const clamped = clampToBoard({ x: 1, z: -1 }, PLAYER_MARGIN);
  assert.deepEqual(clamped, { x: BOARD_HALF_EXTENTS.x - PLAYER_MARGIN, z: -(BOARD_HALF_EXTENTS.z - PLAYER_MARGIN) });
  assert.equal(isOnBoard(clamped, PLAYER_MARGIN), true);
});

test('sprint 5 : un changement de formation replace aussi les joueurs déplacés à la main, et seulement leur équipe', () => {
  const { board } = createBoard();
  board.setPlayerPosition('blue', 4, { x: -0.01, z: 0.02 });
  board.setPlayerPosition('red', 4, { x: 0.02, z: 0.02 });
  board.setFormation('blue', '4-4-2');
  const target = computeTeamTargets(FORMATIONS['4-4-2'], true).get(4);
  assert.deepEqual(board.getPlayerPosition('blue', 4), { x: target.x, z: target.z });
  assert.deepEqual(board.getPlayerPosition('red', 4), { x: 0.02, z: 0.02 });
});

test('sprint 5 : flèches, avec des identifiants qui ne reculent jamais ; flèche invalide refusée', () => {
  const { board } = createBoard();
  const pass = board.addArrow({ kind: ARROW_KINDS.PASS, from: { x: -0.1, z: 0 }, to: { x: 0.1, z: 0.05 } });
  const run = board.addArrow({ kind: ARROW_KINDS.RUN, from: { x: 0, z: 0 }, to: { x: 0, z: 0.1 } });
  assert.deepEqual([pass.id, run.id], [1, 2]);
  assert.deepEqual(board.getArrows().map(({ kind }) => kind), ['pass', 'run']);
  assert.throws(() => board.addArrow({ kind: 'dribble', from: { x: 0, z: 0 }, to: { x: 0.1, z: 0 } }), /Type de flèche/);
  assert.throws(() => board.addArrow({ kind: 'pass', from: { x: 0, z: 0 }, to: { x: 0.01, z: 0 } }), /trop courte/);
  assert.throws(() => board.addArrow({ kind: 'pass', from: { x: 0, z: 0 }, to: { x: 0.5, z: 0 } }), /hors du plateau/);
  assert.throws(() => board.addArrow({ kind: 'pass', from: { x: 0, z: 0 }, to: { x: 0.1, z: 0 }, id: 1 }), /déjà présente/);
  assert.equal(board.removeArrow(1), true);
  assert.equal(board.removeArrow(1), false);
  assert.equal(board.addArrow({ kind: 'pass', from: { x: 0, z: 0 }, to: { x: 0.1, z: 0 } }).id, 3);
});

test('sprint 5 : instantanés exacts, et réinitialisation vers l\'état de départ', () => {
  const { board, events } = createBoard();
  const initial = board.snapshot();
  board.setFormation('red', '3-5-2');
  board.setPlayerPosition('blue', 10, { x: 0.15, z: 0.1 });
  board.setBallPosition({ x: 0.1, z: -0.05 });
  board.addArrow({ kind: 'run', from: { x: 0, z: 0 }, to: { x: 0.1, z: 0.1 } });
  const changed = board.snapshot();
  const team = board.captureTeam('blue');

  board.setFormation('blue', '3-5-2');
  board.restoreTeam(team);
  assert.deepEqual(board.snapshot(), changed, 'l\'équipe rétablie est exacte, manuel compris');

  assert.equal(board.reset(), true);
  assert.deepEqual(board.snapshot(), initial);
  assert.equal(board.isInInitialState(), true);
  assert.equal(board.reset(), false, 'déjà dans l\'état de départ');
  assert.equal(events.at(-1).formation, FORMATIONS['4-4-2'], 'les observateurs voient la formation rétablie');

  board.restore(changed);
  assert.deepEqual(board.snapshot(), changed);
});
