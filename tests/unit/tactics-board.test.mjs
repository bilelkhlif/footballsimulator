/**
 * Tests unitaires de src/tactics-board.js : formation en place de chaque équipe, et événement
 * formationchange (patron Observer).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TacticsBoard } from '../../src/tactics-board.js';
import { FORMATIONS } from '../../src/formations.js';

/**
 * Crée un tableau tactique avec les formations du scénario de démonstration, et enregistre ses
 * événements.
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
