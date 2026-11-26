/**
 * Formations tactiques (patron Strategy, cahier §3.4).
 *
 * Chaque formation est une stratégie qui calcule les positions des 11 joueurs.
 * Les positions sont exprimées dans un repère normalisé propre à l'équipe :
 * x = 0 sur sa propre ligne de but et x = 0,5 sur la ligne médiane ;
 * y = 0 sur son flanc gauche et y = 1 sur son flanc droit.
 * Les joueurs sont placés dans leur moitié de terrain, comme au coup d'envoi.
 *
 * Ajouter une formation revient à écrire une sous-classe et à l'enregistrer dans FORMATIONS :
 * son bouton apparaît alors dans l'interface (src/formation-panel.mjs), et les tests la vérifient.
 * Le 4-2-3-1, ajouté au sprint 4, en est l'exemple.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { PITCH_LENGTH, PITCH_WIDTH } from './config.mjs';

/**
 * Postes normalisés, avec leur libellé : l'abréviation courte qu'un entraîneur écrit au tableau.
 * Aux dix postes de base s'ajoutent les milieux excentrés d'une ligne de quatre (MG, MD) et les
 * pistons (PG, PD), qui ne sont ni des latéraux ni des ailiers : ils tiennent tout le couloir.
 */
export const POSTS = Object.freeze({
  GB: 'Gardien de but',
  DD: 'Défenseur droit',
  DC: 'Défenseur central',
  DG: 'Défenseur gauche',
  PD: 'Piston droit',
  PG: 'Piston gauche',
  MDC: 'Milieu défensif central',
  MC: 'Milieu central',
  MD: 'Milieu droit',
  MG: 'Milieu gauche',
  MOC: 'Milieu offensif central',
  AD: 'Ailier droit',
  AG: 'Ailier gauche',
  AT: 'Attaquant',
});

/** Poste normalisé de chaque rôle employé par les formations. */
const ROLE_POSTS = Object.freeze({
  Gardien: 'GB',
  'Arrière droit': 'DD',
  'Arrière gauche': 'DG',
  'Défenseur central': 'DC',
  'Piston droit': 'PD',
  'Piston gauche': 'PG',
  'Milieu défensif': 'MDC',
  Sentinelle: 'MDC',
  'Milieu central': 'MC',
  'Milieu relayeur': 'MC',
  'Milieu droit': 'MD',
  'Milieu gauche': 'MG',
  'Meneur de jeu': 'MOC',
  'Milieu offensif droit': 'AD',
  'Milieu offensif gauche': 'AG',
  'Ailier droit': 'AD',
  'Ailier gauche': 'AG',
  'Avant-centre': 'AT',
  Attaquant: 'AT',
  'Second attaquant': 'AT',
  // Rôles génériques, pour une formation décrite sans détail.
  Défenseur: 'DC',
  Milieu: 'MC',
});

/**
 * Poste normalisé d'un rôle de formation. Un rôle inconnu est refusé : chaque place d'une
 * formation a ainsi toujours un poste.
 * @param {string} role par exemple « Sentinelle »
 * @returns {string} code de POSTS, par exemple « MDC »
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — postes normalisés
 */
export function postOfRole(role) {
  const post = ROLE_POSTS[role];
  if (!post) {
    throw new Error(`Rôle sans poste normalisé : ${role}`);
  }
  return post;
}

/**
 * Phases de jeu d'une formation : la disposition de base (coup d'envoi), en possession du ballon
 * et hors possession. Un même système change de forme selon la phase : le 4-3-3 devient un 2-3-5
 * en possession et un 4-5-1 sans le ballon.
 */
export const PHASES = Object.freeze({ BASE: 'base', POSSESSION: 'possession', DEFENSE: 'defense' });

/** Libellé de chaque phase, pour l'interface. */
export const PHASE_LABELS = Object.freeze({ base: 'Base', possession: 'En possession', defense: 'Hors possession' });

/** Ligne du gardien, commune à toutes les formations. */
const GOALKEEPER_LINE = Object.freeze({
  x: 0.04,
  slots: [{ y: 0.5, number: 1, role: 'Gardien' }],
});

/** Défense à quatre, partagée par le 4-4-2 et le 4-3-3. */
const BACK_FOUR = Object.freeze({
  x: 0.17,
  slots: [
    { y: 0.12, number: 3, role: 'Arrière gauche' },
    { y: 0.37, number: 5, role: 'Défenseur central' },
    { y: 0.63, number: 4, role: 'Défenseur central' },
    { y: 0.88, number: 2, role: 'Arrière droit' },
  ],
});

/**
 * Stratégie de base : une formation décrite ligne par ligne, du gardien à l'attaque.
 * Les sous-classes définissent `name` et `lines` ; `computePositions` est commun.
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Logique métier — patron Strategy : stratégie de base
 */
export class FormationStrategy {
  /**
   * Nom affiché de la formation, par exemple « 4-4-2 ».
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-05
   * @role Logique métier — patron Strategy : stratégie de base
   */
  get name() {
    throw new Error('FormationStrategy : la sous-classe doit définir name');
  }

  /**
   * Lignes de joueurs. Chaque ligne a une profondeur x commune, qu'un joueur
   * peut remplacer par sa propre valeur (milieu défensif plus bas, par exemple). Le poste
   * normalisé se déduit du rôle ; une place peut aussi le donner (`post`, code de POSTS).
   * @returns {Array<{x: number, slots: Array<{y: number, number: number, role: string, x?: number, post?: string}>}>}
   * @responsable Bilel Khlif
   * @date 2026-11-05
   * @role Logique métier — patron Strategy : stratégie de base
   */
  get lines() {
    throw new Error('FormationStrategy : la sous-classe doit définir lines');
  }

  /**
   * Dispositions en possession et hors possession : pour chaque phase, son nom (« 2-3-5 »), son
   * principe et la place de chaque numéro, [x, y] dans le repère normalisé de l'équipe. En
   * possession, x dépasse 0,5 : l'équipe joue dans la moitié adverse. Sans disposition propre, une
   * phase reprend la disposition de base.
   * @returns {{possession?: {name: string, principle: string, places: object}, defense?: {name: string, principle: string, places: object}}}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : dispositions en possession et hors possession
   */
  get phaseShapes() {
    return {};
  }

  /**
   * Nom de la disposition d'une phase : « 2-3-5 » pour le 4-3-3 en possession.
   * @param {string} [phase] une valeur de PHASES
   * @returns {string}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : dispositions en possession et hors possession
   */
  shapeName(phase = PHASES.BASE) {
    return phase === PHASES.BASE ? this.name : this.phaseShapes[phase]?.name ?? this.name;
  }

  /**
   * Calcule les 11 positions normalisées de la formation, chacune avec son poste normalisé. Dans une
   * autre phase que la base, chaque joueur garde son rôle et son poste, mais prend la place de la
   * disposition de cette phase ; elle doit placer exactement les 11 numéros de la base.
   * @param {string} [phase] une valeur de PHASES
   * @returns {Array<{x: number, y: number, number: number, role: string, post: string}>}
   * @responsable Bilel Khlif
   * @date 2026-11-05
   * @role Logique métier — patron Strategy : stratégie de base
   */
  computePositions(phase = PHASES.BASE) {
    if (!Object.values(PHASES).includes(phase)) {
      throw new Error(`Phase de jeu inconnue : ${phase}`);
    }
    const base = this.#computeBasePositions();
    const places = phase === PHASES.BASE ? null : this.phaseShapes[phase]?.places;
    if (!places) {
      return base;
    }
    const numbers = Object.keys(places).map(Number).sort((a, b) => a - b);
    if (numbers.join() !== base.map((p) => p.number).sort((a, b) => a - b).join()) {
      throw new Error(`La disposition ${this.shapeName(phase)} du ${this.name} ne place pas les 11 joueurs de la formation`);
    }
    return base.map((position) => ({ ...position, x: places[position.number][0], y: places[position.number][1] }));
  }

  /**
   * Positions de la disposition de base, ligne par ligne.
   * @returns {Array<{x: number, y: number, number: number, role: string, post: string}>}
   * @responsable Bilel Khlif
   * @date 2026-11-05
   * @role Logique métier — patron Strategy : stratégie de base
   */
  #computeBasePositions() {
    const positions = this.lines.flatMap((line) => line.slots.map((slot) => ({
      x: slot.x ?? line.x,
      y: slot.y,
      number: slot.number,
      role: slot.role,
      post: slot.post ?? postOfRole(slot.role),
    })));
    if (positions.length !== 11) {
      throw new Error(`La formation ${this.name} place ${positions.length} joueurs au lieu de 11`);
    }
    return positions;
  }
}

/**
 * 4-4-2 : deux lignes de quatre et deux attaquants.
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Logique métier — patron Strategy : formation concrète
 */
export class Formation442 extends FormationStrategy {
  /**
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-05
   * @role Logique métier — patron Strategy : formation concrète
   */
  get name() {
    return '4-4-2';
  }

  /**
   * Dispositions : en possession, 2-4-4 ; hors possession, 4-4-2 compact.
   * @returns {object}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : dispositions en possession et hors possession
   */
  get phaseShapes() {
    return {
      possession: {
        name: '2-4-4',
        principle: "Les latéraux montent à hauteur des milieux ; les milieux excentrés rejoignent les deux attaquants.",
        places: { 1: [0.08, 0.5], 2: [0.5, 0.94], 3: [0.5, 0.06], 4: [0.3, 0.64], 5: [0.3, 0.36], 6: [0.46, 0.6], 7: [0.66, 0.84], 8: [0.46, 0.4], 9: [0.8, 0.58], 10: [0.78, 0.42], 11: [0.66, 0.16] },
      },
      defense: {
        name: '4-4-2 compact',
        principle: "Deux lignes de quatre resserrées en bloc médian ; les attaquants ferment l'axe.",
        places: { 1: [0.04, 0.5], 2: [0.16, 0.8], 3: [0.16, 0.2], 4: [0.16, 0.6], 5: [0.16, 0.4], 6: [0.27, 0.61], 7: [0.27, 0.82], 8: [0.27, 0.39], 9: [0.38, 0.58], 10: [0.38, 0.42], 11: [0.27, 0.18] },
      },
    };
  }

  /**
   * @returns {Array<object>}
   * @responsable Bilel Khlif
   * @date 2026-11-05
   * @role Logique métier — patron Strategy : formation concrète
   */
  get lines() {
    return [
      GOALKEEPER_LINE,
      BACK_FOUR,
      {
        x: 0.31,
        slots: [
          { y: 0.12, number: 11, role: 'Milieu gauche' },
          { y: 0.37, number: 8, role: 'Milieu central' },
          { y: 0.63, number: 6, role: 'Milieu central' },
          { y: 0.88, number: 7, role: 'Milieu droit' },
        ],
      },
      {
        x: 0.45,
        slots: [
          { y: 0.38, number: 10, role: 'Attaquant' },
          { y: 0.62, number: 9, role: 'Attaquant' },
        ],
      },
    ];
  }
}

/**
 * 4-3-3 : un milieu à trois et trois attaquants, dont deux ailiers.
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Logique métier — patron Strategy : formation concrète
 */
export class Formation433 extends FormationStrategy {
  /**
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-05
   * @role Logique métier — patron Strategy : formation concrète
   */
  get name() {
    return '4-3-3';
  }

  /**
   * Dispositions : en possession, 2-3-5 ; hors possession, 4-5-1.
   * @returns {object}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : dispositions en possession et hors possession
   */
  get phaseShapes() {
    return {
      possession: {
        name: '2-3-5',
        principle: "Les latéraux rentrent à côté de la sentinelle ; les relayeurs montent dans les demi-espaces, les ailiers tiennent la largeur.",
        places: { 1: [0.08, 0.5], 2: [0.46, 0.7], 3: [0.46, 0.3], 4: [0.32, 0.64], 5: [0.32, 0.36], 6: [0.44, 0.5], 7: [0.78, 0.95], 8: [0.74, 0.3], 9: [0.82, 0.5], 10: [0.74, 0.7], 11: [0.78, 0.05] },
      },
      defense: {
        name: '4-5-1',
        principle: "Les ailiers redescendent sur la ligne des milieux ; l'avant-centre seul presse la relance.",
        places: { 1: [0.04, 0.5], 2: [0.16, 0.8], 3: [0.16, 0.2], 4: [0.16, 0.6], 5: [0.16, 0.4], 6: [0.25, 0.5], 7: [0.29, 0.88], 8: [0.29, 0.35], 9: [0.4, 0.5], 10: [0.29, 0.65], 11: [0.29, 0.12] },
      },
    };
  }

  /**
   * @returns {Array<object>}
   * @responsable Bilel Khlif
   * @date 2026-11-05
   * @role Logique métier — patron Strategy : formation concrète
   */
  get lines() {
    return [
      GOALKEEPER_LINE,
      BACK_FOUR,
      {
        x: 0.31,
        slots: [
          { y: 0.3, number: 8, role: 'Milieu relayeur' },
          { y: 0.5, number: 6, role: 'Milieu défensif', x: 0.27 },
          { y: 0.7, number: 10, role: 'Milieu relayeur' },
        ],
      },
      {
        x: 0.43,
        slots: [
          { y: 0.14, number: 11, role: 'Ailier gauche' },
          { y: 0.5, number: 9, role: 'Avant-centre', x: 0.4 },
          { y: 0.86, number: 7, role: 'Ailier droit' },
        ],
      },
    ];
  }
}

/**
 * 3-5-2 : trois défenseurs centraux, deux pistons et deux attaquants.
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Logique métier — patron Strategy : formation concrète
 */
export class Formation352 extends FormationStrategy {
  /**
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-05
   * @role Logique métier — patron Strategy : formation concrète
   */
  get name() {
    return '3-5-2';
  }

  /**
   * Dispositions : en possession, 3-2-5 ; hors possession, 5-3-2.
   * @returns {object}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : dispositions en possession et hors possession
   */
  get phaseShapes() {
    return {
      possession: {
        name: '3-2-5',
        principle: "Les pistons montent sur la ligne d'attaque ; le meneur rejoint les deux attaquants.",
        places: { 1: [0.08, 0.5], 2: [0.72, 0.95], 3: [0.72, 0.05], 4: [0.3, 0.5], 5: [0.3, 0.75], 6: [0.3, 0.25], 7: [0.48, 0.62], 8: [0.48, 0.38], 9: [0.82, 0.62], 10: [0.7, 0.5], 11: [0.82, 0.38] },
      },
      defense: {
        name: '5-3-2',
        principle: "Les pistons redescendent dans la ligne des centraux : cinq défenseurs.",
        places: { 1: [0.04, 0.5], 2: [0.16, 0.92], 3: [0.16, 0.08], 4: [0.14, 0.5], 5: [0.14, 0.7], 6: [0.14, 0.3], 7: [0.27, 0.7], 8: [0.27, 0.3], 9: [0.4, 0.58], 10: [0.28, 0.5], 11: [0.39, 0.42] },
      },
    };
  }

  /**
   * @returns {Array<object>}
   * @responsable Bilel Khlif
   * @date 2026-11-05
   * @role Logique métier — patron Strategy : formation concrète
   */
  get lines() {
    return [
      GOALKEEPER_LINE,
      {
        x: 0.16,
        slots: [
          { y: 0.28, number: 6, role: 'Défenseur central' },
          { y: 0.5, number: 4, role: 'Défenseur central' },
          { y: 0.72, number: 5, role: 'Défenseur central' },
        ],
      },
      {
        x: 0.29,
        slots: [
          { y: 0.08, number: 3, role: 'Piston gauche', x: 0.33 },
          { y: 0.32, number: 8, role: 'Milieu central' },
          { y: 0.5, number: 10, role: 'Meneur de jeu', x: 0.35 },
          { y: 0.68, number: 7, role: 'Milieu central' },
          { y: 0.92, number: 2, role: 'Piston droit', x: 0.33 },
        ],
      },
      {
        x: 0.44,
        slots: [
          { y: 0.38, number: 11, role: 'Attaquant' },
          { y: 0.62, number: 9, role: 'Attaquant' },
        ],
      },
    ];
  }
}

/**
 * 4-2-3-1 (sprint 4) : deux milieux défensifs, trois milieux offensifs et un attaquant.
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Logique métier — patron Strategy : formation concrète
 */
export class Formation4231 extends FormationStrategy {
  /**
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Logique métier — patron Strategy : formation concrète
   */
  get name() {
    return '4-2-3-1';
  }

  /**
   * Dispositions : en possession, 2-4-4 ; hors possession, 4-4-1-1.
   * @returns {object}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : dispositions en possession et hors possession
   */
  get phaseShapes() {
    return {
      possession: {
        name: '2-4-4',
        principle: "Les latéraux montent à hauteur du double pivot ; les trois milieux offensifs rejoignent l'avant-centre.",
        places: { 1: [0.08, 0.5], 2: [0.5, 0.92], 3: [0.5, 0.08], 4: [0.3, 0.64], 5: [0.3, 0.36], 6: [0.45, 0.4], 7: [0.74, 0.82], 8: [0.45, 0.6], 9: [0.82, 0.5], 10: [0.7, 0.5], 11: [0.74, 0.18] },
      },
      defense: {
        name: '4-4-1-1',
        principle: "Les milieux excentrés s'alignent sur le double pivot ; le meneur marque la sentinelle adverse.",
        places: { 1: [0.04, 0.5], 2: [0.16, 0.8], 3: [0.16, 0.2], 4: [0.16, 0.6], 5: [0.16, 0.4], 6: [0.28, 0.4], 7: [0.28, 0.85], 8: [0.28, 0.6], 9: [0.42, 0.5], 10: [0.36, 0.5], 11: [0.28, 0.15] },
      },
    };
  }

  /**
   * @returns {Array<object>}
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Logique métier — patron Strategy : formation concrète
   */
  get lines() {
    return [
      GOALKEEPER_LINE,
      BACK_FOUR,
      {
        x: 0.27,
        slots: [
          { y: 0.38, number: 6, role: 'Milieu défensif' },
          { y: 0.62, number: 8, role: 'Milieu défensif' },
        ],
      },
      {
        x: 0.37,
        slots: [
          { y: 0.15, number: 11, role: 'Milieu offensif gauche' },
          { y: 0.5, number: 10, role: 'Meneur de jeu', x: 0.35 },
          { y: 0.85, number: 7, role: 'Milieu offensif droit' },
        ],
      },
      {
        x: 0.41,
        slots: [{ y: 0.5, number: 9, role: 'Avant-centre' }],
      },
    ];
  }
}

/**
 * 4-1-4-1 : bloc compact avec une sentinelle. Le n° 6 protège seul l'axe devant la défense ; les
 * deux relayeurs occupent les demi-espaces et les deux milieux excentrés ferment les couloirs.
 * Sur le terrain réel : 13 m entre la défense et la sentinelle, 8 m entre la sentinelle et la
 * ligne de quatre ; l'avant-centre reste à 9,5 m du point central, hors du rond.
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — patron Strategy : formation concrète
 */
export class Formation4141 extends FormationStrategy {
  /**
   * @returns {string}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : formation concrète
   */
  get name() {
    return '4-1-4-1';
  }

  /**
   * Dispositions : en possession, 2-3-5 ; hors possession, 4-5-1.
   * @returns {object}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : dispositions en possession et hors possession
   */
  get phaseShapes() {
    return {
      possession: {
        name: '2-3-5',
        principle: "Les latéraux encadrent la sentinelle ; les relayeurs entrent dans les demi-espaces, les milieux excentrés tiennent la largeur.",
        places: { 1: [0.08, 0.5], 2: [0.47, 0.78], 3: [0.47, 0.22], 4: [0.32, 0.64], 5: [0.32, 0.36], 6: [0.45, 0.5], 7: [0.76, 0.94], 8: [0.72, 0.32], 9: [0.82, 0.5], 10: [0.72, 0.68], 11: [0.76, 0.06] },
      },
      defense: {
        name: '4-5-1',
        principle: "La ligne de quatre recule devant la sentinelle : un bloc de cinq milieux, très compact.",
        places: { 1: [0.04, 0.5], 2: [0.16, 0.8], 3: [0.16, 0.2], 4: [0.16, 0.6], 5: [0.16, 0.4], 6: [0.23, 0.5], 7: [0.29, 0.86], 8: [0.29, 0.38], 9: [0.4, 0.5], 10: [0.29, 0.62], 11: [0.29, 0.14] },
      },
    };
  }

  /**
   * @returns {Array<object>}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : formation concrète
   */
  get lines() {
    return [
      GOALKEEPER_LINE,
      BACK_FOUR,
      {
        x: 0.245,
        slots: [{ y: 0.5, number: 6, role: 'Sentinelle' }],
      },
      {
        x: 0.32,
        slots: [
          { y: 0.12, number: 11, role: 'Milieu gauche' },
          { y: 0.37, number: 8, role: 'Milieu relayeur' },
          { y: 0.63, number: 10, role: 'Milieu relayeur' },
          { y: 0.88, number: 7, role: 'Milieu droit' },
        ],
      },
      {
        x: 0.41,
        slots: [{ y: 0.5, number: 9, role: 'Avant-centre' }],
      },
    ];
  }
}

/**
 * 3-4-3 : la largeur vient des pistons. Trois défenseurs centraux couvrent l'axe ; les deux
 * pistons, collés à la ligne de touche (5 m), donnent la largeur, ce qui laisse les deux attaquants
 * excentrés rentrer dans les demi-espaces autour de l'avant-centre. Le double pivot n° 8 et n° 10
 * tient l'axe devant les trois centraux.
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — patron Strategy : formation concrète
 */
export class Formation343 extends FormationStrategy {
  /**
   * @returns {string}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : formation concrète
   */
  get name() {
    return '3-4-3';
  }

  /**
   * Dispositions : en possession, 3-2-5 ; hors possession, 5-4-1.
   * @returns {object}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : dispositions en possession et hors possession
   */
  get phaseShapes() {
    return {
      possession: {
        name: '3-2-5',
        principle: "Les pistons donnent la largeur ; les ailiers rentrent dans les demi-espaces autour de l'avant-centre.",
        places: { 1: [0.08, 0.5], 2: [0.74, 0.95], 3: [0.74, 0.05], 4: [0.32, 0.5], 5: [0.32, 0.75], 6: [0.32, 0.25], 7: [0.76, 0.7], 8: [0.48, 0.4], 9: [0.82, 0.5], 10: [0.48, 0.6], 11: [0.76, 0.3] },
      },
      defense: {
        name: '5-4-1',
        principle: "Les pistons redescendent en défense, les ailiers sur la ligne des milieux.",
        places: { 1: [0.04, 0.5], 2: [0.16, 0.92], 3: [0.16, 0.08], 4: [0.14, 0.5], 5: [0.14, 0.7], 6: [0.14, 0.3], 7: [0.28, 0.86], 8: [0.28, 0.38], 9: [0.4, 0.5], 10: [0.28, 0.62], 11: [0.28, 0.14] },
      },
    };
  }

  /**
   * @returns {Array<object>}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : formation concrète
   */
  get lines() {
    return [
      GOALKEEPER_LINE,
      {
        x: 0.16,
        slots: [
          { y: 0.28, number: 6, role: 'Défenseur central' },
          { y: 0.5, number: 4, role: 'Défenseur central' },
          { y: 0.72, number: 5, role: 'Défenseur central' },
        ],
      },
      {
        x: 0.3,
        slots: [
          { y: 0.07, number: 3, role: 'Piston gauche', x: 0.34 },
          { y: 0.38, number: 8, role: 'Milieu central' },
          { y: 0.62, number: 10, role: 'Milieu central' },
          { y: 0.93, number: 2, role: 'Piston droit', x: 0.34 },
        ],
      },
      {
        x: 0.42,
        slots: [
          { y: 0.22, number: 11, role: 'Ailier gauche' },
          { y: 0.5, number: 9, role: 'Avant-centre', x: 0.41 },
          { y: 0.78, number: 7, role: 'Ailier droit' },
        ],
      },
    ];
  }
}

/**
 * 5-3-2 : bloc bas et contre-attaque. Cinq défenseurs à hauteur de la surface (15 à 17 m du but),
 * les pistons alignés avec les trois centraux ; un milieu à trois resserré 12 m devant eux pour
 * fermer l'axe. Les deux attaquants restent hauts, prêts à partir en contre dès la récupération :
 * le second attaquant décroché sert d'appui, l'avant-centre attaque la profondeur.
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — patron Strategy : formation concrète
 */
export class Formation532 extends FormationStrategy {
  /**
   * @returns {string}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : formation concrète
   */
  get name() {
    return '5-3-2';
  }

  /**
   * Dispositions : en possession, 3-5-2 ; hors possession, 5-3-2 bas.
   * @returns {object}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : dispositions en possession et hors possession
   */
  get phaseShapes() {
    return {
      possession: {
        name: '3-5-2',
        principle: "À la récupération, les pistons montent à hauteur des milieux ; les deux attaquants attaquent la profondeur.",
        places: { 1: [0.08, 0.5], 2: [0.6, 0.94], 3: [0.6, 0.06], 4: [0.28, 0.5], 5: [0.28, 0.72], 6: [0.28, 0.28], 7: [0.5, 0.68], 8: [0.5, 0.32], 9: [0.78, 0.58], 10: [0.46, 0.5], 11: [0.72, 0.42] },
      },
      defense: {
        name: '5-3-2 bas',
        principle: "Bloc bas devant la surface : cinq défenseurs à 13 m du but, trois milieux 10 m devant.",
        places: { 1: [0.04, 0.5], 2: [0.13, 0.9], 3: [0.13, 0.1], 4: [0.12, 0.5], 5: [0.12, 0.68], 6: [0.12, 0.32], 7: [0.23, 0.68], 8: [0.23, 0.32], 9: [0.36, 0.56], 10: [0.235, 0.5], 11: [0.34, 0.45] },
      },
    };
  }

  /**
   * @returns {Array<object>}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : formation concrète
   */
  get lines() {
    return [
      GOALKEEPER_LINE,
      {
        x: 0.14,
        slots: [
          { y: 0.08, number: 3, role: 'Piston gauche', x: 0.16 },
          { y: 0.3, number: 6, role: 'Défenseur central' },
          { y: 0.5, number: 4, role: 'Défenseur central' },
          { y: 0.7, number: 5, role: 'Défenseur central' },
          { y: 0.92, number: 2, role: 'Piston droit', x: 0.16 },
        ],
      },
      {
        x: 0.255,
        slots: [
          { y: 0.28, number: 8, role: 'Milieu relayeur' },
          { y: 0.5, number: 10, role: 'Milieu central', x: 0.27 },
          { y: 0.72, number: 7, role: 'Milieu relayeur' },
        ],
      },
      {
        x: 0.39,
        slots: [
          { y: 0.42, number: 11, role: 'Second attaquant', x: 0.38 },
          { y: 0.58, number: 9, role: 'Avant-centre', x: 0.4 },
        ],
      },
    ];
  }
}

/**
 * 4-4-2 en losange : supériorité dans l'axe. Les quatre milieux restent dans le couloir central
 * (entre les demi-espaces) : une sentinelle à la base, deux relayeurs dans les demi-espaces et un
 * meneur de jeu à la pointe, derrière deux attaquants proches. La largeur revient aux latéraux.
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — patron Strategy : formation concrète
 */
export class Formation442Diamond extends FormationStrategy {
  /**
   * @returns {string}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : formation concrète
   */
  get name() {
    return '4-4-2 losange';
  }

  /**
   * Dispositions : en possession, 2-1-4-1-2 ; hors possession, 4-3-1-2.
   * @returns {object}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : dispositions en possession et hors possession
   */
  get phaseShapes() {
    return {
      possession: {
        name: '2-1-4-1-2',
        principle: "Les latéraux montent à hauteur des relayeurs ; la sentinelle reste seule devant les deux centraux.",
        places: { 1: [0.08, 0.5], 2: [0.58, 0.94], 3: [0.58, 0.06], 4: [0.3, 0.64], 5: [0.3, 0.36], 6: [0.44, 0.5], 7: [0.56, 0.67], 8: [0.56, 0.33], 9: [0.8, 0.6], 10: [0.68, 0.5], 11: [0.8, 0.4] },
      },
      defense: {
        name: '4-3-1-2',
        principle: "Le losange se resserre dans l'axe ; les relayeurs coulissent vers le ballon pour couvrir les côtés.",
        places: { 1: [0.04, 0.5], 2: [0.16, 0.8], 3: [0.16, 0.2], 4: [0.16, 0.6], 5: [0.16, 0.4], 6: [0.24, 0.5], 7: [0.29, 0.67], 8: [0.29, 0.33], 9: [0.4, 0.6], 10: [0.35, 0.5], 11: [0.4, 0.4] },
      },
    };
  }

  /**
   * @returns {Array<object>}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Strategy : formation concrète
   */
  get lines() {
    return [
      GOALKEEPER_LINE,
      BACK_FOUR,
      {
        x: 0.31,
        slots: [
          { y: 0.5, number: 6, role: 'Sentinelle', x: 0.245 },
          { y: 0.3, number: 8, role: 'Milieu relayeur' },
          { y: 0.7, number: 7, role: 'Milieu relayeur' },
          { y: 0.5, number: 10, role: 'Meneur de jeu', x: 0.37 },
        ],
      },
      {
        x: 0.44,
        slots: [
          { y: 0.37, number: 11, role: 'Attaquant' },
          { y: 0.63, number: 9, role: 'Attaquant' },
        ],
      },
    ];
  }
}

/** Formations disponibles, indexées par leur nom, dans l'ordre des boutons de l'interface. */
export const FORMATIONS = Object.freeze(Object.fromEntries(
  [new Formation442(), new Formation433(), new Formation352(), new Formation4231(), new Formation4141(), new Formation343(),
    new Formation532(), new Formation442Diamond()]
    .map((formation) => [formation.name, formation]),
));

/**
 * Poste normalisé d'un numéro dans une formation, par exemple « MDC » pour le n° 6 du 4-3-3.
 * @param {FormationStrategy} formation
 * @param {number} number numéro de maillot, de 1 à 11
 * @returns {string|null}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — postes normalisés
 */
export function postOfNumber(formation, number) {
  return formation.computePositions().find((position) => position.number === number)?.post ?? null;
}

/**
 * Renvoie la stratégie correspondant à un nom de formation.
 * @param {string} name par exemple « 4-3-3 »
 * @returns {FormationStrategy}
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Logique métier — patron Strategy : choix de la formation par son nom
 */
export function getFormation(name) {
  const formation = FORMATIONS[name];
  if (!formation) {
    throw new Error(`Formation inconnue : ${name}`);
  }
  return formation;
}

/**
 * Convertit une position normalisée en coordonnées de la scène (mètres, plan XZ).
 * L'équipe qui attaque vers +X a son flanc droit côté +Z ; l'autre équipe est
 * la même formation tournée de 180° autour du point central.
 * @param {{x: number, y: number}} position position normalisée
 * @param {boolean} attacksPositiveX sens d'attaque de l'équipe
 * @returns {{x: number, z: number}}
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Logique métier — conversion vers le repère du terrain
 */
export function toPitchCoordinates(position, attacksPositiveX) {
  const direction = attacksPositiveX ? 1 : -1;
  return {
    x: direction * (position.x - 0.5) * PITCH_LENGTH,
    z: direction * (position.y - 0.5) * PITCH_WIDTH,
  };
}
