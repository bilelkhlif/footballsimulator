/**
 * Ballon : une petite sphère blanche (cahier, §3.2).
 */
import * as THREE from 'three';
import { BALL_RADIUS } from './config.js';

/**
 * Crée le ballon, posé sur le point central du terrain.
 * @returns {THREE.Mesh}
 */
export function createBall() {
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
  );
  ball.position.set(0, BALL_RADIUS, 0);
  ball.name = 'ball';
  ball.userData = { type: 'ball' };
  return ball;
}
