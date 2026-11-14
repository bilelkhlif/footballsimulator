/**
 * Tests unitaires de src/formation-transition.js et de applyFormation (src/team.js) : places
 * cibles, courbe d'animation, déplacements image par image, et joueurs three.js réels replacés.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  computeTeamTargets, easeInOutCubic, FormationAnimator, TRANSITION_DURATION_MS,
} from '../../src/formation-transition.js';
import { applyFormation } from '../../src/team.js';
import { FORMATIONS, toPitchCoordinates } from '../../src/formations.js';
import { TEAMS } from '../../src/config.js';

/** Horloge manuelle, pour faire avancer le temps sans attendre. */
function createClock() {
  let now = 0;
  return { now: () => now, advance: (ms) => { now += ms; } };
}

/** Un objet qui a une position, comme un joueur three.js. */
function createObject(x = 0, z = 0) {
  return { position: { x, y: 0, z } };
}

test('courbe d\'animation : part de 0, passe par 0,5 au milieu, arrive à 1, sans reculer', () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.equal(easeInOutCubic(1), 1);
  let previous = 0;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const value = easeInOutCubic(t);
    assert.ok(value >= previous, `recul à t = ${t}`);
    previous = value;
  }
  assert.ok(easeInOutCubic(0.1) < 0.1, 'départ en douceur');
  assert.ok(easeInOutCubic(0.9) > 0.9, 'arrivée en douceur');
});

test('places cibles : une par numéro, les Rouges en miroir des Bleus', () => {
  const formation = FORMATIONS['4-2-3-1'];
  const blue = computeTeamTargets(formation, true);
  const red = computeTeamTargets(formation, false);
  assert.equal(blue.size, 11);
  for (const position of formation.computePositions()) {
    const expected = toPitchCoordinates(position, true);
    assert.deepEqual({ x: blue.get(position.number).x, z: blue.get(position.number).z }, expected);
    assert.equal(blue.get(position.number).role, position.role);
    assert.ok(Math.abs(red.get(position.number).x + expected.x) < 1e-12);
  }
});

test('déplacement : départ en douceur, à mi-chemin au milieu de la durée, exact à la fin', () => {
  const clock = createClock();
  const animator = new FormationAnimator({ now: clock.now });
  const player = createObject(0, 0);

  animator.moveTo(player, { x: 0.1, z: -0.2 });
  assert.equal(animator.isAnimating, true);

  clock.advance(TRANSITION_DURATION_MS / 2);
  animator.update();
  assert.ok(Math.abs(player.position.x - 0.05) < 1e-12);
  assert.ok(Math.abs(player.position.z + 0.1) < 1e-12);

  clock.advance(TRANSITION_DURATION_MS);
  animator.update();
  assert.deepEqual(player.position, { x: 0.1, y: 0, z: -0.2 }, 'hauteur inchangée, place exacte');
  assert.equal(animator.isAnimating, false);
});

test('nouvelle formation pendant une transition : le joueur repart d\'où il est, sans saut', () => {
  const clock = createClock();
  const animator = new FormationAnimator({ now: clock.now });
  const player = createObject(0, 0);

  animator.moveTo(player, { x: 0.2, z: 0 });
  clock.advance(TRANSITION_DURATION_MS / 2);
  animator.update();
  const halfway = player.position.x;

  animator.moveTo(player, { x: -0.2, z: 0 });
  animator.update();
  assert.equal(player.position.x, halfway, 'pas de saut au changement de cible');

  clock.advance(TRANSITION_DURATION_MS);
  animator.update();
  assert.equal(player.position.x, -0.2);
});

test('moins d\'animations demandées (durée nulle) : le joueur va directement à sa place', () => {
  const animator = new FormationAnimator({ duration: 0, now: () => 0 });
  const player = createObject(0.3, 0.1);

  animator.moveTo(player, { x: -0.1, z: 0.05 });

  assert.deepEqual(player.position, { x: -0.1, y: 0, z: 0.05 });
  assert.equal(animator.isAnimating, false);
});

test('applyFormation : chaque joueur three.js, reconnu par son numéro, prend son poste et sa place', () => {
  const team = TEAMS.red;
  const teamGroup = new THREE.Group();
  teamGroup.userData = { formation: '4-4-2' };
  for (let number = 1; number <= 11; number += 1) {
    const player = new THREE.Group();
    player.userData = { number, role: 'ancien poste' };
    teamGroup.add(player);
  }
  const animator = new FormationAnimator({ duration: 0 });

  applyFormation(teamGroup, team, FORMATIONS['3-5-2'], animator);

  const targets = computeTeamTargets(FORMATIONS['3-5-2'], team.attacksPositiveX);
  for (const player of teamGroup.children) {
    const target = targets.get(player.userData.number);
    assert.equal(player.position.x, target.x);
    assert.equal(player.position.z, target.z);
    assert.equal(player.userData.role, target.role);
  }
  assert.equal(teamGroup.userData.formation, '3-5-2');
});
