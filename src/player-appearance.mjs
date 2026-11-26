/**
 * Apparence d'un joueur (phase 5) : coupe de cheveux et couleur des cheveux, choisies joueur par
 * joueur dans « Personnaliser le joueur ».
 *
 * Une apparence est une donnée simple, rangée dans le tableau tactique sous la clé du joueur
 * (« blue:9 », équipe et numéro, qui ne changent jamais) : elle suit donc le joueur quand il se
 * déplace ou change de formation, et passe par l'instantané du tableau dans la sauvegarde
 * automatique, les tactiques enregistrées et les fichiers JSON. Un joueur jamais personnalisé n'a
 * aucune entrée : il garde l'apparence par défaut, et une tactique plus ancienne s'ouvre telle
 * quelle.
 *
 * Ce module ne dépend ni de three.js ni du document : il est partagé par le tableau, la
 * persistance, la scène et l'interface.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/** Les quatre coupes, dans l'ordre du panneau. */
export const HAIR_STYLES = Object.freeze([
  Object.freeze({ id: 'classic', label: 'Coupe courte classique' }),
  Object.freeze({ id: 'crew', label: 'Coupe en brosse' }),
  Object.freeze({ id: 'curly', label: 'Cheveux bouclés' }),
  Object.freeze({ id: 'mohawk', label: 'Crête (iroquoise)' }),
]);

/** Identifiants des coupes. */
export const HAIR_STYLE_IDS = Object.freeze(HAIR_STYLES.map(({ id }) => id));

/** Apparence d'un joueur jamais personnalisé : coupe courte, cheveux châtain foncé. */
export const DEFAULT_APPEARANCE = Object.freeze({ hair: 'classic', color: '#2a1c14' });

/**
 * Vrai si la valeur est une couleur CSS « #rrggbb », la forme que donne un sélecteur de couleur.
 * @param {unknown} color
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Logique métier — apparence des joueurs
 */
export function isHairColor(color) {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
}

/**
 * Vrai si la valeur est une apparence complète et valide : une des quatre coupes, une couleur
 * « #rrggbb », et rien d'autre.
 * @param {unknown} appearance
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Logique métier — apparence des joueurs
 */
export function isValidAppearance(appearance) {
  return typeof appearance === 'object' && appearance !== null && !Array.isArray(appearance)
    && Object.keys(appearance).length === 2
    && HAIR_STYLE_IDS.includes(appearance.hair) && isHairColor(appearance.color);
}

/**
 * Copie propre d'une apparence valide, couleur en minuscules.
 * @param {{hair: string, color: string}} appearance
 * @returns {{hair: string, color: string}}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Logique métier — apparence des joueurs
 */
export function copyAppearance({ hair, color }) {
  return { hair, color: color.toLowerCase() };
}

/**
 * Vrai si deux apparences sont identiques.
 * @param {{hair: string, color: string}} a
 * @param {{hair: string, color: string}} b
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Logique métier — apparence des joueurs
 */
export function sameAppearance(a, b) {
  return a.hair === b.hair && a.color.toLowerCase() === b.color.toLowerCase();
}

/**
 * Couleur « #rrggbb » en entier sRGB 0xRRGGBB, pour three.js.
 * @param {string} color
 * @returns {number}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Logique métier — apparence des joueurs
 */
export function hairColorToHex(color) {
  return Number.parseInt(color.slice(1), 16);
}