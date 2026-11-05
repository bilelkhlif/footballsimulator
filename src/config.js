/**
 * Configuration partagée d'AR Football Tactics.
 *
 * Toutes les longueurs de la scène sont en mètres. Le terrain miniature mesure
 * environ 60 × 39 cm (cahier des charges, §1.4) : il pourra être posé tel quel
 * sur une table réelle lors des sprints AR.
 */

/** Dimensions réglementaires d'un terrain, en mètres réels. */
export const REAL_PITCH = Object.freeze({ length: 105, width: 68 });

/** Longueur du terrain miniature dans la scène, en mètres. */
export const PITCH_LENGTH = 0.6;

/** Facteur d'échelle entre le terrain réel et la maquette (environ 1/175). */
export const PITCH_SCALE = PITCH_LENGTH / REAL_PITCH.length;

/** Largeur du terrain miniature dans la scène, en mètres (environ 0,389). */
export const PITCH_WIDTH = REAL_PITCH.width * PITCH_SCALE;

/** Bande de gazon autour des lignes, en mètres réels. */
export const PITCH_RUNOFF = 4;

/** Longueur du plateau (terrain et bande de gazon), en mètres. */
export const BOARD_LENGTH = (REAL_PITCH.length + 2 * PITCH_RUNOFF) * PITCH_SCALE;

/** Largeur du plateau (terrain et bande de gazon), en mètres. */
export const BOARD_WIDTH = (REAL_PITCH.width + 2 * PITCH_RUNOFF) * PITCH_SCALE;

/** Épaisseur du plateau sous le gazon, en mètres. */
export const BOARD_THICKNESS = 0.008;

/** Couleurs de la scène hors AR et du terrain. */
export const SCENE_COLORS = Object.freeze({
  background: 0x101915,
  table: 0x17231c,
  board: 0x123f26,
  grassLight: '#2f8a4e',
  grassDark: '#287a43',
  lines: '#f3f7f2',
  goal: 0xf5f7f4,
});
