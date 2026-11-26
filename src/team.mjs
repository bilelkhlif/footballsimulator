/**
 * Composition d'une équipe : 11 joueurs créés par la fabrique et placés selon une formation.
 * Depuis le sprint 4, la formation peut changer en cours de route : les joueurs rejoignent alors
 * leurs nouvelles places (src/formation-transition.mjs).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';
import { computeTeamTargets } from './formation-transition.mjs';

/**
 * Crée le groupe d'une équipe et place ses joueurs selon la formation.
 * @param {{id: string, attacksPositiveX: boolean}} team description de l'équipe (config.TEAMS)
 * @param {import('./formations.mjs').FormationStrategy} formation stratégie de placement
 * @param {import('./players.mjs').PlayerFactory} playerFactory fabrique de pions
 * @returns {THREE.Group}
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Scène 3D — équipes et application des formations
 */
export function createTeam(team, formation, playerFactory) {
  const teamGroup = new THREE.Group();
  teamGroup.name = `team-${team.id}`;
  teamGroup.userData = { type: 'team', teamId: team.id, formation: formation.name };

  for (const [number, { x, z, role, post }] of computeTeamTargets(formation, team.attacksPositiveX)) {
    const player = playerFactory.createPlayer({ team, number, role, post });
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
 * @param {import('./formations.mjs').FormationStrategy} formation nouvelle formation
 * @param {{moveTo: (object: THREE.Object3D, target: {x: number, z: number}) => void}} animator
 *   déplace les joueurs (src/formation-transition.mjs)
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Scène 3D — équipes et application des formations
 */
export function applyFormation(teamGroup, team, formation, animator) {
  const targets = assignFormationRoles(teamGroup, team, formation);
  for (const player of teamGroup.children) {
    const target = targets.get(player.userData.number);
    if (target) {
      animator.moveTo(player, target);
    }
  }
}

/**
 * Donne à chaque joueur, reconnu par son numéro, le poste de ce numéro dans une formation, sans le
 * déplacer. Depuis le sprint 5, les places viennent du tableau tactique (src/tactical-view.mjs) : un
 * joueur déplacé à la main garde sa place, mais prend le poste de la formation.
 * @param {THREE.Group} teamGroup groupe créé par createTeam
 * @param {{attacksPositiveX: boolean}} team description de l'équipe (config.TEAMS)
 * @param {import('./formations.mjs').FormationStrategy} formation
 * @returns {Map<number, {x: number, z: number, role: string}>} places et postes de la formation
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Scène 3D — équipes et application des formations
 */
export function assignFormationRoles(teamGroup, team, formation) {
  const targets = computeTeamTargets(formation, team.attacksPositiveX);
  for (const player of teamGroup.children) {
    const target = targets.get(player.userData.number);
    if (target) {
      player.userData.role = target.role;
      player.userData.post = target.post;
    }
  }
  teamGroup.userData.formation = formation.name;
  return targets;
}
