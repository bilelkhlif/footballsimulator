/**
 * Ligne de hors-jeu (loi 11 de l'IFAB), calculée sur le tableau tactique. Fonctions pures, sans
 * three.js ni DOM.
 *
 * Un attaquant est en position de hors-jeu s'il est dans la moitié adverse (ligne médiane
 * exclue) et plus près de la ligne de but adverse que le ballon et que l'avant-dernier adversaire.
 * La ligne de hors-jeu d'une équipe qui attaque est donc la plus avancée de trois limites :
 * l'avant-dernier défenseur adverse (le gardien compte comme les autres joueurs), le ballon, et
 * la ligne médiane. Un joueur à hauteur exacte de la ligne n'est pas hors-jeu.
 *
 * Le repère est celui du terrain : x le long du terrain, en mètres de maquette. Les Bleus
 * attaquent vers +X, les Rouges vers −X (config.TEAMS).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { PITCH_LENGTH, TEAMS } from './config.mjs';
import { postOfNumber } from './formations.mjs';
import { toRealMeters } from './tactical-metrics.mjs';

/** Tolérance de hauteur : à moins de 1 mm de maquette (17 cm réels), le joueur est « à hauteur ». */
export const LEVEL_TOLERANCE = 0.001;

/** Ce qui fixe la ligne : l'avant-dernier défenseur, le ballon ou la ligne médiane. */
export const OFFSIDE_LIMITS = Object.freeze({ DEFENDER: 'defender', BALL: 'ball', HALFWAY: 'halfway' });

/**
 * Ligne de hors-jeu d'une équipe qui attaque, et ses joueurs en position de hors-jeu.
 * @param {import('./tactics-board.mjs').TacticsBoard} board
 * @param {string} attackingTeamId
 * @param {Record<string, {attacksPositiveX: boolean}>} [teams]
 * @returns {{
 *   attackingTeamId: string, defendingTeamId: string, x: number, limit: string,
 *   secondLast: {number: number, post: string|null}, distanceToGoal: number,
 *   offside: Array<{number: number, post: string|null}>,
 * }} x dans le repère du terrain ; distanceToGoal en mètres réels, depuis la ligne de but défendue
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — ligne de hors-jeu (loi 11)
 */
export function computeOffside(board, attackingTeamId, teams = TEAMS) {
  const defendingTeamId = board.teamIds.find((teamId) => teamId !== attackingTeamId);
  // Profondeur dans le sens d'attaque : plus elle est grande, plus on est près du but adverse.
  const direction = teams[attackingTeamId].attacksPositiveX ? 1 : -1;
  const depth = (position) => direction * position.x;
  const players = (teamId) => board.getFormation(teamId).computePositions()
    .map(({ number }) => ({ number, position: board.getPlayerPosition(teamId, number) }));

  // Défenseurs du plus proche de leur but au plus éloigné : le deuxième est l'avant-dernier.
  const defenders = players(defendingTeamId).sort((a, b) => depth(b.position) - depth(a.position));
  const secondLast = defenders[1];
  const limits = [
    [OFFSIDE_LIMITS.DEFENDER, depth(secondLast.position)],
    [OFFSIDE_LIMITS.BALL, depth(board.getBallPosition())],
    [OFFSIDE_LIMITS.HALFWAY, 0],
  ];
  const [limit, lineDepth] = limits.reduce((best, candidate) => (candidate[1] > best[1] ? candidate : best));
  const attackingFormation = board.getFormation(attackingTeamId);
  const offside = players(attackingTeamId)
    .filter(({ position }) => depth(position) > lineDepth + LEVEL_TOLERANCE)
    .map(({ number }) => ({ number, post: postOfNumber(attackingFormation, number) }));
  return {
    attackingTeamId,
    defendingTeamId,
    x: direction * lineDepth + 0, // « + 0 » : la ligne médiane vaut 0, jamais −0
    limit,
    secondLast: { number: secondLast.number, post: postOfNumber(board.getFormation(defendingTeamId), secondLast.number) },
    distanceToGoal: toRealMeters(PITCH_LENGTH / 2 - lineDepth),
    offside,
  };
}

/**
 * Phrase pour l'entraîneur : où est la ligne, ce qui la fixe, et qui est hors-jeu.
 * @param {ReturnType<typeof computeOffside>} result
 * @param {Record<string, {label: string}>} [teams]
 * @returns {string}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — ligne de hors-jeu (loi 11)
 */
export function describeOffside(result, teams = TEAMS) {
  const attackers = teams[result.attackingTeamId].label;
  const goal = `du but des ${teams[result.defendingTeamId].label}`;
  const reason = {
    [OFFSIDE_LIMITS.DEFENDER]: `avant-dernier défenseur : n° ${result.secondLast.number}${result.secondLast.post ? ` (${result.secondLast.post})` : ''}`,
    [OFFSIDE_LIMITS.BALL]: 'fixée par le ballon',
    [OFFSIDE_LIMITS.HALFWAY]: 'ligne médiane',
  }[result.limit];
  const who = result.offside.length
    ? `hors-jeu : ${result.offside.map(({ number, post }) => `n° ${number}${post ? ` (${post})` : ''}`).join(', ')}`
    : 'aucun joueur hors-jeu';
  return `${attackers} en attaque : ligne à ${Math.round(result.distanceToGoal)} m ${goal} (${reason}) ; ${who}.`;
}
