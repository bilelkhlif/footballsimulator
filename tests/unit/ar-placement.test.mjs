/**
 * Tests unitaires de src/ar-placement.js : position du terrain devant l'utilisateur.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePitchPlacement, PLACEMENT_DISTANCE, PLACEMENT_DROP } from '../../src/ar-placement.js';

/**
 * Quaternion d'une rotation d'angle donné autour d'un axe unitaire.
 * @param {{x: number, y: number, z: number}} axis
 * @param {number} angle en radians
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
