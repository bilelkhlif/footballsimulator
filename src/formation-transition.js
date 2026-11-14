/**
 * Transition d'une formation à l'autre (sprint 4) : chaque joueur glisse vers sa nouvelle place.
 *
 * Les joueurs sont reconnus par leur numéro : le numéro 9 de l'ancienne formation va à la place
 * du numéro 9 de la nouvelle. Le déplacement dure 0,7 s, avec une accélération puis une
 * décélération douces. Il est calculé à chaque image par la boucle de rendu, en 3D comme en AR,
 * dans le repère du terrain (pitchGroup) : il suit donc le terrain posé sur la table.
 * Si l'utilisateur demande moins d'animations (prefers-reduced-motion), les joueurs vont
 * directement à leur place.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { toPitchCoordinates } from './formations.js';

/** Durée d'une transition de formation, en millisecondes. */
export const TRANSITION_DURATION_MS = 700;

/**
 * Courbe d'accélération puis de décélération (cubique).
 * @param {number} t avancement, de 0 à 1
 * @returns {number} position relative, de 0 à 1
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Scène 3D — animation des changements de formation
 */
export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

/**
 * Places d'une équipe dans une formation, dans le repère du terrain.
 * @param {import('./formations.js').FormationStrategy} formation
 * @param {boolean} attacksPositiveX sens d'attaque de l'équipe
 * @returns {Map<number, {x: number, z: number, role: string}>} numéro → place et poste
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Scène 3D — animation des changements de formation
 */
export function computeTeamTargets(formation, attacksPositiveX) {
  const targets = new Map();
  for (const position of formation.computePositions()) {
    const { x, z } = toPitchCoordinates(position, attacksPositiveX);
    targets.set(position.number, { x, z, role: position.role });
  }
  return targets;
}

/**
 * Animateur des déplacements sur le terrain, mis à jour à chaque image par la boucle de rendu.
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Scène 3D — animation des changements de formation
 */
export class FormationAnimator {
  /** @type {Map<object, {from: {x: number, z: number}, to: {x: number, z: number}, start: number, duration: number}>} */
  #moves = new Map();
  #duration;
  #now;

  /**
   * @param {object} [options]
   * @param {number} [options.duration] durée par défaut, en millisecondes (0 : sans animation)
   * @param {() => number} [options.now] horloge en millisecondes ; remplacée dans les tests
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Scène 3D — animation des changements de formation
   */
  constructor({ duration = TRANSITION_DURATION_MS, now = () => performance.now() } = {}) {
    this.#duration = duration;
    this.#now = now;
  }

  /**
   * Vrai tant qu'un déplacement est en cours.
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Scène 3D — animation des changements de formation
   */
  get isAnimating() {
    return this.#moves.size > 0;
  }

  /**
   * Déplace un objet (un joueur) vers une place du terrain, sans changer sa hauteur. Un
   * déplacement déjà en cours repart de la position actuelle : un nouveau choix de formation
   * pendant une transition ne fait pas sauter les joueurs.
   * @param {{position: {x: number, z: number}}} object
   * @param {{x: number, z: number}} target
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Scène 3D — animation des changements de formation
   */
  moveTo(object, target) {
    if (this.#duration <= 0) {
      object.position.x = target.x;
      object.position.z = target.z;
      this.#moves.delete(object);
      return;
    }
    this.#moves.set(object, {
      from: { x: object.position.x, z: object.position.z },
      to: { x: target.x, z: target.z },
      start: this.#now(),
      duration: this.#duration,
    });
  }

  /**
   * Fait avancer les déplacements en cours ; appelée à chaque image.
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Scène 3D — animation des changements de formation
   */
  update() {
    const now = this.#now();
    for (const [object, move] of this.#moves) {
      const progress = Math.min(1, Math.max(0, (now - move.start) / move.duration));
      if (progress >= 1) {
        // Dernière image : la place exacte, sans erreur d'arrondi.
        object.position.x = move.to.x;
        object.position.z = move.to.z;
        this.#moves.delete(object);
        continue;
      }
      const eased = easeInOutCubic(progress);
      object.position.x = move.from.x + (move.to.x - move.from.x) * eased;
      object.position.z = move.from.z + (move.to.z - move.from.z) * eased;
    }
  }
}
