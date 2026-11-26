/**
 * Noms des équipes dans les textes de l'application : « le n° 9 des Bleus », « Formation 4-4-2
 * de Sfax », « pour l’Espérance ». Le nom vit dans le tableau tactique (TacticsBoard.setIdentity) ;
 * ce module en garde une copie, tenue à jour par l'événement identitychange (patron Observer), pour
 * les fonctions de texte qui ne connaissent pas le tableau (règles des flèches, commandes, hors-jeu).
 * Sans tableau suivi, ce sont les noms de départ (config.TEAMS) : les tests restent déterministes.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { TEAMS } from './config.mjs';

/** Noms de départ, au pluriel : « les Bleus », « des Rouges ». */
const DEFAULT_NAMES = new Map(Object.values(TEAMS).map((team) => [team.id, team.label]));

/** Nom actuel de chaque équipe. */
const names = new Map(DEFAULT_NAMES);

/**
 * Nom actuel d'une équipe.
 * @param {string} teamId
 * @returns {string}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Interface — noms des équipes dans les textes
 */
export function teamName(teamId) {
  return names.get(teamId) ?? teamId;
}

/**
 * Vrai si l'équipe porte encore son nom de départ, un pluriel (« Bleus »).
 * @param {string} teamId
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Interface — noms des équipes dans les textes
 */
function hasDefaultName(teamId) {
  return names.get(teamId) === DEFAULT_NAMES.get(teamId);
}

/**
 * Complément « de l'équipe » : « des Bleus », « de Sfax », « d’Espérance ».
 * @param {string} teamId
 * @returns {string}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Interface — noms des équipes dans les textes
 */
export function teamOf(teamId) {
  const name = teamName(teamId);
  if (hasDefaultName(teamId)) return `des ${name}`;
  return /^[aeiouyhàâäéèêëîïôöûü]/i.test(name) ? `d’${name}` : `de ${name}`;
}

/**
 * Complément « pour l'équipe » : « pour les Bleus », « pour Sfax ».
 * @param {string} teamId
 * @returns {string}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Interface — noms des équipes dans les textes
 */
export function teamFor(teamId) {
  return hasDefaultName(teamId) ? `pour les ${teamName(teamId)}` : `pour ${teamName(teamId)}`;
}

/**
 * Suit les noms du tableau tactique. À appeler juste après la création du tableau, avant les
 * autres observateurs : les textes qu'ils produisent utilisent déjà le nouveau nom.
 * @param {import('./tactics-board.mjs').TacticsBoard} board
 * @returns {() => void} arrête le suivi et rend les noms de départ
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Interface — noms des équipes dans les textes
 */
export function followTeamNames(board) {
  /** Recopie le nom de chaque équipe. */
  const update = () => {
    for (const teamId of board.teamIds) names.set(teamId, board.getIdentity(teamId).name);
  };
  update();
  const off = board.on('identitychange', update);
  return () => {
    off();
    for (const [teamId, name] of DEFAULT_NAMES) names.set(teamId, name);
  };
}
