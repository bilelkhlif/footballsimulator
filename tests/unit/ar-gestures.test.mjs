/**
 * Tests unitaires du geste de rotation à deux doigts (src/ar-gestures.mjs) : angle et sens de la
 * rotation, zone morte, souris et stylet ignorés, select WebXR ignorés pendant et juste après.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROTATION_DEAD_ZONE, SELECT_GRACE_MS, TwistGesture, wrapAngle } from '../../src/ar-gestures.mjs';

/**
 * Événement pointer tactile de test.
 * @param {number} pointerId
 * @param {number} clientX
 * @param {number} clientY
 * @param {string} [pointerType]
 * @returns {{pointerId: number, clientX: number, clientY: number, pointerType: string}}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests unitaires (geste de rotation) — doublure des événements
 */
function touch(pointerId, clientX, clientY, pointerType = 'touch') {
  return { pointerId, clientX, clientY, pointerType };
}

test('deux doigts qui tournent de 30° dans le sens horaire à l\'écran : le terrain tourne de -30°', () => {
  const rotations = [];
  const gesture = new TwistGesture({ onRotate: (radians) => rotations.push(radians), now: () => 0 });
  gesture.down(touch(1, 100, 200));
  gesture.down(touch(2, 300, 200));
  assert.equal(gesture.active, true);
  // Le second doigt décrit un arc de 30° autour du premier, vers le bas de l'écran (sens horaire).
  for (let step = 1; step <= 6; step += 1) {
    const angle = (step * 5 * Math.PI) / 180;
    gesture.move(touch(2, 100 + 200 * Math.cos(angle), 200 + 200 * Math.sin(angle)));
  }
  const total = rotations.reduce((sum, radians) => sum + radians, 0);
  assert.ok(Math.abs(total + Math.PI / 6) < 1e-9, `${total} radians`);
});

test('zone morte : deux doigts posés qui bougent à peine ne tournent rien ; un seul doigt, souris et stylet non plus', () => {
  const rotations = [];
  const gesture = new TwistGesture({ onRotate: (radians) => rotations.push(radians), now: () => 0 });
  gesture.down(touch(1, 100, 200));
  gesture.move(touch(1, 140, 260));
  gesture.down(touch(2, 300, 200, 'mouse'));
  gesture.down(touch(3, 340, 260));
  const small = ROTATION_DEAD_ZONE / 2;
  gesture.move(touch(3, 140 + 200 * Math.cos(small), 260 + 200 * Math.sin(small)));
  assert.deepEqual(rotations, []);
  assert.ok(Math.abs(Math.abs(wrapAngle(3 * Math.PI)) - Math.PI) < 1e-12);
  assert.ok(Math.abs(wrapAngle(2.5 * Math.PI) - Math.PI / 2) < 1e-12);
});

test('select WebXR ignorés pendant le geste et SELECT_GRACE_MS après ; un toucher simple reste un toucher', () => {
  let time = 0;
  const gesture = new TwistGesture({ onRotate: () => {}, now: () => time });
  gesture.down(touch(1, 0, 0));
  assert.equal(gesture.suppressesSelect(), false, 'un doigt : toucher normal');
  gesture.down(touch(2, 100, 0));
  assert.equal(gesture.suppressesSelect(), true);
  time = 1000;
  gesture.up(touch(2, 100, 0));
  gesture.up(touch(1, 0, 0));
  assert.equal(gesture.suppressesSelect(), true, 'les doigts levés envoient encore leur select');
  time += SELECT_GRACE_MS + 1;
  assert.equal(gesture.suppressesSelect(), false);
});
