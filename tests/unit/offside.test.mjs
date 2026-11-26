/**
 * Tests unitaires de la ligne de hors-jeu (src/offside.mjs, loi 11) et de son affichage en 3D
 * (src/offside-layer.mjs) : avant-dernier défenseur, ballon, ligne médiane, joueur à hauteur,
 * joueur dans sa propre moitié, et sens d'attaque des deux équipes.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { computeOffside, describeOffside, LEVEL_TOLERANCE, OFFSIDE_LIMITS } from '../../src/offside.mjs';
import { OffsideLayer } from '../../src/offside-layer.mjs';
import { TacticsBoard } from '../../src/tactics-board.mjs';
import { PITCH_SCALE } from '../../src/config.mjs';

/**
 * Tableau de départ : Bleus en 4-3-3 (attaquent vers +X), Rouges en 4-4-2.
 * @returns {TacticsBoard}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests unitaires (hors-jeu) — montage du test
 */
function createBoard() {
  return new TacticsBoard({ blue: '4-3-3', red: '4-4-2' });
}

test('au coup d\'envoi : ligne sur l\'avant-dernier défenseur rouge, aucun Bleu hors-jeu', () => {
  const board = createBoard();
  const result = computeOffside(board, 'blue');
  assert.equal(result.limit, OFFSIDE_LIMITS.DEFENDER);
  assert.equal(result.defendingTeamId, 'red');
  // Le gardien rouge est le dernier ; l'avant-dernier est un défenseur de la ligne de quatre.
  assert.notEqual(result.secondLast.number, 1);
  assert.equal(result.secondLast.post.startsWith('D'), true);
  assert.deepEqual(result.offside, []);
  // Ligne de quatre rouge à 17,85 m de son but (x = 0,17 de la longueur), à 0,1 m près.
  assert.ok(Math.abs(result.distanceToGoal - 0.17 * 105) < 0.1, `${result.distanceToGoal} m`);
});

test('un attaquant au-delà de l\'avant-dernier défenseur est hors-jeu ; à hauteur, il ne l\'est pas', () => {
  const board = createBoard();
  const { x } = computeOffside(board, 'blue');
  board.setPlayerPosition('blue', 9, { x: x + 0.01, z: 0 });
  assert.deepEqual(computeOffside(board, 'blue').offside, [{ number: 9, post: 'AT' }]);
  board.setPlayerPosition('blue', 9, { x: x + LEVEL_TOLERANCE / 2, z: 0 });
  assert.deepEqual(computeOffside(board, 'blue').offside, [], 'à hauteur : pas hors-jeu');
});

test('le gardien compte comme un défenseur : gardien sorti, l\'avant-dernier peut être le dernier défenseur de champ', () => {
  const board = createBoard();
  // Gardien rouge monté au milieu de terrain : l'avant-dernier est désormais un joueur plus bas.
  board.setPlayerPosition('red', 1, { x: 0.02, z: 0.1 });
  const result = computeOffside(board, 'blue');
  assert.notEqual(result.secondLast.number, 1);
  const depths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => board.getPlayerPosition('red', n).x).sort((a, b) => b - a);
  assert.ok(Math.abs(result.x - depths[1]) < 1e-12, 'deuxième Rouge le plus proche de son but');
});

test('le ballon plus avancé que l\'avant-dernier défenseur fixe la ligne', () => {
  const board = createBoard();
  board.setBallPosition({ x: 0.25, z: 0 });
  const result = computeOffside(board, 'blue');
  assert.equal(result.limit, OFFSIDE_LIMITS.BALL);
  assert.equal(result.x, 0.25);
});

test('dans sa propre moitié, un joueur n\'est jamais hors-jeu : la ligne médiane est la limite', () => {
  const board = createBoard();
  // Les Bleus (défenseurs face aux Rouges) montent tous dans la moitié rouge, sauf le gardien.
  for (const number of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    const { z } = board.getPlayerPosition('blue', number);
    board.setPlayerPosition('blue', number, { x: 0.05, z });
  }
  board.setBallPosition({ x: 0.1, z: 0 });
  // Un attaquant rouge resté dans sa moitié (x > 0 pour les Rouges, qui attaquent vers −X).
  board.setPlayerPosition('red', 9, { x: 0.01, z: 0.05 });
  const result = computeOffside(board, 'red');
  assert.equal(result.limit, OFFSIDE_LIMITS.HALFWAY);
  assert.equal(result.x, 0);
  assert.ok(!result.offside.some(({ number }) => number === 9), 'dans sa moitié : pas hors-jeu');
  // Le même attaquant passé dans la moitié bleue, derrière la défense montée : hors-jeu.
  board.setPlayerPosition('red', 9, { x: -0.02, z: 0.05 });
  assert.ok(computeOffside(board, 'red').offside.some(({ number }) => number === 9));
});

test('Rouges en attaque : la ligne se calcule vers −X, sur les défenseurs bleus', () => {
  const board = createBoard();
  const result = computeOffside(board, 'red');
  assert.equal(result.defendingTeamId, 'blue');
  assert.ok(result.x < 0, 'dans la moitié bleue');
  board.setPlayerPosition('red', 9, { x: result.x - 0.01, z: 0 });
  assert.deepEqual(computeOffside(board, 'red').offside.map(({ number }) => number), [9]);
});

test('phrase pour l\'entraîneur : distance au but, limite et joueurs hors-jeu', () => {
  const board = createBoard();
  assert.match(describeOffside(computeOffside(board, 'blue')),
    /^Bleus en attaque : ligne à 18 m du but des Rouges \(avant-dernier défenseur : n° \d+ \(D[CDG]\)\) ; aucun joueur hors-jeu\.$/);
  board.setBallPosition({ x: 0.25, z: 0 });
  board.setPlayerPosition('blue', 9, { x: 0.27, z: 0 });
  assert.match(describeOffside(computeOffside(board, 'blue')), /fixée par le ballon\) ; hors-jeu : n° 9 \(AT\)\./);
});

test('couche 3D : une ligne par équipe, à la place calculée, masquée par défaut, qui suit le tableau', () => {
  const board = createBoard();
  const pitchGroup = new THREE.Group();
  const layer = new OffsideLayer({ pitchGroup, board });
  assert.equal(layer.visible, false);
  assert.equal(pitchGroup.getObjectByName('offside-lines').children.length, 2);
  assert.equal(layer.lineFor('blue').position.x, computeOffside(board, 'blue').x);
  board.setBallPosition({ x: 0.25, z: 0 });
  assert.equal(layer.lineFor('blue').position.x, 0.25, 'la ligne suit le ballon');
  layer.visible = true;
  assert.equal(pitchGroup.getObjectByName('offside-lines').visible, true);
  layer.dispose();
  assert.equal(pitchGroup.getObjectByName('offside-lines'), undefined);
  board.setBallPosition({ x: 0.1, z: 0 });
  assert.equal(layer.lineFor('blue').position.x, 0.25, 'après dispose, plus d\'abonnement');
  // Échelle : la ligne mesure 2 mm de maquette, soit environ 35 cm réels.
  assert.ok(Math.abs(0.002 / PITCH_SCALE - 0.35) < 0.01);
});
