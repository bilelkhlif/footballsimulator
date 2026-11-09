/**
 * Tests unitaires de src/ar-view.js, avec de vrais objets three.js (copie locale r186) :
 * préparation de la scène pour l'AR, placement du terrain et restauration de la vue 3D.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../src/vendor/three/build/three.module.js';
import { createArView } from '../../src/ar-view.js';
import { computePitchPlacement } from '../../src/ar-placement.js';

/** Scène minimale : fond, table, groupe du terrain et contrôles d'orbite. */
function createScene() {
  const scene = new THREE.Scene();
  const background = new THREE.Color(0x101915);
  scene.background = background;
  const table = new THREE.Mesh();
  const pitchGroup = new THREE.Group();
  const controls = { enabled: true };
  let exits = 0;
  const arView = createArView({ scene, table, pitchGroup, controls, onExit: () => { exits += 1; } });
  return { scene, background, table, pitchGroup, controls, arView, exitCount: () => exits };
}

const VIEWER = { position: { x: 0, y: 1.6, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };

test('entrée en AR : fond transparent, table masquée, contrôles coupés, terrain en attente', () => {
  const { scene, table, pitchGroup, controls, arView } = createScene();

  arView.enter();

  assert.equal(scene.background, null);
  assert.equal(table.visible, false);
  assert.equal(controls.enabled, false);
  assert.equal(pitchGroup.visible, false, 'masqué tant qu\'il n\'est pas placé');
  assert.equal(arView.needsPlacement, true);
  assert.equal(arView.isActive, true);
});

test('placement : le terrain apparaît là où le calcule computePitchPlacement', () => {
  const { pitchGroup, arView } = createScene();
  const expected = computePitchPlacement(VIEWER);

  arView.enter();
  arView.placeInFront(VIEWER);

  assert.deepEqual(pitchGroup.position.toArray(), [expected.position.x, expected.position.y, expected.position.z]);
  assert.equal(pitchGroup.rotation.y, expected.rotationY);
  assert.equal(pitchGroup.visible, true);
  assert.equal(arView.needsPlacement, false);
});

test('sortie : la vue 3D est restaurée telle qu\'au départ, puis recadrée', () => {
  const { scene, background, table, pitchGroup, controls, arView, exitCount } = createScene();

  arView.enter();
  arView.placeInFront({ position: { x: 1, y: 1.5, z: -2 }, orientation: { x: 0, y: 0.38, z: 0, w: 0.92 } });
  arView.exit();

  assert.equal(scene.background, background, 'le même objet Color que celui de départ');
  assert.equal(table.visible, true);
  assert.equal(controls.enabled, true);
  assert.deepEqual(pitchGroup.position.toArray(), [0, 0, 0]);
  assert.equal(pitchGroup.rotation.y, 0);
  assert.equal(pitchGroup.visible, true);
  assert.equal(arView.isActive, false);
  assert.equal(arView.needsPlacement, false);
  assert.equal(exitCount(), 1);
});

test('appels en double : une deuxième entrée ne perd pas le fond, une sortie sans entrée ne fait rien', () => {
  const { scene, background, arView, exitCount } = createScene();

  arView.exit();
  assert.equal(exitCount(), 0);
  assert.equal(scene.background, background);

  arView.enter();
  arView.enter();
  arView.exit();
  assert.equal(scene.background, background);
  assert.equal(exitCount(), 1);
});
