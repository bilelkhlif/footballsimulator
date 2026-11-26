/**
 * Tests unitaires du point de vue d'un joueur : src/point-of-view.mjs. Caméra aux yeux du joueur
 * choisi et tournée vers le but adverse, regard borné, pion masqué puis rétabli, commandes de la
 * vue normale rendues, écouteurs retirés, et aucune modification de la scène des joueurs.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TEAMS } from '../../src/config.mjs';
import { FORMATIONS } from '../../src/formations.mjs';
import { createTeam } from '../../src/team.mjs';
import {
  applyLookDelta, EYE_HEIGHT, MAX_LOOK_PITCH, PointOfView,
} from '../../src/point-of-view.mjs';

/**
 * Cible d'événements minimale qui compte ses écouteurs.
 * @returns {{addEventListener: Function, removeEventListener: Function, count: () => number}}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Tests unitaires (src/point-of-view.mjs) — doublure du canvas et du document
 */
function createTarget() {
  const listeners = new Set();
  return {
    addEventListener: (type, listener) => listeners.add(`${type}|${listener.toString()}`),
    removeEventListener: (type, listener) => listeners.delete(`${type}|${listener.toString()}`),
    count: () => listeners.size,
  };
}

/**
 * Terrain avec les deux équipes, pions instanciés simulés, et point de vue.
 * @returns {object}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Tests unitaires (src/point-of-view.mjs) — montage du test
 */
function createSetup() {
  const pitchGroup = new THREE.Group();
  const factory = { createPlayer: ({ team, number, role }) => {
    const player = new THREE.Group();
    player.userData = { type: 'player', teamId: team.id, number, role };
    player.rotation.y = team.attacksPositiveX ? 0 : Math.PI;
    return player;
  } };
  const teamGroups = {
    blue: createTeam(TEAMS.blue, FORMATIONS['4-3-3'], factory),
    red: createTeam(TEAMS.red, FORMATIONS['4-4-2'], factory),
  };
  pitchGroup.add(teamGroups.blue, teamGroups.red);
  const teamMeshes = Object.fromEntries(Object.keys(teamGroups).map((teamId) => [teamId, {
    meshes: [new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 11)],
  }]));
  const canvas = createTarget();
  const document = createTarget();
  const controls = { enabled: true };
  const renderer = { domElement: canvas, xr: { isPresenting: false }, getSize: (target) => target.set(800, 600) };
  const pointOfView = new PointOfView({ renderer, pitchGroup, teamGroups, teamMeshes, controls, document });
  return { pointOfView, teamGroups, teamMeshes, controls, canvas, document, renderer };
}

test('caméra aux yeux du joueur choisi, tournée vers le but adverse ; deux joueurs, deux points de vue', () => {
  const { pointOfView, teamGroups } = createSetup();
  assert.equal(pointOfView.viewCamera, null);
  assert.equal(pointOfView.enter({ type: 'player', teamId: 'blue', number: 9 }), true);
  pointOfView.update(0);
  const nine = teamGroups.blue.children.find((player) => player.userData.number === 9);
  const camera = pointOfView.viewCamera;
  assert.ok(camera.position.distanceTo(new THREE.Vector3(nine.position.x, EYE_HEIGHT, nine.position.z)) < 1e-9);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  assert.ok(forward.x > 0.9, 'les Bleus regardent vers +X');
  const bluePosition = camera.position.clone();

  pointOfView.enter({ type: 'player', teamId: 'red', number: 1 });
  pointOfView.update(16);
  assert.ok(pointOfView.viewCamera.position.distanceTo(bluePosition) > 0.1, 'un autre joueur, un autre point de vue');
  assert.ok(new THREE.Vector3(0, 0, -1).applyQuaternion(pointOfView.viewCamera.quaternion).x < -0.9, 'les Rouges regardent vers -X');
});

test('regard : gauche-droite sans limite, haut-bas borné à 80°', () => {
  let look = { yaw: 0, pitch: 0 };
  look = applyLookDelta(look, 100, 0, 0.01);
  assert.ok(Math.abs(look.yaw + 1) < 1e-12, 'vers la droite');
  look = applyLookDelta(look, 0, -100000, 0.01);
  assert.equal(look.pitch, MAX_LOOK_PITCH);
  look = applyLookDelta(look, 0, 100000, 0.01);
  assert.equal(look.pitch, -MAX_LOOK_PITCH);
});

test('sortie : pion rétabli, commandes rendues, écouteurs retirés, joueurs inchangés', () => {
  const { pointOfView, teamGroups, teamMeshes, controls, canvas, document } = createSetup();
  const before = teamGroups.blue.children.map((player) => player.position.toArray());
  pointOfView.enter({ type: 'player', teamId: 'blue', number: 9 });
  pointOfView.update(0);
  const index = teamGroups.blue.children.findIndex((player) => player.userData.number === 9);
  const matrix = new THREE.Matrix4();
  teamMeshes.blue.meshes[0].getMatrixAt(index, matrix);
  assert.equal(matrix.elements[0], 0, 'pion masqué');
  assert.equal(teamGroups.blue.children[index].visible, false);
  assert.equal(controls.enabled, false);
  assert.ok(canvas.count() > 0 && document.count() > 0);

  assert.equal(pointOfView.exit(), true);
  assert.equal(pointOfView.exit(), false);
  teamMeshes.blue.meshes[0].getMatrixAt(index, matrix);
  assert.equal(matrix.elements[0], 1, 'pion rétabli');
  assert.equal(teamGroups.blue.children[index].visible, true);
  assert.equal(controls.enabled, true);
  assert.equal(canvas.count(), 0);
  assert.equal(document.count(), 0);
  assert.deepEqual(teamGroups.blue.children.map((player) => player.position.toArray()), before);
});

test('refus : ballon, aucune sélection, joueur inconnu, session AR', () => {
  const { pointOfView } = createSetup();
  assert.equal(pointOfView.enter(null), false);
  assert.equal(pointOfView.enter({ type: 'ball' }), false);
  assert.equal(pointOfView.enter({ type: 'player', teamId: 'blue', number: 42 }), false);
  const ar = createSetup();
  ar.renderer.xr.isPresenting = true;
  assert.equal(ar.pointOfView.enter({ type: 'player', teamId: 'blue', number: 9 }), false);
  assert.equal(ar.pointOfView.active, false);
});