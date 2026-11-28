/**
 * Zones de lecture du terrain (phase 6) : tiers, cinq couloirs, demi-espaces et zone 14, en mètres
 * réels sur un terrain de 105 × 68 m, puis à l'échelle de la maquette (PITCH_SCALE).
 *
 * Repère du terrain (src/tactics-board.mjs) : x le long du terrain, de -52,5 à +52,5 m, z en
 * largeur, de -34 à +34 m, origine au point central. Les Bleus attaquent vers +x.
 *
 * - Tiers : le terrain coupé en trois bandes de 35 m dans sa longueur (lignes à x = ±17,5 m) :
 *   tiers défensif, tiers central (le milieu), tiers offensif.
 * - Cinq couloirs (jeu de position) : les limites prolongent les côtés de la surface de but
 *   (z = ±9,16 m, demi-largeur de 18,32 m) et de la surface de réparation (z = ±20,16 m,
 *   demi-largeur de 40,32 m) : deux couloirs latéraux, deux demi-espaces, un couloir central.
 * - Demi-espaces : les deux couloirs entre le couloir central et les couloirs latéraux, sur toute
 *   la longueur : la zone de jeu entre les lignes, entre l'arrière latéral et le défenseur central.
 * - Zone 14 : case centrale de la cinquième bande sur six (grille de 18 zones de 17,5 × 22,67 m,
 *   numérotées depuis son propre but) : devant la surface adverse, de 17,5 à 35 m après la ligne
 *   médiane, sur 22,67 m de large. Une par équipe, devant le but qu'elle attaque.
 *
 * Module sans three.js ni document : la couche 3D (src/pitch-zones-layer.mjs) et la description
 * des zones surlignées s'en servent.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { PITCH_SCALE, REAL_PITCH } from './config.mjs';

/** Demi-longueur et demi-largeur du terrain réel, en mètres. */
const HALF_LENGTH = REAL_PITCH.length / 2;
const HALF_WIDTH = REAL_PITCH.width / 2;

/** Lignes des tiers, en mètres réels le long du terrain. */
export const THIRD_LINES = Object.freeze([-REAL_PITCH.length / 6, REAL_PITCH.length / 6]);

/** Demi-largeur de la surface de but (18,32 m) et de la surface de réparation (40,32 m), en mètres réels. */
export const GOAL_AREA_HALF_WIDTH = 18.32 / 2;
export const PENALTY_AREA_HALF_WIDTH = 40.32 / 2;

/** Limites des cinq couloirs, en mètres réels en largeur, de -z à +z. */
export const LANE_LINES = Object.freeze([-PENALTY_AREA_HALF_WIDTH, -GOAL_AREA_HALF_WIDTH, GOAL_AREA_HALF_WIDTH, PENALTY_AREA_HALF_WIDTH]);

/** Grille des 18 zones : six bandes en longueur, trois couloirs en largeur. */
export const GRID_BANDS = 6;
export const GRID_LANES = 3;

/** Calques proposés, dans l'ordre des boutons. */
export const PITCH_LAYERS = Object.freeze({ THIRDS: 'thirds', LANES: 'lanes', HALF_SPACES: 'half-spaces', ZONE_14: 'zone-14' });

/** Libellés des calques, pour l'interface. */
export const PITCH_LAYER_LABELS = Object.freeze({
  [PITCH_LAYERS.THIRDS]: 'Tiers',
  [PITCH_LAYERS.LANES]: 'Cinq couloirs',
  [PITCH_LAYERS.HALF_SPACES]: 'Demi-espaces',
  [PITCH_LAYERS.ZONE_14]: 'Zone 14',
});

/**
 * Rectangle réel ramené à la maquette.
 * @param {{x1: number, z1: number, x2: number, z2: number}} rect en mètres réels
 * @returns {{x1: number, z1: number, x2: number, z2: number}} en mètres de la maquette
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Logique métier — zones de lecture du terrain
 */
export function toModel({ x1, z1, x2, z2 }) {
  return { x1: x1 * PITCH_SCALE, z1: z1 * PITCH_SCALE, x2: x2 * PITCH_SCALE, z2: z2 * PITCH_SCALE };
}

/**
 * Lignes des tiers : deux bandes fines en travers du terrain, en mètres réels.
 * @param {number} width largeur d'un trait, en mètres réels
 * @returns {Array<{x1: number, z1: number, x2: number, z2: number}>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Logique métier — zones de lecture du terrain
 */
export function thirdLines(width) {
  return THIRD_LINES.map((x) => ({ x1: x - width / 2, z1: -HALF_WIDTH, x2: x + width / 2, z2: HALF_WIDTH }));
}

/**
 * Limites des cinq couloirs : quatre traits sur toute la longueur, en mètres réels.
 * @param {number} width largeur d'un trait, en mètres réels
 * @returns {Array<{x1: number, z1: number, x2: number, z2: number}>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Logique métier — zones de lecture du terrain
 */
export function laneLines(width) {
  return LANE_LINES.map((z) => ({ x1: -HALF_LENGTH, z1: z - width / 2, x2: HALF_LENGTH, z2: z + width / 2 }));
}

/**
 * Les deux demi-espaces, sur toute la longueur, en mètres réels.
 * @returns {Array<{x1: number, z1: number, x2: number, z2: number}>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Logique métier — zones de lecture du terrain
 */
export function halfSpaces() {
  return [
    { x1: -HALF_LENGTH, z1: -PENALTY_AREA_HALF_WIDTH, x2: HALF_LENGTH, z2: -GOAL_AREA_HALF_WIDTH },
    { x1: -HALF_LENGTH, z1: GOAL_AREA_HALF_WIDTH, x2: HALF_LENGTH, z2: PENALTY_AREA_HALF_WIDTH },
  ];
}

/**
 * Zone 14 d'une équipe, devant le but qu'elle attaque, en mètres réels.
 * @param {boolean} attacksPositiveX sens d'attaque de l'équipe (config.TEAMS)
 * @returns {{x1: number, z1: number, x2: number, z2: number}}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Logique métier — zones de lecture du terrain
 */
export function zone14(attacksPositiveX) {
  const band = REAL_PITCH.length / GRID_BANDS;
  const halfLane = REAL_PITCH.width / GRID_LANES / 2;
  // Cinquième bande depuis son propre but : de 4 à 5 bandes après sa ligne de but.
  const near = -HALF_LENGTH + 4 * band;
  const far = -HALF_LENGTH + 5 * band;
  return attacksPositiveX
    ? { x1: near, z1: -halfLane, x2: far, z2: halfLane }
    : { x1: -far, z1: -halfLane, x2: -near, z2: halfLane };
}

/**
 * Tiers et couloir d'un point de la maquette, en clair : « tiers central, demi-espace ». Le tiers
 * est lu dans le sens d'attaque des Bleus (vers +x).
 * @param {{x: number, z: number}} point en mètres de la maquette
 * @returns {{third: string, lane: string}}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Logique métier — zones de lecture du terrain
 */
export function describePitchArea({ x, z }) {
  const realX = x / PITCH_SCALE;
  const realZ = Math.abs(z / PITCH_SCALE);
  let third = 'tiers central';
  if (realX < THIRD_LINES[0]) third = 'tiers défensif des Bleus';
  else if (realX > THIRD_LINES[1]) third = 'tiers offensif des Bleus';
  let lane = 'couloir central';
  if (realZ > PENALTY_AREA_HALF_WIDTH) lane = 'couloir latéral';
  else if (realZ > GOAL_AREA_HALF_WIDTH) lane = 'demi-espace';
  return { third, lane };
}
