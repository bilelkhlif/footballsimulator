/**
 * Geste de rotation à deux doigts en AR (phase 6) : deux doigts posés sur l'écran qui tournent
 * l'un autour de l'autre font tourner le terrain posé du même angle, comme une feuille sur la table.
 *
 * Le module suit les pointeurs tactiles (événements pointer du DOM Overlay) et ne connaît ni
 * three.js ni WebXR : il rend un angle, que la vue AR applique (src/ar-view.mjs, rotateBy). Un
 * mouvement inférieur à ROTATION_DEAD_ZONE est ignoré : deux doigts posés sans tourner ne déplacent
 * rien. Pendant le geste, et un court instant après, les touchers WebXR (select) qu'il provoque ne
 * doivent pas devenir des actions tactiques : suppressesSelect le dit.
 *
 * Sens : à l'écran, l'axe y descend ; un geste dans le sens des aiguilles d'une montre, vu sur
 * l'écran au-dessus de la table, fait tourner le terrain dans ce sens vu du dessus, soit un angle
 * négatif autour de l'axe vertical (+y) de three.js.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/** Rotation minimale d'un geste avant d'agir, en radians (environ 3°). */
export const ROTATION_DEAD_ZONE = 0.05;

/** Délai après le geste pendant lequel les select WebXR restent ignorés, en millisecondes. */
export const SELECT_GRACE_MS = 400;

/** Pas des boutons de rotation, en radians (15°). */
export const ROTATION_STEP = Math.PI / 12;

/**
 * Différence d'angles ramenée entre -π et π.
 * @param {number} angle
 * @returns {number}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Réalité augmentée — rotation du terrain posé
 */
export function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Suivi du geste de rotation à deux doigts.
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Réalité augmentée — rotation du terrain posé
 */
export class TwistGesture {
  #onRotate;
  #now;
  /** @type {Map<number, {x: number, y: number}>} pointeurs tactiles posés */
  #pointers = new Map();
  #lastAngle = null;
  #started = false;
  #endedAt = -Infinity;

  /**
   * @param {object} options
   * @param {(radians: number) => void} options.onRotate rotation à appliquer au terrain, autour de +y
   * @param {() => number} [options.now] horloge en millisecondes (doublure des tests)
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Réalité augmentée — rotation du terrain posé
   */
  constructor({ onRotate, now = () => globalThis.performance?.now() ?? Date.now() }) {
    this.#onRotate = onRotate;
    this.#now = now;
  }

  /**
   * Vrai pendant un geste à deux doigts.
   * @returns {boolean}
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Réalité augmentée — rotation du terrain posé
   */
  get active() {
    return this.#pointers.size >= 2;
  }

  /**
   * Un doigt se pose.
   * @param {{pointerId: number, pointerType: string, clientX: number, clientY: number}} event
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Réalité augmentée — rotation du terrain posé
   */
  down({ pointerId, pointerType, clientX, clientY }) {
    if (pointerType !== 'touch') {
      return;
    }
    this.#pointers.set(pointerId, { x: clientX, y: clientY });
    this.#lastAngle = this.#angle();
    this.#started = false;
  }

  /**
   * Un doigt bouge : avec deux doigts, la rotation depuis la dernière mesure est appliquée, au-delà
   * de la zone morte du début du geste.
   * @param {{pointerId: number, clientX: number, clientY: number}} event
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Réalité augmentée — rotation du terrain posé
   */
  move({ pointerId, clientX, clientY }) {
    const pointer = this.#pointers.get(pointerId);
    if (!pointer) {
      return;
    }
    pointer.x = clientX;
    pointer.y = clientY;
    const angle = this.#angle();
    if (angle === null || this.#lastAngle === null) {
      this.#lastAngle = angle;
      return;
    }
    const delta = wrapAngle(angle - this.#lastAngle);
    if (!this.#started && Math.abs(delta) < ROTATION_DEAD_ZONE) {
      return;
    }
    this.#started = true;
    this.#lastAngle = angle;
    this.#onRotate(-delta);
  }

  /**
   * Un doigt se lève (ou le geste est interrompu).
   * @param {{pointerId: number}} event
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Réalité augmentée — rotation du terrain posé
   */
  up({ pointerId }) {
    const wasActive = this.active;
    this.#pointers.delete(pointerId);
    if (wasActive) {
      this.#endedAt = this.#now();
    }
    this.#lastAngle = this.#angle();
    this.#started = false;
  }

  /**
   * Vrai si un select WebXR vient du geste (pendant, ou juste après) : il ne doit rien faire.
   * @returns {boolean}
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Réalité augmentée — rotation du terrain posé
   */
  suppressesSelect() {
    return this.active || this.#now() - this.#endedAt < SELECT_GRACE_MS;
  }

  /**
   * Angle à l'écran de la droite entre les deux premiers doigts, ou null s'il n'y en a pas deux.
   * @returns {number|null}
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Réalité augmentée — rotation du terrain posé
   */
  #angle() {
    if (this.#pointers.size < 2) {
      return null;
    }
    const [a, b] = this.#pointers.values();
    return Math.atan2(b.y - a.y, b.x - a.x);
  }
}
