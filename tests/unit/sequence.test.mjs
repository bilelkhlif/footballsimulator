/**
 * Tests unitaires de la séquence animée (sprint 6, bonus BF9) : src/tactical-sequence.mjs, ses
 * commandes annulables, le lecteur src/sequence-player.mjs (temps écoulé, courbe, pause, vitesse,
 * reprise, arrêt sur un changement du tableau) et le texte du panneau.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MAX_KEYFRAMES, TacticalSequence } from '../../src/tactical-sequence.mjs';
import { PLAYBACK_STATES, SequencePlayer, STEP_DURATION_MS } from '../../src/sequence-player.mjs';
import { AddKeyframeCommand, ClearSequenceCommand, CommandHistory, MovePlayerCommand } from '../../src/commands.mjs';
import { TacticsBoard } from '../../src/tactics-board.mjs';
import { describeSequence, formatSpeed } from '../../src/sequence-panel.mjs';
import { DEFAULT_FORMATIONS } from '../../src/config.mjs';
import { createTacticalFixture, playerObject } from './tactical-fixtures.mjs';

/**
 * Tableau, historique, séquence de trois images clés (le n° 9 bleu et le ballon avancent), et
 * lecteur sur des objets de test.
 * @returns {object}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Tests unitaires (src/sequence-player.mjs) — montage du test
 */
function createSetup() {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const history = new CommandHistory();
  const sequence = new TacticalSequence();
  const start = board.getPlayerPosition('blue', 9);
  history.execute(new AddKeyframeCommand({ sequence, board }));
  history.execute(new MovePlayerCommand({ board, teamId: 'blue', number: 9, to: { x: 0.1, z: 0 } }));
  history.execute(new AddKeyframeCommand({ sequence, board }));
  history.execute(new MovePlayerCommand({ board, teamId: 'blue', number: 9, to: { x: 0.2, z: 0.1 } }));
  history.execute(new AddKeyframeCommand({ sequence, board }));
  const nine = { position: { x: 0, y: 0, z: 0 } };
  const ball = { position: { x: 0, y: 0.004, z: 0 } };
  const calls = { returnToBoard: 0, clear: 0 };
  const player = new SequencePlayer({
    sequence,
    board,
    view: { returnToBoard: () => { calls.returnToBoard += 1; } },
    animator: { clear: () => { calls.clear += 1; } },
    targets: [{ object: nine, key: 'blue:9' }, { object: ball, key: 'ball' }],
  });
  return { board, history, sequence, player, nine, ball, start, calls };
}

test('séquence : images clés ajoutées et retirées par des commandes annulables, limite de 12', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const history = new CommandHistory();
  const sequence = new TacticalSequence();
  history.execute(new AddKeyframeCommand({ sequence, board }));
  assert.equal(sequence.length, 1);
  assert.deepEqual(sequence.keyframes[0].ball, { x: 0, z: 0 });
  assert.deepEqual(sequence.keyframes[0].players['red:4'], board.getPlayerPosition('red', 4));
  history.undo();
  assert.equal(sequence.length, 0);
  history.redo();
  assert.equal(sequence.length, 1);

  assert.equal(history.execute(new ClearSequenceCommand({ sequence })), true);
  assert.equal(sequence.length, 0);
  assert.equal(history.execute(new ClearSequenceCommand({ sequence })), false, 'séquence vide : rien à effacer');
  history.undo();
  assert.equal(sequence.length, 1, 'Annuler rétablit les images effacées');

  for (let index = sequence.length; index < MAX_KEYFRAMES; index += 1) {
    sequence.add(sequence.keyframes[0]);
  }
  assert.throws(() => sequence.add(sequence.keyframes[0]), /Séquence pleine/);
});

test('lecture : interpolation par le temps écoulé, avec la courbe des transitions, jusqu\'à la dernière image clé', () => {
  const { player, nine, ball, start, calls } = createSetup();
  assert.equal(player.play(), true);
  assert.equal(calls.clear, 1, 'les déplacements en cours sont interrompus');
  player.update(1000);
  assert.deepEqual([nine.position.x, nine.position.z], [start.x, start.z], 'première image clé');

  player.update(1000 + STEP_DURATION_MS / 4);
  const quarter = start.x * (1 - 0.0625) + 0.1 * 0.0625; // easeInOutCubic(0,25) = 4 × 0,25³
  assert.ok(Math.abs(nine.position.x - quarter) < 1e-12, 'quart d\'étape : départ en douceur, pas linéaire');

  player.update(1000 + STEP_DURATION_MS / 2);
  assert.ok(Math.abs(nine.position.x - (start.x + 0.1) / 2) < 1e-12, 'mi-étape : à mi-chemin (courbe symétrique)');
  assert.equal(player.state, PLAYBACK_STATES.PLAYING);

  player.update(1000 + STEP_DURATION_MS * 2 + 500);
  assert.deepEqual([nine.position.x, nine.position.z], [0.2, 0.1], 'dernière image clé, exacte');
  assert.equal(player.state, PLAYBACK_STATES.PAUSED);
  assert.deepEqual([ball.position.x, ball.position.z], [0, 0]);
  assert.equal(ball.position.y, 0.004, 'la hauteur ne change pas');
});

test('pause, vitesse 2× et reprise depuis le début', () => {
  const { player, nine, start } = createSetup();
  player.setSpeed(2);
  player.play();
  player.update(0);
  player.update(STEP_DURATION_MS / 2); // à 2×, une étape entière
  assert.deepEqual([nine.position.x, nine.position.z], [0.1, 0]);
  player.pause();
  player.update(STEP_DURATION_MS * 4);
  assert.deepEqual([nine.position.x, nine.position.z], [0.1, 0], 'en pause, rien ne bouge');
  player.play();
  player.update(STEP_DURATION_MS * 4); // première image après la reprise : le temps de pause ne compte pas
  assert.deepEqual([nine.position.x, nine.position.z], [0.1, 0], 'pas de saut à la reprise');
  player.update(STEP_DURATION_MS * 4 + 16);
  assert.ok(nine.position.x > 0.1, 'la lecture reprend où elle était');
  player.restart();
  assert.deepEqual([nine.position.x, nine.position.z], [start.x, start.z]);
  assert.throws(() => player.setSpeed(3), /Vitesse inconnue/);
});

test('moins de deux images clés : pas de lecture', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const sequence = new TacticalSequence();
  sequence.add({ players: board.snapshot().players, ball: board.getBallPosition() });
  const player = new SequencePlayer({ sequence, board, view: { returnToBoard() {} }, animator: { clear() {} }, targets: [] });
  assert.equal(player.play(), false);
  assert.equal(player.restart(), false);
  assert.equal(player.state, PLAYBACK_STATES.STOPPED);
});

test('conflits : un changement du tableau ou de la séquence arrête la lecture, et la scène rejoint le tableau', () => {
  const { board, history, sequence, player, calls } = createSetup();
  player.play();
  player.update(0);
  history.execute(new MovePlayerCommand({ board, teamId: 'red', number: 2, to: { x: 0.05, z: -0.1 } }));
  assert.equal(player.state, PLAYBACK_STATES.STOPPED);
  assert.equal(calls.returnToBoard, 1);

  player.play();
  history.undo(); // annuler le déplacement change le tableau
  assert.equal(player.state, PLAYBACK_STATES.STOPPED);
  player.play();
  history.execute(new AddKeyframeCommand({ sequence, board }));
  assert.equal(player.state, PLAYBACK_STATES.STOPPED, 'une nouvelle image clé arrête aussi la lecture');
  assert.equal(calls.returnToBoard, 3);
  assert.equal(history.undoLabel, 'Ajouter une image clé', 'la lecture n\'ajoute rien à l\'historique');
});

test('ancrage : sur un terrain déplacé et tourné, la lecture place les joueurs dans le repère du terrain', () => {
  const fixture = createTacticalFixture({ position: { x: -0.35, y: 0.728, z: -0.82 }, rotation: new THREE.Euler(0, 0.44, 0) });
  const { board, history, pitchGroup, view, animator } = fixture;
  const sequence = new TacticalSequence();
  history.execute(new AddKeyframeCommand({ sequence, board }));
  history.execute(new MovePlayerCommand({ board, teamId: 'red', number: 7, to: { x: -0.1, z: 0.12 } }));
  history.execute(new AddKeyframeCommand({ sequence, board }));
  const seven = playerObject(fixture, 'red', 7);
  const player = new SequencePlayer({ sequence, board, view, animator, targets: [{ object: seven, key: 'red:7' }] });
  const pose = pitchGroup.matrixWorld.clone();
  player.play();
  player.update(0);
  player.update(STEP_DURATION_MS);
  assert.deepEqual([seven.position.x, seven.position.z], [-0.1, 0.12]);
  pitchGroup.updateMatrixWorld(true);
  assert.ok(pitchGroup.matrixWorld.equals(pose), 'la pose du terrain ancré ne change pas');
  const world = seven.getWorldPosition(new THREE.Vector3());
  const expected = pitchGroup.localToWorld(new THREE.Vector3(-0.1, 0, 0.12));
  assert.ok(world.distanceTo(expected) < 1e-12, 'dans le monde, le joueur suit le terrain ancré');
});

test('panneau : état écrit en clair et vitesse à la française', () => {
  assert.equal(formatSpeed(0.5), '0,5×');
  assert.match(describeSequence({ length: 0, state: 'stopped' }), /Image clé/);
  assert.match(describeSequence({ length: 1, state: 'stopped' }), /^1 image clé/);
  assert.equal(describeSequence({ length: 3, state: 'stopped' }), '3 images clés : « Lecture » joue l’action.');
  assert.equal(describeSequence({ length: 3, state: 'playing', step: 2, steps: 2, speed: 2 }), 'Lecture : étape 2 sur 2, vitesse 2×.');
  assert.match(describeSequence({ length: 3, state: 'paused', ended: true }), /^Fin de l’action/);
});
