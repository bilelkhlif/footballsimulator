/**
 * Formations tactiques (patron Strategy, cahier §3.4).
 *
 * Chaque formation est une stratégie qui calcule les positions des 11 joueurs.
 * Les positions sont exprimées dans un repère normalisé propre à l'équipe :
 * x = 0 sur sa propre ligne de but et x = 0,5 sur la ligne médiane ;
 * y = 0 sur son flanc gauche et y = 1 sur son flanc droit.
 * Les joueurs sont placés dans leur moitié de terrain, comme au coup d'envoi.
 *
 * Ajouter une formation revient à écrire une sous-classe et à l'enregistrer dans FORMATIONS.
 */
import { PITCH_LENGTH, PITCH_WIDTH } from './config.js';

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
 */
export class FormationStrategy {
  /**
   * Nom affiché de la formation, par exemple « 4-4-2 ».
   * @returns {string}
   */
  get name() {
    throw new Error('FormationStrategy : la sous-classe doit définir name');
  }

  /**
   * Lignes de joueurs. Chaque ligne a une profondeur x commune, qu'un joueur
   * peut remplacer par sa propre valeur (milieu défensif plus bas, par exemple).
   * @returns {Array<{x: number, slots: Array<{y: number, number: number, role: string, x?: number}>}>}
   */
  get lines() {
    throw new Error('FormationStrategy : la sous-classe doit définir lines');
  }

  /**
   * Calcule les 11 positions normalisées de la formation.
   * @returns {Array<{x: number, y: number, number: number, role: string}>}
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

/** 4-4-2 : deux lignes de quatre et deux attaquants. */
export class Formation442 extends FormationStrategy {
  /** @returns {string} */
  get name() {
    return '4-4-2';
  }

  /** @returns {Array<object>} */
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

/** 4-3-3 : un milieu à trois et trois attaquants, dont deux ailiers. */
export class Formation433 extends FormationStrategy {
  /** @returns {string} */
  get name() {
    return '4-3-3';
  }

  /** @returns {Array<object>} */
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

/** 3-5-2 : trois défenseurs centraux, deux pistons et deux attaquants. */
export class Formation352 extends FormationStrategy {
  /** @returns {string} */
  get name() {
    return '3-5-2';
  }

  /** @returns {Array<object>} */
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

/** Formations disponibles, indexées par leur nom. */
export const FORMATIONS = Object.freeze(Object.fromEntries(
  [new Formation442(), new Formation433(), new Formation352()].map((formation) => [formation.name, formation]),
));

/**
 * Renvoie la stratégie correspondant à un nom de formation.
 * @param {string} name par exemple « 4-3-3 »
 * @returns {FormationStrategy}
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
 */
export function toPitchCoordinates(position, attacksPositiveX) {
  const direction = attacksPositiveX ? 1 : -1;
  return {
    x: direction * (position.x - 0.5) * PITCH_LENGTH,
    z: direction * (position.y - 0.5) * PITCH_WIDTH,
  };
}
