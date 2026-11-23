/**
 * Tests unitaires de src/tactical-view.mjs et src/tactical-arrows.mjs (sprint 5) : la scène suit le
 * tableau tactique, y compris quand un déplacement à la main croise une transition de formation ou
 * quand une transition interrompue est annulée ; les flèches 3D restent dans le repère du terrain
 * et leurs ressources sont libérées.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTacticalFixture, playerObject } from './tactical-fixtures.mjs';
import { AddArrowCommand, ChangeFormationCommand, MovePlayerCommand, ResetBoardCommand } from '../../src/commands.mjs';
import { computeTeamTargets, TRANSITION_DURATION_MS } from '../../src/formation-transition.mjs';
import { MOVE_DURATION_MS } from '../../src/tactical-view.mjs';
import { ARROW_DIMENSIONS } from '../../src/tactical-arrows.mjs';
import { FORMATIONS } from '../../src/formations.mjs';

/**
 * Fait avancer l'horloge puis les déplacements d'une durée donnée.
 * @param {ReturnType<typeof createTacticalFixture>} fixture
 * @param {number} ms
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (src/tactical-view.mjs) — outil de vérification
 */
function advance(fixture, ms) {
  fixture.clock.advance(ms);
  fixture.animator.update();
}

/**
 * Vérifie que chaque joueur affiché est exactement à sa place du tableau, et le ballon aussi.
 * @param {ReturnType<typeof createTacticalFixture>} fixture
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (src/tactical-view.mjs) — outil de vérification
 */
function assertSceneMatchesBoard(fixture) {
  for (const [teamId, group] of Object.entries(fixture.teamGroups)) {
    for (const player of group.children) {
      const { x, z } = fixture.board.getPlayerPosition(teamId, player.userData.number);
      assert.deepEqual([player.position.x, player.position.z], [x, z], `${teamId} n° ${player.userData.number}`);
    }
  }
  const ball = fixture.board.getBallPosition();
  assert.deepEqual([fixture.ball.position.x, fixture.ball.position.z], [ball.x, ball.z]);
}

test('déplacement à la main : 0,35 s d\'animation, puis place exacte du tableau', () => {
  const fixture = createTacticalFixture();
  const { board, history } = fixture;
  history.execute(new MovePlayerCommand({ board, teamId: 'red', number: 6, to: { x: -0.05, z: 0.12 } }));
  const player = playerObject(fixture, 'red', 6);
  advance(fixture, MOVE_DURATION_MS / 2);
  assert.notDeepEqual([player.position.x, player.position.z], [-0.05, 0.12], 'en route');
  advance(fixture, MOVE_DURATION_MS / 2);
  assertSceneMatchesBoard(fixture);
});

test('conflit : un joueur déplacé à la main pendant une transition la quitte sans saut ; les autres la terminent', () => {
  const fixture = createTacticalFixture();
  const { board, history } = fixture;
  history.execute(new ChangeFormationCommand({ board, teamId: 'blue', formation: '3-5-2' }));
  advance(fixture, 300);
  const nine = playerObject(fixture, 'blue', 9);
  const shown = [nine.position.x, nine.position.z];

  history.execute(new MovePlayerCommand({ board, teamId: 'blue', number: 9, to: { x: 0.05, z: 0.14 } }));
  advance(fixture, 0);
  assert.deepEqual([nine.position.x, nine.position.z], shown, 'aucun saut au changement de cible');

  advance(fixture, TRANSITION_DURATION_MS);
  assertSceneMatchesBoard(fixture);
  assert.deepEqual([nine.position.x, nine.position.z], [0.05, 0.14]);
  assert.equal(nine.userData.role, computeTeamTargets(FORMATIONS['3-5-2'], true).get(9).role, 'il prend tout de même le poste de la formation');

  history.undo();
  advance(fixture, TRANSITION_DURATION_MS);
  const target = computeTeamTargets(FORMATIONS['3-5-2'], true).get(9);
  assert.deepEqual([nine.position.x, nine.position.z], [target.x, target.z], 'Annuler le ramène à sa place de formation');
});

test('transition interrompue puis annulée : retour exact à la formation d\'avant, places et postes', () => {
  const fixture = createTacticalFixture();
  const { board, history } = fixture;
  history.execute(new ChangeFormationCommand({ board, teamId: 'red', formation: '3-5-2' }));
  advance(fixture, 300);
  const middle = board.snapshot();
  history.execute(new ChangeFormationCommand({ board, teamId: 'red', formation: '4-2-3-1' }));
  advance(fixture, 200); // la transition vers 3-5-2 n'était pas finie, celle vers 4-2-3-1 non plus

  history.undo();
  assert.deepEqual(board.snapshot(), middle, 'le tableau revient exactement au 3-5-2');
  advance(fixture, TRANSITION_DURATION_MS);
  assertSceneMatchesBoard(fixture);
  const roles = computeTeamTargets(FORMATIONS['3-5-2'], false);
  for (const player of fixture.teamGroups.red.children) {
    assert.equal(player.userData.role, roles.get(player.userData.number).role);
  }
  assert.equal(fixture.teamGroups.red.userData.formation, '3-5-2');

  history.undo();
  advance(fixture, TRANSITION_DURATION_MS);
  assert.equal(board.isInInitialState(), true);
  assertSceneMatchesBoard(fixture);
});

test('réinitialisation pendant une animation : scène et tableau reviennent exactement au départ', () => {
  const fixture = createTacticalFixture();
  const { board, history } = fixture;
  history.execute(new ChangeFormationCommand({ board, teamId: 'blue', formation: '4-4-2' }));
  history.execute(new MovePlayerCommand({ board, teamId: 'red', number: 2, to: { x: 0.02, z: -0.15 } }));
  advance(fixture, 100);
  history.execute(new ResetBoardCommand({ board }));
  advance(fixture, TRANSITION_DURATION_MS);
  assert.equal(board.isInInitialState(), true);
  assertSceneMatchesBoard(fixture);
});

test('flèches 3D : une par flèche du tableau, enfant de pitchGroup, de son départ à son arrivée ; géométrie libérée au retrait', () => {
  const fixture = createTacticalFixture({ position: { x: -0.35, y: 0.728, z: -0.82 }, rotation: new THREE.Euler(0, 0.44, 0) });
  const { board, history, view } = fixture;
  const from = { x: -0.12, z: 0.05 };
  const to = { x: 0.08, z: -0.09 };
  history.execute(new AddArrowCommand({ board, arrow: { kind: 'pass', from, to } }));
  history.execute(new AddArrowCommand({ board, arrow: { kind: 'run', from: to, to: { x: 0.2, z: 0 } } }));
  assert.equal(view.arrowLayer.count, 2);
  assert.equal(view.arrowLayer.group.parent, fixture.pitchGroup, 'dans le repère du terrain, pas de la caméra');

  const [pass, run] = view.arrowLayer.group.children;
  pass.updateMatrix();
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const tip = new THREE.Vector3(length, 0, 0).applyMatrix4(pass.matrix);
  assert.ok(Math.abs(tip.x - to.x) < 1e-12 && Math.abs(tip.z - to.z) < 1e-12, 'la pointe est sur l\'arrivée');
  assert.equal(tip.y, ARROW_DIMENSIONS.height);
  assert.ok(run.geometry.getAttribute('position').count > pass.geometry.getAttribute('position').count, 'la course est en tirets');

  let disposed = 0;
  const dispose = run.geometry.dispose.bind(run.geometry);
  run.geometry.dispose = () => {
    disposed += 1;
    dispose();
  };
  history.undo();
  assert.equal(view.arrowLayer.count, 1);
  assert.equal(disposed, 1, 'la géométrie de la flèche retirée est libérée');
  assert.equal(run.parent, null);
});

test('anneau de sélection : il suit le joueur sélectionné pendant son déplacement ; aperçu du départ au point survolé', () => {
  const fixture = createTacticalFixture();
  const { board, history, view, interaction, pitchGroup } = fixture;
  const ring = pitchGroup.getObjectByName('selection-ring');
  const preview = pitchGroup.getObjectByName('arrow-preview');

  interaction.emit('statechange', { mode: 'move', state: 'selected', selection: { type: 'player', teamId: 'blue', number: 8 }, arrowStart: null });
  history.execute(new MovePlayerCommand({ board, teamId: 'blue', number: 8, to: { x: 0.1, z: 0.1 } }));
  advance(fixture, MOVE_DURATION_MS / 2);
  view.update();
  const eight = playerObject(fixture, 'blue', 8);
  assert.equal(ring.visible, true);
  assert.deepEqual([ring.position.x, ring.position.z], [eight.position.x, eight.position.z]);

  interaction.setMode('pass');
  interaction.emit('statechange', { mode: 'pass', state: 'arrow-end', selection: null, arrowStart: { x: 0, z: 0 } });
  view.update();
  assert.equal(ring.visible, false);
  assert.equal(preview.visible, false, 'pas d\'aperçu sans point survolé');
});

test('vue libérée : plus d\'abonnement au tableau, flèches et repères retirés de la scène', () => {
  const fixture = createTacticalFixture();
  const { board, view, pitchGroup } = fixture;
  board.addArrow({ kind: 'pass', from: { x: 0, z: 0 }, to: { x: 0.1, z: 0 } });
  view.dispose();
  const player = playerObject(fixture, 'blue', 2);
  const before = player.position.clone();
  board.setPlayerPosition('blue', 2, { x: -0.2, z: 0.1 });
  advance(fixture, TRANSITION_DURATION_MS);
  assert.deepEqual(player.position, before, 'la vue libérée ne suit plus le tableau');
  for (const name of ['tactical-arrows', 'arrow-preview', 'selection-ring', 'arrow-start']) {
    assert.equal(pitchGroup.getObjectByName(name), undefined, `${name} retiré`);
  }
});

test('sprint 6 : returnToBoard ramène chaque objet à sa place du tableau, depuis l\'endroit affiché', () => {
  const fixture = createTacticalFixture();
  const { board, view, animator } = fixture;
  const three = playerObject(fixture, 'blue', 3);
  three.position.x += 0.08; // déplacé par une lecture, sans changer le tableau
  fixture.ball.position.z = 0.1;
  view.returnToBoard();
  assert.equal(animator.isMoving(three), true);
  advance(fixture, MOVE_DURATION_MS);
  assertSceneMatchesBoard(fixture);
  const shown = [three.position.x, three.position.z];
  animator.moveTo(three, { x: 0, z: 0 });
  animator.clear();
  advance(fixture, MOVE_DURATION_MS);
  assert.equal(animator.isAnimating, false, 'clear interrompt tous les déplacements');
  assert.deepEqual([three.position.x, three.position.z], shown, 'sur place');
  assert.equal(board.getPlayerPosition('blue', 3).x, shown[0], 'le tableau, lui, n\'a pas changé');
});
