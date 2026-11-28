/**
 * Séquence tactique (sprint 6, bonus BF9 « animer une action pas à pas ») : une suite d'images
 * clés, chacune donnant la place des 22 joueurs et du ballon dans le repère du terrain.
 *
 * L'utilisateur place les joueurs, enregistre une image clé, les déplace, en enregistre une autre,
 * et ainsi de suite ; src/sequence-player.mjs joue ensuite l'action d'une image à la suivante. Les
 * images clés sont ajoutées et effacées par des commandes annulables (src/commands.mjs), comme les
 * autres actions.
 *
 * Phase 6 : chaque image clé peut porter une note de l'entraîneur (« Le 6 décroche entre les
 * centraux »), affichée pendant la lecture. La note est facultative : une image sans note n'a pas
 * de champ « note », et une séquence enregistrée avant la phase 6 reste valable.
 *
 * Événement :
 * - change : { length } après chaque ajout, retrait, effacement ou changement de note.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { EventEmitter } from './events.mjs';

/** Nombre maximal d'images clés d'une séquence. */
export const MAX_KEYFRAMES = 12;

/** Longueur maximale de la note d'une image clé, en caractères : une phrase lisible sur le terrain. */
export const MAX_NOTE_LENGTH = 120;

/**
 * Note d'image clé nettoyée : caractères de contrôle retirés, espaces resserrés, longueur bornée.
 * Rend une chaîne vide si rien ne reste (pas de note).
 * @param {unknown} note
 * @returns {string}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Logique métier — séquence animée : notes de l'entraîneur
 */
export function normalizeKeyframeNote(note) {
  if (typeof note !== 'string') {
    return '';
  }
  return note.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_LENGTH).trim();
}

/**
 * Copie profonde d'une image clé.
 * @param {{players: Record<string, {x: number, z: number}>, ball: {x: number, z: number}}} keyframe
 * @returns {{players: Record<string, {x: number, z: number}>, ball: {x: number, z: number}}}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Logique métier — séquence animée (BF9)
 */
function copyKeyframe({ players, ball, note }) {
  const copy = {
    players: Object.fromEntries(Object.entries(players).map(([key, { x, z }]) => [key, { x, z }])),
    ball: { x: ball.x, z: ball.z },
  };
  // Note de l'entraîneur (phase 6) : gardée seulement si elle n'est pas vide.
  const clean = normalizeKeyframeNote(note);
  if (clean) {
    copy.note = clean;
  }
  return copy;
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
   * Note de l'entraîneur d'une image clé, ou chaîne vide si elle n'en a pas.
   * @param {number} index position de l'image, à partir de 0
   * @returns {string}
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Logique métier — séquence animée : notes de l'entraîneur
   */
  noteAt(index) {
    return this.#require(index).note ?? '';
  }

  /**
   * Écrit (ou efface, avec une note vide) la note d'une image clé ; les places ne changent pas.
   * @param {number} index position de l'image, à partir de 0
   * @param {string} note texte libre, nettoyé par normalizeKeyframeNote
   * @returns {boolean} faux si la note ne change pas
   * @throws {RangeError} si l'image n'existe pas
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Logique métier — séquence animée : notes de l'entraîneur
   */
  setNote(index, note) {
    const keyframe = this.#require(index);
    const clean = normalizeKeyframeNote(note);
    if (clean === (keyframe.note ?? '')) {
      return false;
    }
    if (clean) {
      keyframe.note = clean;
    } else {
      delete keyframe.note;
    }
    this.#notify();
    return true;
  }

  /**
   * Image clé à une position ; erreur si elle n'existe pas.
   * @param {number} index
   * @returns {object}
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Logique métier — séquence animée : notes de l'entraîneur
   */
  #require(index) {
    const keyframe = Number.isInteger(index) ? this.#keyframes[index] : undefined;
    if (!keyframe) {
      throw new RangeError(`Image clé inconnue : ${index}`);
    }
    return keyframe;
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
