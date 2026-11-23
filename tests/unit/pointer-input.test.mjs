/**
 * Tests unitaires de src/pointer-input.mjs (sprint 5) : un tap devient un rayon depuis la caméra, un
 * glissé ou un pincement restent aux contrôles d'orbite, la souris guide l'aperçu, et la saisie se
 * tait pendant une session AR.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { isTap, PointerInput, TAP_MAX_DISTANCE_PX, TAP_MAX_DURATION_MS } from '../../src/pointer-input.mjs';

/**
 * Doublure du canvas : un EventTarget de 800 × 400 pixels.
 * @returns {EventTarget & {getBoundingClientRect: () => object}}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (src/pointer-input.mjs) — doublure
 */
function createFakeCanvas() {
  const canvas = new EventTarget();
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400 });
  return canvas;
}

/**
 * Doublure de l'interaction : enregistre les rayons des taps et du survol.
 * @param {boolean} [wantsHover]
 * @returns {object}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (src/pointer-input.mjs) — doublure
 */
function createFakeInteraction(wantsHover = false) {
  return {
    wantsHover,
    taps: [],
    hovers: [],
    handleTap(raycaster) {
      this.taps.push(raycaster.ray.direction.clone());
    },
    hover(raycaster) {
      this.hovers.push(raycaster ? raycaster.ray.direction.clone() : null);
    },
  };
}

/**
 * Événement de pointeur de test.
 * @param {string} type
 * @param {object} fields clientX, clientY, pointerId, timeStamp, pointerType, button
 * @returns {Event}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (src/pointer-input.mjs) — doublure
 */
function pointerEvent(type, { clientX = 400, clientY = 200, pointerId = 1, timeStamp = 0, pointerType = 'touch', button = 0 } = {}) {
  const event = new Event(type);
  Object.defineProperties(event, {
    clientX: { value: clientX }, clientY: { value: clientY }, pointerId: { value: pointerId },
    pointerType: { value: pointerType }, button: { value: button }, timeStamp: { value: timeStamp },
  });
  return event;
}

/**
 * Saisie branchée sur un canvas et une caméra de test.
 * @param {object} [options]
 * @returns {{canvas: EventTarget, interaction: object, input: PointerInput, state: {presenting: boolean}}}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (src/pointer-input.mjs) — montage du test
 */
function createSetup({ wantsHover = false } = {}) {
  const canvas = createFakeCanvas();
  const interaction = createFakeInteraction(wantsHover);
  const camera = new THREE.PerspectiveCamera(50, 2, 0.01, 10);
  camera.position.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  const state = { presenting: false };
  const input = new PointerInput({
    element: canvas, camera, raycaster: new THREE.Raycaster(), interaction, isPresenting: () => state.presenting,
  }).attach();
  return { canvas, interaction, input, state };
}

test('reconnaissance du tap : peu de mouvement et peu de temps', () => {
  assert.equal(isTap({ x: 0, y: 0, time: 0 }, { x: TAP_MAX_DISTANCE_PX, y: 0, time: TAP_MAX_DURATION_MS }), true);
  assert.equal(isTap({ x: 0, y: 0, time: 0 }, { x: TAP_MAX_DISTANCE_PX + 1, y: 0, time: 10 }), false);
  assert.equal(isTap({ x: 0, y: 0, time: 0 }, { x: 0, y: 0, time: TAP_MAX_DURATION_MS + 1 }), false);
});

test('un tap au centre du canvas devient un rayon de la caméra vers le centre de l\'image', () => {
  const { canvas, interaction } = createSetup();
  canvas.dispatchEvent(pointerEvent('pointerdown', { timeStamp: 0 }));
  canvas.dispatchEvent(pointerEvent('pointerup', { timeStamp: 120 }));
  assert.equal(interaction.taps.length, 1);
  const direction = interaction.taps[0];
  // Caméra tournée droit vers le sol : three.js incline lookAt d'un dix-millième de radian.
  assert.ok(Math.abs(direction.y + 1) < 1e-6, `vers le bas : (${direction.toArray()})`);
});

test('un glissé ou un pincement à deux doigts n\'est pas un tap', () => {
  const { canvas, interaction } = createSetup();
  canvas.dispatchEvent(pointerEvent('pointerdown', { clientX: 100 }));
  canvas.dispatchEvent(pointerEvent('pointerup', { clientX: 160, timeStamp: 100 }));
  canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1 }));
  canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2 }));
  canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, timeStamp: 50 }));
  canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, timeStamp: 60 }));
  assert.deepEqual(interaction.taps, []);
});

test('pendant une session AR, la saisie par pointeur se tait (c\'est la session qui transmet les touchers)', () => {
  const { canvas, interaction, state } = createSetup({ wantsHover: true });
  state.presenting = true;
  canvas.dispatchEvent(pointerEvent('pointerdown'));
  canvas.dispatchEvent(pointerEvent('pointerup', { timeStamp: 50 }));
  canvas.dispatchEvent(pointerEvent('pointermove', { pointerType: 'mouse' }));
  assert.deepEqual(interaction.taps, []);
  assert.deepEqual(interaction.hovers, []);
});

test('la souris guide l\'aperçu pendant le tracé d\'une flèche ; sortir du canvas l\'efface ; détaché, plus rien', () => {
  const { canvas, interaction, input } = createSetup({ wantsHover: true });
  canvas.dispatchEvent(pointerEvent('pointermove', { pointerType: 'mouse', clientX: 600 }));
  canvas.dispatchEvent(pointerEvent('pointermove', { pointerType: 'touch' }));
  canvas.dispatchEvent(pointerEvent('pointerleave'));
  assert.equal(interaction.hovers.length, 2);
  assert.ok(interaction.hovers[0].x > 0, 'à droite du centre');
  assert.equal(interaction.hovers[1], null);

  input.detach();
  canvas.dispatchEvent(pointerEvent('pointerdown'));
  canvas.dispatchEvent(pointerEvent('pointerup', { timeStamp: 10 }));
  assert.deepEqual(interaction.taps, []);
});
