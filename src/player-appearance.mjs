/**
 * Apparence d'un joueur (phase 5) : coupe de cheveux, couleur des cheveux et teint de peau, choisis
 * joueur par joueur dans « Personnaliser le joueur ».
 *
 * Une apparence est une donnée simple, rangée dans le tableau tactique sous la clé du joueur
 * (« blue:9 », équipe et numéro, qui ne changent jamais) : elle suit donc le joueur quand il se
 * déplace ou change de formation, et passe par l'instantané du tableau dans la sauvegarde
 * automatique, les tactiques enregistrées et les fichiers JSON. Un joueur jamais personnalisé n'a
 * aucune entrée : il garde l'apparence par défaut, et une tactique plus ancienne s'ouvre telle
 * quelle. Le teint est venu après : une apparence sans teint (enregistrée avant) garde le teint
 * par défaut.
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

/**
 * Teints de peau proposés, du plus clair au plus foncé : des couleurs de peau réelles, peu
 * saturées. Chaque teint a un identifiant stable, enregistré avec la tactique ; la couleur peut
 * être retouchée sans casser les tactiques enregistrées.
 */
export const SKIN_TONES = Object.freeze([
  Object.freeze({ id: 'ivory', label: 'Ivoire très clair', color: '#f3d9c4' }),
  Object.freeze({ id: 'light', label: 'Beige clair', color: '#e8c2a2' }),
  Object.freeze({ id: 'light-medium', label: 'Beige clair-moyen', color: '#d9a982' }),
  Object.freeze({ id: 'tan', label: 'Hâlé doré', color: '#c8916c' }),
  Object.freeze({ id: 'medium', label: 'Brun moyen', color: '#a8714d' }),
  Object.freeze({ id: 'deep', label: 'Brun foncé', color: '#83533a' }),
  Object.freeze({ id: 'very-deep', label: 'Brun très foncé', color: '#5f3a28' }),
  Object.freeze({ id: 'darkest', label: 'Ébène', color: '#432a1e' }),
]);

/** Identifiants des teints. */
export const SKIN_TONE_IDS = Object.freeze(SKIN_TONES.map(({ id }) => id));

/** Teint de départ : celui du modèle avant la personnalisation. */
export const DEFAULT_SKIN_TONE = 'tan';

/** Apparence d'un joueur jamais personnalisé : coupe courte, cheveux châtain foncé, teint hâlé. */
export const DEFAULT_APPEARANCE = Object.freeze({ hair: 'classic', color: '#2a1c14', skin: DEFAULT_SKIN_TONE });

/**
 * Vrai si la valeur est l'identifiant d'un des teints proposés.
 * @param {unknown} skin
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Logique métier — apparence des joueurs
 */
export function isSkinTone(skin) {
  return typeof skin === 'string' && SKIN_TONE_IDS.includes(skin);
}

/**
 * Couleur « #rrggbb » d'un teint ; celle du teint par défaut pour un identifiant inconnu.
 * @param {string} skin identifiant du teint
 * @returns {string}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Logique métier — apparence des joueurs
 */
export function skinToneColor(skin) {
  return (SKIN_TONES.find(({ id }) => id === skin) ?? SKIN_TONES.find(({ id }) => id === DEFAULT_SKIN_TONE)).color;
}

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
 * Vrai si la valeur est une apparence valide : une des quatre coupes, une couleur « #rrggbb »,
 * éventuellement un teint proposé (absent d'une apparence enregistrée avant les teints), et rien
 * d'autre.
 * @param {unknown} appearance
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Logique métier — apparence des joueurs
 */
export function isValidAppearance(appearance) {
  if (typeof appearance !== 'object' || appearance === null || Array.isArray(appearance)) {
    return false;
  }
  const keys = Object.keys(appearance);
  return keys.every((key) => ['hair', 'color', 'skin'].includes(key))
    && HAIR_STYLE_IDS.includes(appearance.hair) && isHairColor(appearance.color)
    && (appearance.skin === undefined || isSkinTone(appearance.skin));
}

/**
 * Copie propre et complète d'une apparence valide : couleur en minuscules, teint par défaut s'il
 * manque.
 * @param {{hair: string, color: string, skin?: string}} appearance
 * @returns {{hair: string, color: string, skin: string}}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Logique métier — apparence des joueurs
 */
export function copyAppearance({ hair, color, skin }) {
  return { hair, color: color.toLowerCase(), skin: isSkinTone(skin) ? skin : DEFAULT_SKIN_TONE };
}

/**
 * Vrai si deux apparences sont identiques (un teint absent vaut le teint par défaut).
 * @param {{hair: string, color: string, skin?: string}} a
 * @param {{hair: string, color: string, skin?: string}} b
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Logique métier — apparence des joueurs
 */
export function sameAppearance(a, b) {
  const [first, second] = [copyAppearance(a), copyAppearance(b)];
  return first.hair === second.hair && first.color === second.color && first.skin === second.skin;
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