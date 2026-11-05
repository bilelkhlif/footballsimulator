/**
 * Composition d'une équipe : 11 joueurs créés par la fabrique et placés selon une formation.
 */
import * as THREE from 'three';
import { toPitchCoordinates } from './formations.js';

/**
 * Crée le groupe d'une équipe et place ses joueurs selon la formation.
 * @param {{id: string, attacksPositiveX: boolean}} team description de l'équipe (config.TEAMS)
 * @param {import('./formations.js').FormationStrategy} formation stratégie de placement
 * @param {import('./players.js').PlayerFactory} playerFactory fabrique de pions
 * @returns {THREE.Group}
 */
export function createTeam(team, formation, playerFactory) {
  const teamGroup = new THREE.Group();
  teamGroup.name = `team-${team.id}`;
  teamGroup.userData = { type: 'team', teamId: team.id, formation: formation.name };

  for (const position of formation.computePositions()) {
    const player = playerFactory.createPlayer({ team, number: position.number, role: position.role });
    const { x, z } = toPitchCoordinates(position, team.attacksPositiveX);
    player.position.set(x, 0, z);
    teamGroup.add(player);
  }
  return teamGroup;
}
