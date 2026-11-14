/**
 * Composition d'une équipe : 11 joueurs créés par la fabrique et placés selon une formation.
 * Depuis le sprint 4, la formation peut changer en cours de route : les joueurs rejoignent alors
 * leurs nouvelles places (src/formation-transition.js).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';
import { computeTeamTargets } from './formation-transition.js';

/**
 * Crée le groupe d'une équipe et place ses joueurs selon la formation.
 * @param {{id: string, attacksPositiveX: boolean}} team description de l'équipe (config.TEAMS)
 * @param {import('./formations.js').FormationStrategy} formation stratégie de placement
 * @param {import('./players.js').PlayerFactory} playerFactory fabrique de pions
 * @returns {THREE.Group}
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Scène 3D — équipes et application des formations
 */
export function createTeam(team, formation, playerFactory) {
  const teamGroup = new THREE.Group();
  teamGroup.name = `team-${team.id}`;
  teamGroup.userData = { type: 'team', teamId: team.id, formation: formation.name };

  for (const [number, { x, z, role }] of computeTeamTargets(formation, team.attacksPositiveX)) {
    const player = playerFactory.createPlayer({ team, number, role });
    player.position.set(x, 0, z);
    teamGroup.add(player);
  }
  return teamGroup;
}

/**
 * Applique une nouvelle formation à une équipe déjà sur le terrain : chaque joueur, reconnu par
 * son numéro, prend le poste de ce numéro dans la nouvelle formation et rejoint sa place.
 * @param {THREE.Group} teamGroup groupe créé par createTeam
 * @param {{attacksPositiveX: boolean}} team description de l'équipe (config.TEAMS)
 * @param {import('./formations.js').FormationStrategy} formation nouvelle formation
 * @param {{moveTo: (object: THREE.Object3D, target: {x: number, z: number}) => void}} animator
 *   déplace les joueurs (src/formation-transition.js)
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Scène 3D — équipes et application des formations
 */
export function applyFormation(teamGroup, team, formation, animator) {
  const targets = computeTeamTargets(formation, team.attacksPositiveX);
  for (const player of teamGroup.children) {
    const target = targets.get(player.userData.number);
    if (target) {
      player.userData.role = target.role;
      animator.moveTo(player, target);
    }
  }
  teamGroup.userData.formation = formation.name;
}
