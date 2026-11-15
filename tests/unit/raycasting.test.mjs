/**
 * Tests unitaires de src/raycasting.js (sprint 5) : rayon depuis la caméra et depuis une pose WebXR,
 * sélection des joueurs et du ballon par leurs zones de sélection, plan du gazon et passage du
 * repère monde au repère du terrain, pour un terrain déplacé et tourné par son ancre.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  intersectPitchPlane, pickTarget, pitchToWorld, pointerToNdc, setRayFromCamera, setRayFromXrPose, worldToPitch,
} from '../../src/raycasting.js';
import { aimRay, createTacticalFixture, playerObject } from './tactical-fixtures.mjs';
import { PLAYER_SIZE, TEAMS } from '../../src/config.js';

/** Hauteur du dessus de la zone de sélection d'un joueur, en mètres (voir PlayerFactory). */
const HITBOX_TOP = PLAYER_SIZE.height * 1.5;

/** Poses d'ancre : à l'origine, déplacée et tournée comme sur la table émulée, et inclinée. */
const ANCHOR_POSES = [
  { position: new THREE.Vector3(0, 0, 0), rotation: new THREE.Euler(0, 0, 0) },
  { position: new THREE.Vector3(-0.35, 0.728, -0.82), rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(25), 0) },
  { position: new THREE.Vector3(0.2, 0.9, -1.1), rotation: new THREE.Euler(0.14, -2.44, -0.09) },
];

/**
 * Égalité à une tolérance près.
 * @param {number} a
 * @param {number} b
 * @param {number} [tolerance]
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (src/raycasting.js) — outil de vérification
 */
function near(a, b, tolerance = 1e-9) {
  return Math.abs(a - b) <= tolerance;
}

/**
 * Pose WebXR d'un rayon qui part de « from » et vise « to » : orientation qui amène -Z sur la
 * direction visée.
 * @param {THREE.Vector3} from
 * @param {THREE.Vector3} to
 * @returns {{position: THREE.Vector3, orientation: THREE.Quaternion}}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (src/raycasting.js) — doublure
 */
function xrPoseToward(from, to) {
  const direction = to.clone().sub(from).normalize();
  return { position: from.clone(), orientation: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction) };
}

test('coordonnées normalisées : coins et centre du canvas', () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 };
  assert.deepEqual(pointerToNdc(10, 20, rect).toArray(), [-1, 1]);
  assert.deepEqual(pointerToNdc(210, 120, rect).toArray(), [1, -1]);
  assert.deepEqual(pointerToNdc(110, 70, rect).toArray(), [0, 0]);
  const reused = new THREE.Vector2();
  assert.equal(pointerToNdc(0, 0, rect, reused), reused, 'le vecteur fourni est réutilisé');
});

test('rayon WebXR : origine à la position de la source, direction -Z tournée par son orientation', () => {
  const raycaster = new THREE.Raycaster();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 4);
  setRayFromXrPose(raycaster, { position: { x: 0.1, y: 1.35, z: 0 }, orientation: { x: q.x, y: q.y, z: q.z, w: q.w } });
  assert.deepEqual(raycaster.ray.origin.toArray(), [0.1, 1.35, 0]);
  const { x, y, z } = raycaster.ray.direction;
  assert.ok(near(x, 0) && near(y, -Math.SQRT1_2) && near(z, -Math.SQRT1_2), `direction (${x}, ${y}, ${z})`);
});

test('vue 3D : chacun des 22 joueurs et le ballon se sélectionnent par leur zone de sélection', () => {
  const fixture = createTacticalFixture();
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.01, 10);
  camera.position.set(0, 1.2, 0.001);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  for (const teamId of Object.keys(TEAMS)) {
    for (const player of fixture.teamGroups[teamId].children) {
      const top = player.localToWorld(new THREE.Vector3(0, HITBOX_TOP, 0)).project(camera);
      setRayFromCamera(raycaster, ndc.set(top.x, top.y), camera);
      const picked = pickTarget(raycaster, fixture.view.hitboxes);
      assert.equal(picked?.object, player, `${teamId} n° ${player.userData.number}`);
    }
  }
  const ball = fixture.ball.getWorldPosition(new THREE.Vector3()).project(camera);
  assert.equal(pickTarget(setRayFromCamera(raycaster, ndc.set(ball.x, ball.y), camera), fixture.view.hitboxes)?.object, fixture.ball);
});

test('vue 3D en biais : le ballon reste sélectionnable au centre, et un clic dans le vide ne sélectionne rien', () => {
  const fixture = createTacticalFixture();
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.01, 10);
  camera.position.set(0, 0.7, 0.55);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const raycaster = new THREE.Raycaster();
  const ball = fixture.ball.getWorldPosition(new THREE.Vector3()).project(camera);
  assert.equal(pickTarget(setRayFromCamera(raycaster, new THREE.Vector2(ball.x, ball.y), camera), fixture.view.hitboxes)?.object, fixture.ball);
  assert.equal(pickTarget(setRayFromCamera(raycaster, new THREE.Vector2(0, 0.95), camera), fixture.view.hitboxes), null);
});

test('AR : terrain déplacé et tourné par son ancre, le rayon du téléphone sélectionne le bon joueur', () => {
  const { position, rotation } = ANCHOR_POSES[1];
  const fixture = createTacticalFixture({ position, rotation });
  const raycaster = new THREE.Raycaster();
  // Téléphone tenu au-dessus de la table, comme un utilisateur penché sur le terrain.
  const phone = position.clone().add(new THREE.Vector3(0.04, 0.45, 0.08));
  for (const [teamId, number] of [['blue', 7], ['blue', 1], ['red', 4], ['red', 11]]) {
    const player = playerObject(fixture, teamId, number);
    const top = player.localToWorld(new THREE.Vector3(0, HITBOX_TOP, 0));
    setRayFromXrPose(raycaster, xrPoseToward(phone, top));
    assert.equal(pickTarget(raycaster, fixture.view.hitboxes)?.object, player, `${teamId} n° ${number}`);
  }
});

test('plan du terrain : le point touché est exact dans le repère du terrain, quelle que soit la pose de l\'ancre', () => {
  const target = new THREE.Vector3();
  for (const { position, rotation } of ANCHOR_POSES) {
    const pitchGroup = new THREE.Group();
    pitchGroup.position.copy(position);
    pitchGroup.rotation.copy(rotation);
    for (const [x, z] of [[0.1, -0.05], [-0.25, 0.15], [0, 0], [0.31, -0.2]]) {
      const world = pitchToWorld(pitchGroup, { x, z });
      const eye = world.clone().add(new THREE.Vector3(0.3, 0.5, 0.4));
      const local = intersectPitchPlane(aimRay(new THREE.Raycaster(), eye, world), pitchGroup, target);
      assert.equal(local, target, 'le vecteur fourni est réutilisé');
      assert.ok(near(local.x, x) && near(local.z, z) && local.y === 0, `(${x} ; ${z}) → (${local.x} ; ${local.z})`);
    }
  }
});

test('changement de repère : monde → terrain → monde, et le point monde diffère du point du terrain', () => {
  const { position, rotation } = ANCHOR_POSES[1];
  const pitchGroup = new THREE.Group();
  pitchGroup.position.copy(position);
  pitchGroup.rotation.copy(rotation);
  const world = pitchToWorld(pitchGroup, { x: 0.12, z: -0.07 });
  assert.ok(Math.abs(world.x - 0.12) > 0.1, 'sans changement de repère, le point serait faux');
  const back = worldToPitch(pitchGroup, world);
  assert.ok(near(back.x, 0.12) && near(back.y, 0) && near(back.z, -0.07));
});

test('rayon parallèle au gazon ou tourné vers le ciel : aucun point', () => {
  const pitchGroup = new THREE.Group();
  pitchGroup.position.set(0, 0.7, 0);
  const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
  assert.equal(intersectPitchPlane(raycaster, pitchGroup), null);
  raycaster.set(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0));
  assert.equal(intersectPitchPlane(raycaster, pitchGroup), null);
});
