/**
 * Tests unitaires de src/ar-placement.mjs : terrain devant l'utilisateur (sprint 2) et terrain
 * posé sur une surface réelle (sprint 3).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePitchPlacement, computeSurfacePlacement, yawToQuaternion, PLACEMENT_DISTANCE, PLACEMENT_DROP, SURFACE_OFFSET,
} from '../../src/ar-placement.mjs';

/**
 * Quaternion d'une rotation d'angle donné autour d'un axe unitaire.
 * @param {{x: number, y: number, z: number}} axis
 * @param {number} angle en radians
 * @responsable Bilel Khlif
 * @date 2026-11-10
 * @role Tests unitaires (src/ar-placement.mjs) — outil de vérification
 */
function rotation(axis, angle) {
  const s = Math.sin(angle / 2);
  return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(angle / 2) };
}

const VERTICAL = { x: 0, y: 1, z: 0 };
const LATERAL = { x: 1, y: 0, z: 0 };
const VIEWER_POSITION = { x: 0.2, y: 1.4, z: -0.1 };

/**
 * Vérifie qu'un placement correspond à la position et à la rotation attendues.
 * @param {{position: object, rotationY: number}} actual
 * @param {{x: number, y: number, z: number}} position
 * @param {number} rotationY
 * @responsable Bilel Khlif
 * @date 2026-11-10
 * @role Tests unitaires (src/ar-placement.mjs) — outil de vérification
 */
function assertPlacement(actual, position, rotationY) {
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(Math.abs(actual.position[axis] - position[axis]) < 1e-9, `${axis} : ${actual.position[axis]} au lieu de ${position[axis]}`);
  }
  assert.ok(Math.abs(actual.rotationY - rotationY) < 1e-9, `rotation : ${actual.rotationY} au lieu de ${rotationY}`);
}

test('regard droit devant (-Z) : terrain 0,9 m devant et 0,5 m plus bas, sans rotation', () => {
  const placement = computePitchPlacement({ position: VIEWER_POSITION, orientation: rotation(VERTICAL, 0) });
  assertPlacement(placement, { x: 0.2, y: 1.4 - PLACEMENT_DROP, z: -0.1 - PLACEMENT_DISTANCE }, 0);
});

test('utilisateur tourné de 90° vers la gauche : le terrain le suit et lui fait face', () => {
  const placement = computePitchPlacement({ position: VIEWER_POSITION, orientation: rotation(VERTICAL, Math.PI / 2) });
  assertPlacement(placement, { x: 0.2 - PLACEMENT_DISTANCE, y: 1.4 - PLACEMENT_DROP, z: -0.1 }, Math.PI / 2);
});

test('téléphone incliné vers la table : l\'inclinaison est ignorée, le terrain reste horizontal et devant', () => {
  const tilted = computePitchPlacement({ position: VIEWER_POSITION, orientation: rotation(LATERAL, -Math.PI / 4) });
  const level = computePitchPlacement({ position: VIEWER_POSITION, orientation: rotation(VERTICAL, 0) });
  assertPlacement(tilted, level.position, level.rotationY);
});

test('téléphone pointé droit vers le sol : direction -Z par défaut, sans valeur invalide', () => {
  const placement = computePitchPlacement({ position: VIEWER_POSITION, orientation: rotation(LATERAL, -Math.PI / 2) });
  assertPlacement(placement, { x: 0.2, y: 1.4 - PLACEMENT_DROP, z: -0.1 - PLACEMENT_DISTANCE }, 0);
});

test('quelle que soit l\'orientation, le terrain est à 0,9 m à l\'horizontale de l\'utilisateur', () => {
  for (const angle of [0.3, 1.2, 2.5, -2.9]) {
    const { position } = computePitchPlacement({ position: VIEWER_POSITION, orientation: rotation(VERTICAL, angle) });
    const horizontalDistance = Math.hypot(position.x - VIEWER_POSITION.x, position.z - VIEWER_POSITION.z);
    assert.ok(Math.abs(horizontalDistance - PLACEMENT_DISTANCE) < 1e-9, `angle ${angle} : ${horizontalDistance} m`);
  }
});

test('surface : le terrain est centré sur le point visé, son plateau posé sur la table', () => {
  const placement = computeSurfacePlacement({ x: 0.1, y: 0.72, z: -0.9 }, { x: 0.1, y: 1.35, z: 0 });
  // Point visé droit devant (-Z) : pas de rotation ; le gazon est à 8 mm au-dessus de la table.
  assertPlacement(placement, { x: 0.1, y: 0.72 + SURFACE_OFFSET, z: -0.9 }, 0);
  assert.equal(SURFACE_OFFSET, 0.008);
});

test("surface visée sur le côté : le terrain se tourne pour présenter sa longueur à l'utilisateur", () => {
  // Point à gauche de l'utilisateur (-X) : même rotation que pour un regard tourné de 90° à gauche.
  const placement = computeSurfacePlacement({ x: -0.8, y: 0.7, z: 0 }, { x: 0, y: 1.4, z: 0 });
  const facingLeft = computePitchPlacement({ position: { x: 0, y: 1.4, z: 0 }, orientation: rotation(VERTICAL, Math.PI / 2) });
  assertPlacement(placement, { x: -0.8, y: 0.7 + SURFACE_OFFSET, z: 0 }, facingLeft.rotationY);
});

test('surface juste sous le téléphone : direction -Z par défaut, sans valeur invalide', () => {
  const placement = computeSurfacePlacement({ x: 0.2, y: 0.7, z: -0.1 }, { x: 0.2, y: 1.4, z: -0.1 });
  assertPlacement(placement, { x: 0.2, y: 0.7 + SURFACE_OFFSET, z: -0.1 }, 0);
});

test("quaternion de l'ancre : rotation pure autour de l'axe vertical, unitaire", () => {
  for (const angle of [0, 0.7, Math.PI / 2, -2.4]) {
    const q = yawToQuaternion(angle);
    const expected = rotation(VERTICAL, angle);
    for (const axis of ['x', 'y', 'z', 'w']) {
      assert.ok(Math.abs(q[axis] - expected[axis]) < 1e-12, `${axis} pour l'angle ${angle}`);
    }
    assert.ok(Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) < 1e-12);
  }
});
