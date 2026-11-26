/**
 * Tests unitaires des pions instanciés de src/players.mjs (sprint 6) : chaque instance suit son
 * joueur, seules les poses changées sont réécrites, et rien n'est envoyé au processeur graphique
 * quand le terrain est immobile. Identité, numéro et zone de sélection restent sur le joueur.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerFactory } from '../../src/players.mjs';
import { createTeam } from '../../src/team.mjs';
import { FORMATIONS } from '../../src/formations.mjs';
import { TEAMS } from '../../src/config.mjs';
import { installFakeDocument } from './tactical-fixtures.mjs';

/**
 * Équipe rouge en 4-4-2 et ses pions instanciés.
 * @returns {{group: THREE.Group, meshes: import('../../src/players.mjs').TeamMeshes}}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Tests unitaires (src/players.mjs) — montage du test
 */
function createSetup() {
  const restore = installFakeDocument();
  try {
    const factory = new PlayerFactory();
    const group = createTeam(TEAMS.red, FORMATIONS['4-4-2'], factory);
    return { group, meshes: factory.createTeamMeshes(TEAMS.red, group.children) };
  } finally {
    restore();
  }
}

/**
 * Matrice de l'instance i d'un maillage instancié.
 * @param {THREE.InstancedMesh} mesh
 * @param {number} index
 * @returns {THREE.Matrix4}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Tests unitaires (src/players.mjs) — outil de vérification
 */
function instanceMatrix(mesh, index) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return matrix;
}

/**
 * Égalité de deux matrices aux arrondis près : les matrices d'instances sont en nombres flottants
 * sur 32 bits.
 * @param {THREE.Matrix4} a
 * @param {THREE.Matrix4} b
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Tests unitaires (src/players.mjs) — outil de vérification
 */
function sameMatrix(a, b) {
  return a.elements.every((value, index) => Math.abs(value - b.elements[index]) < 1e-6);
}

test('trois maillages instanciés par équipe (socle, flèche, corps), une instance par joueur, à sa pose', () => {
  const { group, meshes } = createSetup();
  assert.equal(meshes.meshes.length, 3);
  for (const mesh of meshes.meshes) {
    assert.equal(mesh.isInstancedMesh, true);
    assert.equal(mesh.count, 11);
    group.children.forEach((player, index) => {
      player.updateMatrix();
      assert.ok(sameMatrix(instanceMatrix(mesh, index), player.matrix), `instance ${index}`);
    });
  }
  assert.equal(meshes.group.name, 'player-meshes-red');
});

test('le joueur garde son identité, son numéro et sa zone de sélection ; le pion visible n\'est plus dans son groupe', () => {
  const { group } = createSetup();
  const player = group.children[3];
  assert.deepEqual(Object.keys(player.userData).sort(), ['number', 'post', 'role', 'teamId', 'type']);
  assert.deepEqual(player.children.map((child) => (child.isSprite ? 'numéro' : child.name)), ['numéro', 'hitbox']);
  assert.equal(player.rotation.y, Math.PI, 'les Rouges regardent vers -X');
});

test('seules les poses changées sont réécrites ; terrain immobile : aucun envoi au processeur graphique', () => {
  const { group, meshes } = createSetup();
  const versions = () => meshes.meshes.map((mesh) => mesh.instanceMatrix.version);
  const before = versions();
  assert.equal(meshes.update(), false);
  assert.deepEqual(versions(), before, 'rien n\'a bougé : pas de mise à jour');

  const seven = group.children[6];
  seven.position.x += 0.05;
  const other = instanceMatrix(meshes.meshes[2], 2);
  assert.equal(meshes.update(), true);
  assert.deepEqual(versions(), before.map((version) => version + 1));
  seven.updateMatrix();
  assert.ok(sameMatrix(instanceMatrix(meshes.meshes[2], 6), seven.matrix), 'l\'instance suit le joueur déplacé');
  assert.ok(instanceMatrix(meshes.meshes[2], 2).equals(other), 'les autres ne changent pas');
});

test('libération : les maillages quittent la scène', () => {
  const { meshes } = createSetup();
  const parent = new THREE.Group();
  parent.add(meshes.group);
  meshes.dispose();
  assert.equal(meshes.group.parent, null);
});
