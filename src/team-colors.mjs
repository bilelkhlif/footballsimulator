/**
 * Couleurs de maillot et contraste pour les daltoniens. Fonctions pures, sans three.js ni DOM.
 *
 * Les maillots se choisissent dans une palette fixe (KIT_PALETTE). Deux maillots, ou un maillot et
 * le gazon, doivent rester distincts pour tout le monde : la différence de couleur est mesurée dans
 * l'espace CIELAB (ΔE*76) en vision normale et sous les trois daltonismes complets (protanopie,
 * deutéranopie, tritanopie), simulés par les matrices de Machado, Oliveira et Fernandes (2009),
 * appliquées en RGB linéaire. Le cas d'école est refusé : rouge contre vert, que le deutéranope
 * confond.
 *
 * Le gardien porte un maillot distinct : la couleur de la palette la plus éloignée, dans la pire
 * des quatre visions, des deux maillots de champ et du gazon.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { SCENE_COLORS } from './config.mjs';

/**
 * Palette des maillots : libellé, couleur du tissu, et couleur d'interface (pastilles, traits),
 * éclaircie quand le tissu est trop sombre pour l'interface sombre.
 */
export const KIT_PALETTE = Object.freeze({
  bleu: Object.freeze({ label: 'Bleu', hex: 0x2f55d4, ui: '#7795ff' }),
  rouge: Object.freeze({ label: 'Rouge', hex: 0xd63b2f, ui: '#ff968a' }),
  blanc: Object.freeze({ label: 'Blanc', hex: 0xf2f2ee, ui: '#f2f2ee' }),
  noir: Object.freeze({ label: 'Noir', hex: 0x1c1c1f, ui: '#b8bcc4' }),
  jaune: Object.freeze({ label: 'Jaune', hex: 0xf2c418, ui: '#f2c418' }),
  orange: Object.freeze({ label: 'Orange', hex: 0xf47a1f, ui: '#ffad6b' }),
  violet: Object.freeze({ label: 'Violet', hex: 0x7b3fd4, ui: '#b896ff' }),
  ciel: Object.freeze({ label: 'Bleu ciel', hex: 0x5bc2e7, ui: '#8fd6f0' }),
  bordeaux: Object.freeze({ label: 'Bordeaux', hex: 0x7d1f3b, ui: '#d6879e' }),
  rose: Object.freeze({ label: 'Rose', hex: 0xe8559a, ui: '#ff9ac6' }),
  vert: Object.freeze({ label: 'Vert', hex: 0x1f9d55, ui: '#6fd49a' }),
});

/** Visions simulées : normale et les trois daltonismes complets. */
export const VISIONS = Object.freeze(['normale', 'protanopie', 'deutéranopie', 'tritanopie']);

/** Écart minimal entre deux maillots (ΔE*76), dans chaque vision : nettement distincts. */
export const MIN_KIT_DELTA_E = 20;

/**
 * Écart minimal entre un maillot et le gazon, dans chaque vision. Plus bas qu'entre deux maillots :
 * chaque pion porte aussi un disque blanc numéroté, lisible sur l'herbe. Seul un maillot qui se fond
 * dans le gazon est refusé (le vert, à 6,7 en deutéranopie) ; le rouge, que le protanope voit olive
 * sombre, reste permis (12,7).
 */
export const MIN_PITCH_DELTA_E = 10;

/** Matrices de Machado et al. (2009), sévérité 1, en RGB linéaire. */
const CVD_MATRICES = Object.freeze({
  protanopie: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutéranopie: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopie: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
});

/**
 * Composantes RGB linéaires (0 à 1) d'une couleur sRGB, donnée en entier (0xRRGGBB) ou en « #rrggbb ».
 * @param {number|string} color
 * @returns {[number, number, number]}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — couleurs de maillot et daltonisme
 */
export function toLinearRgb(color) {
  const value = typeof color === 'string' ? Number.parseInt(color.replace('#', ''), 16) : color;
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
}

/**
 * Couleur vue par une personne atteinte d'un daltonisme complet (simulation de Machado et al.).
 * @param {[number, number, number]} rgb RGB linéaire
 * @param {string} vision une valeur de VISIONS
 * @returns {[number, number, number]} RGB linéaire, borné à [0, 1]
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — couleurs de maillot et daltonisme
 */
export function simulateVision(rgb, vision) {
  const m = CVD_MATRICES[vision];
  if (!m) return rgb;
  const [r, g, b] = rgb;
  return [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b]
    .map((c) => Math.min(1, Math.max(0, c)));
}

/**
 * Coordonnées CIELAB (illuminant D65) d'une couleur en RGB linéaire.
 * @param {[number, number, number]} rgb
 * @returns {[number, number, number]} L*, a*, b*
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — couleurs de maillot et daltonisme
 */
export function toLab([r, g, b]) {
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  /** Fonction de compression de CIELAB. */
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * Plus petite différence de couleur (ΔE*76) entre deux couleurs, sur les quatre visions.
 * @param {number|string} a
 * @param {number|string} b
 * @returns {{deltaE: number, vision: string}} la pire vision et son écart
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — couleurs de maillot et daltonisme
 */
export function worstDeltaE(a, b) {
  let worst = { deltaE: Number.POSITIVE_INFINITY, vision: VISIONS[0] };
  for (const vision of VISIONS) {
    const [l1, a1, b1] = toLab(simulateVision(toLinearRgb(a), vision));
    const [l2, a2, b2] = toLab(simulateVision(toLinearRgb(b), vision));
    const deltaE = Math.hypot(l1 - l2, a1 - a2, b1 - b2);
    if (deltaE < worst.deltaE) worst = { deltaE, vision };
  }
  return worst;
}

/**
 * Vérifie qu'un maillot se distingue du maillot adverse et du gazon, pour tout le monde.
 * @param {string} kit clé de KIT_PALETTE
 * @param {string} opponentKit clé de KIT_PALETTE
 * @returns {{ok: true}|{ok: false, against: 'opponent'|'pitch', vision: string, deltaE: number, message: string}}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — couleurs de maillot et daltonisme
 */
export function checkKitContrast(kit, opponentKit) {
  const color = KIT_PALETTE[kit]?.hex;
  if (color === undefined || KIT_PALETTE[opponentKit] === undefined) {
    throw new RangeError(`Maillot inconnu : ${color === undefined ? kit : opponentKit}`);
  }
  const pitch = worstDeltaE(color, SCENE_COLORS.grassLight);
  if (pitch.deltaE < MIN_PITCH_DELTA_E) {
    return { ok: false, against: 'pitch', ...pitch, message: `Maillot ${KIT_PALETTE[kit].label.toLowerCase()} trop proche du gazon (${pitch.vision}) : choisissez une autre couleur.` };
  }
  const opponent = worstDeltaE(color, KIT_PALETTE[opponentKit].hex);
  if (opponent.deltaE < MIN_KIT_DELTA_E) {
    return {
      ok: false, against: 'opponent', ...opponent,
      message: `Maillots trop proches pour une personne en ${opponent.vision} : choisissez une couleur plus distincte de l’adversaire.`,
    };
  }
  return { ok: true };
}

/**
 * Maillot du gardien : la couleur de la palette la plus éloignée, dans la pire vision, des deux
 * maillots de champ et du gazon, hors des couleurs exclues (le maillot de l'autre gardien).
 * @param {string} kit maillot de son équipe
 * @param {string} opponentKit maillot adverse
 * @param {string[]} [exclude] couleurs déjà prises
 * @returns {string} clé de KIT_PALETTE
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — couleurs de maillot et daltonisme
 */
export function goalkeeperKit(kit, opponentKit, exclude = []) {
  let best = null;
  let bestScore = -1;
  for (const [key, { hex }] of Object.entries(KIT_PALETTE)) {
    if (key === kit || key === opponentKit || exclude.includes(key)) continue;
    const score = Math.min(
      worstDeltaE(hex, KIT_PALETTE[kit].hex).deltaE,
      worstDeltaE(hex, KIT_PALETTE[opponentKit].hex).deltaE,
      worstDeltaE(hex, SCENE_COLORS.grassLight).deltaE,
    );
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}
