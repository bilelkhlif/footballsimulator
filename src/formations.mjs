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
   * peut remplacer par sa propre valeur (milieu défensif plus bas, par exemple).
   * @returns {Array<{x: number, slots: Array<{y: number, number: number, role: string, x?: number}>}>}
   * @responsable Bilel Khlif
   * @date 2026-11-05
   * @role Logique métier — patron Strategy : stratégie de base
   */
  get lines() {
    throw new Error('FormationStrategy : la sous-classe doit définir lines');
  }

  /**
   * Calcule les 11 positions normalisées de la formation.
   * @returns {Array<{x: number, y: number, number: number, role: string}>}
   * @responsable Bilel Khlif
   * @date 2026-11-05
   * @role Logique métier — patron Strategy : stratégie de base
   */
  computePositions() {
    const positions = this.lines.flatMap((line) => line.slots.map((slot) => ({
      x: slot.x ?? line.x,
      y: slot.y,
      number: slot.number,
      role: slot.role,
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
