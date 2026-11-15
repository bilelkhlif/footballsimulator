/**
 * Ballon : une petite sphère blanche (cahier, §3.2).
 * Depuis le sprint 5, il porte une zone de sélection invisible, plus large que lui, que le
 * raycasting vise pour le sélectionner (BF6).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';
import { BALL_HITBOX_RADIUS, BALL_RADIUS } from './config.js';

/**
 * Crée le ballon, posé sur le point central du terrain, avec sa zone de sélection (« hitbox »).
 * @returns {THREE.Mesh}
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Scène 3D — ballon
 */
export function createBall() {
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
  );
  ball.position.set(0, BALL_RADIUS, 0);
  ball.name = 'ball';
  ball.userData = { type: 'ball' };

  // Zone de sélection invisible : un ballon de 8 mm serait trop petit sous le doigt (cahier, §6.3).
  const hitbox = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_HITBOX_RADIUS, 12, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.name = 'hitbox';
  ball.add(hitbox);
  return ball;
}
