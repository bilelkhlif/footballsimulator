/**
 * Séquence tactique (sprint 6, bonus BF9 « animer une action pas à pas ») : une suite d'images
 * clés, chacune donnant la place des 22 joueurs et du ballon dans le repère du terrain.
 *
 * L'utilisateur place les joueurs, enregistre une image clé, les déplace, en enregistre une autre,
 * et ainsi de suite ; src/sequence-player.mjs joue ensuite l'action d'une image à la suivante. Les
 * images clés sont ajoutées et effacées par des commandes annulables (src/commands.mjs), comme les
 * autres actions.
 *
 * Événement :
 * - change : { length } après chaque ajout, retrait ou effacement.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { EventEmitter } from './events.mjs';

/** Nombre maximal d'images clés d'une séquence. */
export const MAX_KEYFRAMES = 12;

/**
 * Copie profonde d'une image clé.
 * @param {{players: Record<string, {x: number, z: number}>, ball: {x: number, z: number}}} keyframe
 * @returns {{players: Record<string, {x: number, z: number}>, ball: {x: number, z: number}}}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Logique métier — séquence animée (BF9)
 */
function copyKeyframe({ players, ball }) {
  return {
    players: Object.fromEntries(Object.entries(players).map(([key, { x, z }]) => [key, { x, z }])),
    ball: { x: ball.x, z: ball.z },
  };
}

/**
 * Suite d'images clés.
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Logique métier — séquence animée (BF9)
 */
export class TacticalSequence extends EventEmitter {
  /** @type {Array<{players: Record<string, {x: number, z: number}>, ball: {x: number, z: number}}>} */
  #keyframes = [];

  /**
   * Nombre d'images clés.
   * @returns {number}
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Logique métier — séquence animée (BF9)
   */
  get length() {
    return this.#keyframes.length;
  }

  /**
   * Copies des images clés, dans l'ordre.
   * @returns {Array<object>}
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Logique métier — séquence animée (BF9)
   */
  get keyframes() {
    return this.#keyframes.map(copyKeyframe);
  }

  /**
   * Ajoute une image clé à la fin.
   * @param {{players: Record<string, {x: number, z: number}>, ball: {x: number, z: number}}} keyframe
   * @throws {RangeError} si la séquence a déjà MAX_KEYFRAMES images
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Logique métier — séquence animée (BF9)
   */
  add(keyframe) {
    if (this.#keyframes.length >= MAX_KEYFRAMES) {
      throw new RangeError(`Séquence pleine : ${MAX_KEYFRAMES} images clés au plus`);
    }
    this.#keyframes.push(copyKeyframe(keyframe));
    this.#notify();
  }

  /**
   * Retire la dernière image clé.
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Logique métier — séquence animée (BF9)
   */
  removeLast() {
    if (this.#keyframes.pop()) {
      this.#notify();
    }
  }

  /**
   * Efface toutes les images clés.
   * @returns {Array<object>} les images effacées, pour les rétablir
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Logique métier — séquence animée (BF9)
   */
  clear() {
    const removed = this.#keyframes;
    this.#keyframes = [];
    this.#notify();
    return removed;
  }

  /**
   * Remplace les images clés (annulation d'un effacement).
   * @param {Array<object>} keyframes
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Logique métier — séquence animée (BF9)
   */
  restore(keyframes) {
    this.#keyframes = keyframes.map(copyKeyframe);
    this.#notify();
  }

  /**
   * Prévient les observateurs (lecteur, panneau) du nombre d'images clés.
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Logique métier — séquence animée (BF9)
   */
  #notify() {
    this.emit('change', { length: this.#keyframes.length });
  }
}
