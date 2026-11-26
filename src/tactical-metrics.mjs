/**
 * Mesures tactiques d'une équipe, en mètres réels, sur un terrain de 105 × 68 m : largeur,
 * profondeur, distance entre les lignes et compacité. Fonctions pures, sans three.js ni DOM : elles
 * lisent les places du tableau tactique (repère du terrain, en mètres de maquette) et les
 * ramènent à l'échelle réelle (config.PITCH_SCALE).
 *
 * Ce que mesure un entraîneur :
 * - largeur : écart, d'une touche à l'autre, entre les deux joueurs de champ les plus excentrés ;
 * - profondeur : écart, dans le sens du jeu, entre le joueur de champ le plus bas et le plus haut ;
 * - distance entre les lignes : de la défense au milieu, et du milieu à l'attaque, chaque ligne
 *   étant à la profondeur moyenne de ses joueurs. Les lignes se lisent sur le terrain, comme le
 *   ferait l'entraîneur : un « 4-5-1 » est formé des 4 joueurs de champ les plus bas, des 5 suivants
 *   et du dernier ; au-delà de trois lignes (4-2-3-1), les lignes du milieu forment ensemble le
 *   milieu. Sans nom de disposition exploitable, les lignes viennent des postes normalisés ;
 * - compacité : surface occupée par les joueurs de champ (enveloppe convexe), en m². Un bloc bas
 *   et compact couvre moins de 1 000 m² ; une équipe étirée en possession, plus de 2 000 m².
 * Le gardien n'entre dans aucune mesure.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { PITCH_SCALE, TEAMS } from './config.mjs';
import { postOfNumber } from './formations.mjs';

/** Ligne de chaque poste normalisé ; les pistons sont comptés au milieu. */
export const POST_LINES = Object.freeze({
  DD: 'defense', DC: 'defense', DG: 'defense',
  PD: 'midfield', PG: 'midfield', MDC: 'midfield', MC: 'midfield', MD: 'midfield', MG: 'midfield', MOC: 'midfield',
  AD: 'attack', AG: 'attack', AT: 'attack',
});

/**
 * Convertit une distance de la maquette en mètres réels.
 * @param {number} value distance sur le terrain de 0,6 m
 * @returns {number} distance sur le terrain de 105 m
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — mesures tactiques en mètres réels
 */
export function toRealMeters(value) {
  return value / PITCH_SCALE;
}

/**
 * Surface de l'enveloppe convexe d'un nuage de points (chaîne monotone d'Andrew, puis formule du
 * lacet). Moins de trois points distincts : surface nulle.
 * @param {Array<{x: number, z: number}>} points
 * @returns {number} surface, dans l'unité des points au carré
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — mesures tactiques en mètres réels
 */
export function convexHullArea(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  if (sorted.length < 3) {
    return 0;
  }
  /** Produit vectoriel (o→a) × (o→b) : positif si le virage est à gauche. */
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  let twiceArea = 0;
  for (let index = 0; index < hull.length; index += 1) {
    const a = hull[index];
    const b = hull[(index + 1) % hull.length];
    twiceArea += a.x * b.z - b.x * a.z;
  }
  return Math.abs(twiceArea) / 2;
}

/**
 * Nombre de joueurs de champ de chaque ligne, lu dans le nom d'une disposition : « 4-2-3-1 »
 * donne [4, 5, 1] (défense, milieu, attaque). Null si le nom ne décrit pas 10 joueurs de champ.
 * @param {string} shapeName par exemple « 4-5-1 » ou « 5-3-2 bas »
 * @returns {[number, number, number]|null}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — mesures tactiques en mètres réels
 */
export function lineCountsOf(shapeName) {
  const counts = shapeName.match(/\d+(?:-\d+)+/)?.[0].split('-').map(Number);
  if (!counts || counts.length < 3 || counts.reduce((sum, n) => sum + n, 0) !== 10) {
    return null;
  }
  return [counts[0], counts.slice(1, -1).reduce((sum, n) => sum + n, 0), counts.at(-1)];
}

/**
 * Mesures d'un ensemble de joueurs de champ, avec le poste de chacun.
 * @param {Array<{x: number, z: number, post: string}>} players places dans le repère du terrain
 * @param {boolean} attacksPositiveX sens d'attaque, pour orienter les lignes
 * @param {[number, number, number]|null} [lineCounts] joueurs par ligne (lineCountsOf) ; sinon, les postes
 * @returns {{width: number, depth: number, defenseToMidfield: number|null, midfieldToAttack: number|null, area: number}}
 *   en mètres et en m² réels ; une distance est nulle (null) si l'une des deux lignes est vide
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — mesures tactiques en mètres réels
 */
export function measureShape(players, attacksPositiveX, lineCounts = null) {
  const outfield = players.filter(({ post }) => post !== 'GB');
  const xs = outfield.map((p) => p.x);
  const zs = outfield.map((p) => p.z);
  const direction = attacksPositiveX ? 1 : -1;
  /** Profondeur moyenne d'un groupe, dans le sens d'attaque ; null si le groupe est vide. */
  const meanDepth = (members) => (members.length ? members.reduce((sum, p) => sum + direction * p.x, 0) / members.length : null);
  let lines;
  if (lineCounts && lineCounts.reduce((sum, n) => sum + n, 0) === outfield.length) {
    // Lignes lues sur le terrain : les joueurs, du plus bas au plus haut, remplissent les lignes.
    const byDepth = [...outfield].sort((a, b) => direction * a.x - direction * b.x);
    const [defenseCount, midfieldCount] = lineCounts;
    lines = [byDepth.slice(0, defenseCount), byDepth.slice(defenseCount, defenseCount + midfieldCount),
      byDepth.slice(defenseCount + midfieldCount)];
  } else {
    lines = ['defense', 'midfield', 'attack'].map((line) => outfield.filter(({ post }) => POST_LINES[post] === line));
  }
  const [defense, midfield, attack] = lines.map(meanDepth);
  /** Écart réel entre deux lignes, ou null. */
  const gap = (a, b) => (a === null || b === null ? null : toRealMeters(b - a));
  return {
    width: toRealMeters(Math.max(...zs) - Math.min(...zs)),
    depth: toRealMeters(Math.max(...xs) - Math.min(...xs)),
    defenseToMidfield: gap(defense, midfield),
    midfieldToAttack: gap(midfield, attack),
    area: convexHullArea(outfield) / (PITCH_SCALE * PITCH_SCALE),
  };
}

/**
 * Mesures d'une équipe du tableau tactique, dans sa formation en place.
 * @param {import('./tactics-board.mjs').TacticsBoard} board
 * @param {string} teamId
 * @param {Record<string, {attacksPositiveX: boolean}>} [teams]
 * @returns {ReturnType<typeof measureShape>}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — mesures tactiques en mètres réels
 */
export function measureTeam(board, teamId, teams = TEAMS) {
  const formation = board.getFormation(teamId);
  const players = formation.computePositions().map(({ number }) => ({
    ...board.getPlayerPosition(teamId, number),
    post: postOfNumber(formation, number),
  }));
  return measureShape(players, teams[teamId].attacksPositiveX, lineCountsOf(formation.shapeName(board.getPhase(teamId))));
}
