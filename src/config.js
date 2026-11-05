/**
 * Configuration partagée de Football Simulator.
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

/**
 * Dimensions d'un pion joueur, en mètres. Elles sont exagérées par rapport à
 * l'échelle du terrain pour que les joueurs restent visibles et sélectionnables.
 */
export const PLAYER_SIZE = Object.freeze({
  radius: 0.0065,
  height: 0.028,
  hitboxRadius: 0.014, // zone de sélection élargie (cahier, §6.3), utilisée au sprint 5
  labelSize: 0.014,
});

/** Rayon du ballon, en mètres. */
export const BALL_RADIUS = 0.0042;

/**
 * Équipes : l'équipe bleue attaque vers +X, l'équipe rouge vers -X.
 * `cssColor` sert aux textures dessinées sur canvas et à l'interface.
 */
export const TEAMS = Object.freeze({
  blue: Object.freeze({ id: 'blue', label: 'Bleus', color: 0x2f55d4, cssColor: '#2f55d4', attacksPositiveX: true }),
  red: Object.freeze({ id: 'red', label: 'Rouges', color: 0xd63b2f, cssColor: '#d63b2f', attacksPositiveX: false }),
});

/** Formations affichées au démarrage : celles du scénario de démonstration (cahier, §4.1). */
export const DEFAULT_FORMATIONS = Object.freeze({ blue: '4-3-3', red: '4-4-2' });

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
