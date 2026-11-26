/**
 * Tests unitaires du marquage individuel : TacticsBoard (setMarking, removeMarking, instantanés),
 * MarkPlayerCommand (création, remplacement, retrait, annulation), le mode « marquage » de
 * l'interaction tactique, la sauvegarde, et les traits en 3D (src/marking-layer.mjs).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TacticsBoard } from '../../src/tactics-board.mjs';
import { CommandHistory, MarkPlayerCommand } from '../../src/commands.mjs';
import { INTERACTION_MODES, INTERACTION_STATES } from '../../src/tactical-interaction.mjs';
import { MarkingLayer } from '../../src/marking-layer.mjs';
import { captureTactic, isValidTactic } from '../../src/tactic-storage.mjs';
import { TacticalSequence } from '../../src/tactical-sequence.mjs';
import { DEFAULT_FORMATIONS } from '../../src/config.mjs';
import { aimRay, createTacticalFixture, pitchPointToWorld, playerObject } from './tactical-fixtures.mjs';

/**
 * Joueur bleu, par son numéro.
 * @param {number} number
 * @returns {{teamId: string, number: number}}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests unitaires (marquage) — identité des joueurs
 */
const blue = (number) => ({ teamId: 'blue', number });

/**
 * Joueur rouge, par son numéro.
 * @param {number} number
 * @returns {{teamId: string, number: number}}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests unitaires (marquage) — identité des joueurs
 */
const red = (number) => ({ teamId: 'red', number });

test('tableau : un défenseur marque un adversaire ; jamais un partenaire', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const events = [];
  board.on('change', ({ type }) => events.push(type));
  assert.equal(board.setMarking(red(4), blue(9)), true);
  assert.deepEqual(board.getMarkings(), [{ defender: red(4), attacker: blue(9) }]);
  assert.deepEqual(board.getMarkingOf(red(4)), blue(9));
  assert.equal(board.setMarking(red(4), blue(9)), false, 'déjà en place : sans effet');
  assert.deepEqual(events, ['markings']);
  assert.throws(() => board.setMarking(red(4), red(5)), /deux adversaires/);
  assert.throws(() => board.setMarking(red(4), blue(12)), /Joueur inconnu/);
});

test('prise à deux : un attaquant peut être marqué par deux défenseurs ; un défenseur ne marque qu\'un joueur', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  board.setMarking(red(4), blue(9));
  board.setMarking(red(5), blue(9));
  assert.equal(board.getMarkings().length, 2);
  board.setMarking(red(4), blue(11));
  assert.deepEqual(board.getMarkingOf(red(4)), blue(11), 'le nouveau marquage remplace l\'ancien');
  assert.equal(board.getMarkings().length, 2);
});

test('MarkPlayerCommand : créer, remplacer, retirer, et l\'annulation rend exactement l\'état d\'avant', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const history = new CommandHistory();
  const create = new MarkPlayerCommand({ board, defender: red(4), attacker: blue(9) });
  assert.equal(history.execute(create), true);
  assert.equal(create.label, 'Marquage du n° 9 par le n° 4 des Rouges');

  history.execute(new MarkPlayerCommand({ board, defender: red(4), attacker: blue(11) }));
  assert.deepEqual(board.getMarkingOf(red(4)), blue(11));
  history.undo();
  assert.deepEqual(board.getMarkingOf(red(4)), blue(9), 'l\'annulation rend le marquage remplacé');

  const remove = new MarkPlayerCommand({ board, defender: red(4), attacker: blue(9) });
  history.execute(remove);
  assert.equal(remove.removed, true);
  assert.equal(remove.label, 'Retirer le marquage du n° 4 des Rouges');
  assert.equal(board.getMarkingOf(red(4)), null);
  history.undo();
  assert.deepEqual(board.getMarkingOf(red(4)), blue(9));
  history.undo();
  assert.deepEqual(board.getMarkings(), []);
});

test('instantanés et réinitialisation : marquages rétablis, puis effacés ; tactique ancienne sans marquages acceptée', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  board.setMarking(blue(5), red(9));
  const snapshot = board.snapshot();
  assert.deepEqual(snapshot.markings, [['blue:5', 'red:9']]);
  const other = new TacticsBoard(DEFAULT_FORMATIONS);
  other.restore(snapshot);
  assert.deepEqual(other.getMarkings(), board.getMarkings());
  const legacy = structuredClone(snapshot);
  delete legacy.markings;
  other.restore(legacy);
  assert.deepEqual(other.getMarkings(), []);
  assert.equal(board.reset(), true);
  assert.deepEqual(board.getMarkings(), []);
});

test('sauvegarde : des marquages incohérents sont refusés', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  board.setMarking(blue(5), red(9));
  const data = captureTactic(board, new TacticalSequence());
  const reference = new TacticsBoard(DEFAULT_FORMATIONS).snapshot();
  assert.equal(isValidTactic(data, reference), true);
  const variant = (markings) => ({ ...data, board: { ...data.board, markings } });
  assert.equal(isValidTactic(variant([['blue:5', 'blue:9']]), reference), false, 'deux partenaires');
  assert.equal(isValidTactic(variant([['blue:5', 'red:12']]), reference), false, 'joueur inconnu');
  assert.equal(isValidTactic(variant([['blue:5', 'red:9'], ['blue:5', 'red:10']]), reference), false, 'deux marquages pour un défenseur');
  assert.equal(isValidTactic(variant('blue:5'), reference), false);
});

/**
 * Toucher un joueur de la maquette, vu d'en haut, comme le ferait la souris.
 * @param {ReturnType<typeof createTacticalFixture>} fixture
 * @param {string} teamId
 * @param {number} number
 * @returns {object} réponse de l'interaction
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests unitaires (marquage) — geste simulé
 */
function tapPlayer(fixture, teamId, number) {
  const eye = pitchPointToWorld(fixture.pitchGroup, 0.02, 0.03, 0.9);
  const target = playerObject(fixture, teamId, number).localToWorld(new THREE.Vector3(0, 0.03, 0));
  return fixture.interaction.handleTap(aimRay(new THREE.Raycaster(), eye, target));
}

test('mode marquage : défenseur, puis adversaire ; un partenaire est refusé ; retoucher le défenseur abandonne', () => {
  const fixture = createTacticalFixture();
  const { interaction, board, history } = fixture;
  interaction.setMode(INTERACTION_MODES.MARK);
  assert.equal(interaction.state, INTERACTION_STATES.ARROW_START);
  assert.equal(interaction.wantsHover, false);

  assert.match(tapPlayer(fixture, 'red', 4).message, /^Marquage du n° 4 des Rouges : touchez l’adversaire/);
  assert.equal(interaction.wantsHover, false, 'pas d\'aperçu de flèche pendant un marquage');
  assert.match(tapPlayer(fixture, 'red', 5).message, /deux adversaires/);
  assert.equal(board.getMarkings().length, 0);
  assert.equal(tapPlayer(fixture, 'blue', 9).message, 'Le n° 4 des Rouges marque le n° 9 des Bleus.');
  assert.deepEqual(board.getMarkingOf(red(4)), blue(9));
  assert.equal(history.canUndo, true);
  assert.equal(interaction.state, INTERACTION_STATES.ARROW_START, 'prêt pour le marquage suivant');

  tapPlayer(fixture, 'blue', 3);
  assert.equal(tapPlayer(fixture, 'blue', 3).action, 'cancel');
  assert.equal(interaction.draft, null);
});

test('traits en 3D : un par marquage, du défenseur vers l\'attaquant, qui suivent les pions', () => {
  const fixture = createTacticalFixture();
  const layer = new MarkingLayer({ pitchGroup: fixture.pitchGroup, board: fixture.board, teamGroups: fixture.teamGroups });
  assert.equal(layer.count, 0);
  fixture.board.setMarking(red(4), blue(9));
  assert.equal(layer.count, 1);
  const mesh = fixture.pitchGroup.getObjectByName('marking-red:4>blue:9');
  const defender = playerObject(fixture, 'red', 4);
  const attacker = playerObject(fixture, 'blue', 9);
  const length = Math.hypot(attacker.position.x - defender.position.x, attacker.position.z - defender.position.z);
  assert.ok(Math.abs(mesh.position.x - defender.position.x) < 1e-12 && Math.abs(mesh.scale.x - length) < 1e-12);
  // L'attaquant glisse ailleurs : le trait suit à l'image suivante.
  attacker.position.set(0.1, 0, 0.1);
  layer.update();
  const newLength = Math.hypot(0.1 - defender.position.x, 0.1 - defender.position.z);
  assert.ok(Math.abs(mesh.scale.x - newLength) < 1e-12);
  fixture.board.removeMarking(red(4));
  assert.equal(layer.count, 0);
  layer.dispose();
});
