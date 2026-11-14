/**
 * Tests unitaires des calculs de src/dev-xr-emulation.js : la table virtuelle de l'émulateur,
 * qui remplace la vraie table pour le hit test sur PC.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intersectVirtualTable, rotateByQuaternion, START_POSE, VIRTUAL_TABLE } from '../../src/dev-xr-emulation.js';

const FORWARD = { x: 0, y: 0, z: -1 };

/**
 * Quaternion de la pose de départ : rotation autour de X, vers le bas.
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests unitaires (src/dev-xr-emulation.js) — outil de vérification
 */
function startOrientation() {
  const halfAngle = -(START_POSE.pitchDownDegrees * Math.PI) / 360;
  return { x: Math.sin(halfAngle), y: 0, z: 0, w: Math.cos(halfAngle) };
}

/**
 * Compare deux points à 1e-9 près.
 * @param {{x: number, y: number, z: number}} actual
 * @param {{x: number, y: number, z: number}} expected
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests unitaires (src/dev-xr-emulation.js) — outil de vérification
 */
function assertPoint(actual, expected) {
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(Math.abs(actual[axis] - expected[axis]) < 1e-9, `${axis} : ${actual[axis]} au lieu de ${expected[axis]}`);
  }
}

test('rotation par quaternion : 90° autour de Y amène -Z sur -X', () => {
  const quarterTurn = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
  assertPoint(rotateByQuaternion(FORWARD, quarterTurn), { x: -1, y: 0, z: 0 });
});

test('pose de départ : le regard du téléphone émulé touche la table virtuelle en son centre', () => {
  const origin = { x: 0, y: START_POSE.height, z: 0 };
  const direction = rotateByQuaternion(FORWARD, startOrientation());
  const hit = intersectVirtualTable(origin, direction);

  assert.ok(hit, 'la pose de départ doit viser la table');
  assert.equal(hit.y, VIRTUAL_TABLE.height);
  // 1,35 m − 0,72 m = 0,63 m de dénivelé ; à 35° sous l'horizontale, environ 0,90 m devant.
  assert.ok(Math.abs(hit.z - VIRTUAL_TABLE.centerZ) < 0.01, `z = ${hit.z}`);
});

test('regard horizontal ou vers le haut, ou table au-dessus : pas de surface', () => {
  assert.equal(intersectVirtualTable({ x: 0, y: 1.35, z: 0 }, FORWARD), null);
  assert.equal(intersectVirtualTable({ x: 0, y: 1.35, z: 0 }, { x: 0, y: 0.5, z: -0.8 }), null);
  assert.equal(intersectVirtualTable({ x: 0, y: 0.5, z: 0 }, { x: 0, y: -0.6, z: -0.8 }), null);
});

test('rayon qui passe à côté de la table : pas de surface', () => {
  // Regard vers la droite, au-delà du bord de la table (0,8 m du centre).
  const direction = { x: 0.9, y: -0.3, z: -0.3 };
  assert.equal(intersectVirtualTable({ x: 0, y: 1.35, z: 0 }, direction), null);
});
