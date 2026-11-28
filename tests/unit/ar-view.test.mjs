/**
 * Tests unitaires de src/ar-view.mjs, avec de vrais objets three.js (copie locale r187, chargée
 * d'après la carte d'import de index.html) : préparation de la scène pour l'AR, réticule, pose du
 * terrain, suivi de l'ancre et restauration de la vue 3D.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createArView } from '../../src/ar-view.mjs';
import { computePitchPlacement, computeSurfacePlacement } from '../../src/ar-placement.mjs';

/**
 * Scène minimale : fond, table, groupe du terrain, réticule et contrôles d'orbite.
 * @responsable Bilel Khlif
 * @date 2026-11-10
 * @role Tests unitaires (src/ar-view.mjs) — doublure
 */
function createScene() {
  const scene = new THREE.Scene();
  const background = new THREE.Color(0x101915);
  scene.background = background;
  const table = new THREE.Mesh();
  const pitchGroup = new THREE.Group();
  const reticle = new THREE.Mesh();
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  const controls = { enabled: true };
  let exits = 0;
  const arView = createArView({ scene, table, pitchGroup, controls, reticle, onExit: () => { exits += 1; } });
  return { scene, background, table, pitchGroup, reticle, controls, arView, exitCount: () => exits };
}

const VIEWER = { position: { x: 0, y: 1.6, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };

/** Pose d'une surface horizontale à 72 cm du sol, 90 cm devant : matrice 4 × 4 en colonnes. */
const SURFACE_TRANSFORM = { matrix: new THREE.Matrix4().makeTranslation(0, 0.72, -0.9).toArray() };

test('entrée en AR : fond transparent, table masquée, contrôles coupés, terrain en attente', () => {
  const { scene, table, pitchGroup, controls, arView } = createScene();

  arView.enter();

  assert.equal(scene.background, null);
  assert.equal(table.visible, false);
  assert.equal(controls.enabled, false);
  assert.equal(pitchGroup.visible, false, 'masqué tant qu\'il n\'est pas posé');
  assert.equal(arView.needsPlacement, true);
  assert.equal(arView.isActive, true);
});

test('réticule : affiché à la pose de la surface détectée, masqué sans surface', () => {
  const { reticle, arView } = createScene();
  arView.enter();

  arView.showReticle(SURFACE_TRANSFORM);
  assert.equal(reticle.visible, true);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(reticle.matrix).toArray(), [0, 0.72, -0.9]);

  arView.showReticle(null);
  assert.equal(reticle.visible, false);
});

test('placement devant l\'utilisateur (secours sans hit test) : là où le calcule computePitchPlacement', () => {
  const { pitchGroup, arView } = createScene();
  const expected = computePitchPlacement(VIEWER);

  arView.enter();
  arView.placeInFront(VIEWER);

  assert.deepEqual(pitchGroup.position.toArray(), [expected.position.x, expected.position.y, expected.position.z]);
  assert.equal(pitchGroup.rotation.y, expected.rotationY);
  assert.equal(pitchGroup.visible, true);
  assert.equal(arView.needsPlacement, false);
});

test('pose sur la surface : terrain visible à la position calculée, réticule masqué', () => {
  const { pitchGroup, reticle, arView } = createScene();
  const placement = computeSurfacePlacement({ x: 0.3, y: 0.72, z: -0.8 }, { x: 0, y: 1.4, z: 0 });

  arView.enter();
  arView.showReticle(SURFACE_TRANSFORM);
  arView.placeAt(placement);

  assert.deepEqual(pitchGroup.position.toArray(), [placement.position.x, placement.position.y, placement.position.z]);
  assert.ok(Math.abs(pitchGroup.rotation.y - placement.rotationY) < 1e-12);
  assert.equal(pitchGroup.visible, true);
  assert.equal(reticle.visible, false);
  assert.equal(arView.needsPlacement, false);
});

test('ancre : le terrain suit la position et l\'orientation de son ancre', () => {
  const { pitchGroup, arView } = createScene();
  arView.enter();
  arView.placeAt({ position: { x: 0, y: 0.73, z: -0.9 }, rotationY: 0 });

  const quarterTurn = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
  arView.followAnchor({ position: { x: 0.02, y: 0.731, z: -0.91 }, orientation: quarterTurn });

  assert.deepEqual(pitchGroup.position.toArray(), [0.02, 0.731, -0.91]);
  assert.ok(Math.abs(pitchGroup.rotation.y - Math.PI / 2) < 1e-6);
});

test('déplacer le terrain : il disparaît en attendant une nouvelle pose', () => {
  const { pitchGroup, arView } = createScene();
  arView.enter();
  arView.placeAt({ position: { x: 0, y: 0.73, z: -0.9 }, rotationY: 0 });

  arView.liftPitch();

  assert.equal(pitchGroup.visible, false);
  assert.equal(arView.needsPlacement, true);
});

test('sortie : la vue 3D est restaurée telle qu\'au départ, puis recadrée', () => {
  const { scene, background, table, pitchGroup, reticle, controls, arView, exitCount } = createScene();

  arView.enter();
  arView.showReticle(SURFACE_TRANSFORM);
  arView.followAnchor({ position: { x: 1, y: 0.7, z: -2 }, orientation: { x: 0, y: 0.38, z: 0, w: 0.92 } });
  arView.exit();

  assert.equal(scene.background, background, 'le même objet Color que celui de départ');
  assert.equal(table.visible, true);
  assert.equal(controls.enabled, true);
  assert.deepEqual(pitchGroup.position.toArray(), [0, 0, 0]);
  assert.deepEqual(pitchGroup.quaternion.toArray(), [0, 0, 0, 1]);
  assert.equal(pitchGroup.visible, true);
  assert.equal(reticle.visible, false);
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

test('taille en AR : échelle appliquée avant et après la pose, plateau relevé d\'autant, vue 3D rendue à l\'échelle 1', async () => {
  const { SURFACE_OFFSET } = await import('../../src/ar-placement.mjs');
  const { pitchGroup, arView } = createScene();
  arView.setScale(2 / 0.6);
  assert.equal(pitchGroup.scale.x, 1, 'hors AR, la vue 3D garde l\'échelle 1');
  arView.enter();
  assert.ok(Math.abs(pitchGroup.scale.x - 2 / 0.6) < 1e-12, 'choisie avant l\'entrée, appliquée à l\'entrée');
  const placement = computeSurfacePlacement({ x: 0, y: 0, z: -1.5 }, VIEWER.position);
  arView.placeAt(placement);
  assert.ok(Math.abs(pitchGroup.position.y - (placement.position.y + (2 / 0.6 - 1) * SURFACE_OFFSET)) < 1e-12, 'le plateau agrandi repose sur le sol');
  arView.setScale(1);
  assert.equal(pitchGroup.scale.x, 1);
  assert.ok(Math.abs(pitchGroup.position.y - placement.position.y) < 1e-12, 'après la pose, retour sur la table');
  arView.followAnchor({ position: { x: 0.1, y: 0.7, z: -0.8 }, orientation: { x: 0, y: 0, z: 0, w: 1 } });
  arView.setScale(1 / 0.6);
  assert.ok(Math.abs(pitchGroup.position.y - (0.7 + (1 / 0.6 - 1) * SURFACE_OFFSET)) < 1e-12, 'l\'ancre suivie garde le relèvement');
  arView.exit();
  assert.equal(pitchGroup.scale.x, 1);
  assert.equal(arView.scale, 1 / 0.6, 'le choix est gardé pour la session suivante');
  assert.throws(() => arView.setScale(0), RangeError);
});

test('rotation du terrain posé : ajoutée à la pose et à l\'ancre, sans déplacer le terrain ; nouvelle pose face à l\'utilisateur', () => {
  const { pitchGroup, arView } = createScene();
  arView.enter();
  assert.equal(arView.rotateBy(0.3), false, 'pas encore posé : rien ne tourne');
  const placement = computeSurfacePlacement({ x: 0, y: 0.72, z: -0.9 }, VIEWER.position);
  arView.placeAt(placement);
  const before = pitchGroup.position.clone();
  assert.equal(arView.rotateBy(Math.PI / 12), true);
  const euler = new THREE.Euler().setFromQuaternion(pitchGroup.quaternion, 'YXZ');
  assert.ok(Math.abs(euler.y - (placement.rotationY + Math.PI / 12)) < 1e-9);
  assert.ok(Math.abs(euler.x) < 1e-12 && Math.abs(euler.z) < 1e-12, 'le terrain reste à plat');
  assert.ok(pitchGroup.position.equals(before), 'il tourne sur place');
  // L'ancre recale le terrain : la rotation ajoutée est gardée.
  const anchorYaw = 0.4;
  arView.followAnchor({ position: { x: 0.2, y: 0.72, z: -1 }, orientation: { x: 0, y: Math.sin(anchorYaw / 2), z: 0, w: Math.cos(anchorYaw / 2) } });
  const anchored = new THREE.Euler().setFromQuaternion(pitchGroup.quaternion, 'YXZ');
  assert.ok(Math.abs(anchored.y - (anchorYaw + Math.PI / 12)) < 1e-9);
  // Ancre penchée : la rotation se fait autour de l'axe du terrain, sans le décoller de son plan.
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0, 0));
  arView.followAnchor({ position: { x: 0, y: 0.7, z: -1 }, orientation: { x: tilt.x, y: tilt.y, z: tilt.z, w: tilt.w } });
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(pitchGroup.quaternion);
  const anchorUp = new THREE.Vector3(0, 1, 0).applyQuaternion(tilt);
  assert.ok(up.distanceTo(anchorUp) < 1e-9, 'la normale du terrain reste celle de l\'ancre');
  arView.liftPitch();
  arView.placeAt(placement);
  assert.equal(arView.yaw, 0, 'nouvelle pose : face à l\'utilisateur');
  arView.exit();
  assert.equal(pitchGroup.quaternion.w, 1);
});
