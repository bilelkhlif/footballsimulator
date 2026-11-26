/**
 * Tests unitaires de src/pointer-input.mjs (sprint 5) : un tap devient un rayon depuis la caméra, un
 * glissé ou un pincement restent aux contrôles d'orbite, la souris guide l'aperçu, la saisie se
 * tait pendant une session AR, et le clic synthétisé après un tap au doigt est supprimé.
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

test('visée au doigt : aperçu sous le doigt dès l\'appui, qui suit le glissé ; le relâchement valide au point final', () => {
  const { canvas, interaction, input } = createSetup({ wantsHover: true });
  canvas.dispatchEvent(pointerEvent('pointerdown', { clientX: 200, timeStamp: 0 }));
  assert.equal(input.aiming, true);
  assert.equal(interaction.hovers.length, 1, 'aperçu dès l\'appui');
  canvas.dispatchEvent(pointerEvent('pointermove', { clientX: 650, timeStamp: 400 }));
  // Relâché loin et longtemps après l'appui : ce n'est pas un tap, mais c'est une visée.
  canvas.dispatchEvent(pointerEvent('pointerup', { clientX: 650, timeStamp: 1500 }));
  assert.equal(interaction.taps.length, 1);
  assert.ok(interaction.taps[0].x > 0, 'validé là où le doigt a fini, à droite du centre');
  assert.equal(interaction.hovers.at(-1), null, 'aperçu effacé ensuite');
  assert.equal(input.aiming, false);
});

test('visée au doigt interrompue par un second doigt (pincer) : rien n\'est validé ; souris : pas de visée', () => {
  const { canvas, interaction, input } = createSetup({ wantsHover: true });
  canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1 }));
  canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, clientX: 500 }));
  assert.equal(input.aiming, false);
  assert.equal(interaction.hovers.at(-1), null);
  canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, timeStamp: 900 }));
  canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, timeStamp: 950 }));
  assert.deepEqual(interaction.taps, []);

  canvas.dispatchEvent(pointerEvent('pointerdown', { pointerType: 'mouse', pointerId: 3, timeStamp: 1000 }));
  assert.equal(input.aiming, false, 'la souris garde le survol et le clic');
  canvas.dispatchEvent(pointerEvent('pointerup', { pointerType: 'mouse', pointerId: 3, timeStamp: 1100 }));
  assert.equal(interaction.taps.length, 1);
});

test('visée au doigt seulement quand une destination est attendue : sinon un glissé reste à la vue', () => {
  const { canvas, interaction, input } = createSetup({ wantsHover: false });
  canvas.dispatchEvent(pointerEvent('pointerdown', { clientX: 100 }));
  assert.equal(input.aiming, false);
  canvas.dispatchEvent(pointerEvent('pointerup', { clientX: 300, timeStamp: 200 }));
  assert.deepEqual(interaction.taps, []);
  assert.deepEqual(interaction.hovers, []);
});

/**
 * Fin de toucher annulable, comme celle que le navigateur envoie avant de synthétiser un clic.
 * @returns {Event}
 * @responsable Bilel Khlif
 * @date 2026-11-26
 * @role Tests unitaires (src/pointer-input.mjs) — doublure
 */
function touchEnd() {
  return new Event('touchend', { cancelable: true });
}

test('clic fantôme : la fin d\'un tap au doigt traité est annulée, pas celle d\'un glissé, d\'une souris ou d\'une saisie détachée', () => {
  const { canvas, interaction, input } = createSetup();
  canvas.dispatchEvent(pointerEvent('pointerdown', { timeStamp: 0 }));
  canvas.dispatchEvent(pointerEvent('pointerup', { timeStamp: 120 }));
  const afterTap = touchEnd();
  canvas.dispatchEvent(afterTap);
  assert.equal(interaction.taps.length, 1);
  assert.equal(afterTap.defaultPrevented, true, 'le clic synthétisé après le tap est supprimé');
  const again = touchEnd();
  canvas.dispatchEvent(again);
  assert.equal(again.defaultPrevented, false, 'une seule fin de toucher annulée par tap');

  canvas.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, timeStamp: 200 }));
  canvas.dispatchEvent(pointerEvent('pointerup', { clientX: 160, timeStamp: 300 }));
  const afterDrag = touchEnd();
  canvas.dispatchEvent(afterDrag);
  assert.equal(afterDrag.defaultPrevented, false, 'un glissé n\'est pas un tap : rien n\'est annulé');

  canvas.dispatchEvent(pointerEvent('pointerdown', { pointerType: 'mouse', timeStamp: 400 }));
  canvas.dispatchEvent(pointerEvent('pointerup', { pointerType: 'mouse', timeStamp: 450 }));
  const afterMouse = touchEnd();
  canvas.dispatchEvent(afterMouse);
  assert.equal(interaction.taps.length, 2);
  assert.equal(afterMouse.defaultPrevented, false, 'un clic de souris garde son comportement');

  canvas.dispatchEvent(pointerEvent('pointerdown', { timeStamp: 500 }));
  canvas.dispatchEvent(pointerEvent('pointerup', { timeStamp: 550 }));
  input.detach();
  const detached = touchEnd();
  canvas.dispatchEvent(detached);
  assert.equal(detached.defaultPrevented, false, 'détachée, la saisie n\'annule plus rien');
});

test('clic fantôme : une visée au doigt validée au relâchement annule aussi la fin du toucher', () => {
  const { canvas, interaction } = createSetup({ wantsHover: true });
  canvas.dispatchEvent(pointerEvent('pointerdown', { clientX: 200, timeStamp: 0 }));
  canvas.dispatchEvent(pointerEvent('pointerup', { clientX: 650, timeStamp: 1500 }));
  const end = touchEnd();
  canvas.dispatchEvent(end);
  assert.equal(interaction.taps.length, 1);
  assert.equal(end.defaultPrevented, true);
});
