/**
 * Panneau flottant du terrain 3D, posé sur la vidéo : déplaçable par sa barre, redimensionnable
 * par son coin, réductible en bouton, verrouillable.
 *
 * Le panneau reste toujours dans la zone de la vidéo (clampRect). Un déplacement à la main
 * (événement « usermove ») coupe le placement automatique : l'utilisateur garde la main.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { EventEmitter } from '../events.js';

/** Taille minimale du panneau, en pixels CSS. */
export const MIN_PANEL_SIZE = Object.freeze({ width: 200, height: 140 });

/** Durée de l'animation d'un déplacement automatique, en millisecondes. */
export const MOVE_ANIMATION_MS = 450;

/**
 * Garde un rectangle dans une zone, à une taille comprise entre le minimum et la zone entière.
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @param {{x: number, y: number, width: number, height: number}} area
 * @param {{width: number, height: number}} [min]
 * @returns {{x: number, y: number, width: number, height: number}}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — panneau du terrain 3D
 */
export function clampRect(rect, area, min = MIN_PANEL_SIZE) {
  const width = Math.min(Math.max(rect.width, min.width), area.width);
  const height = Math.min(Math.max(rect.height, min.height), area.height);
  const x = Math.min(Math.max(rect.x, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(rect.y, area.y), area.y + area.height - height);
  return { x, y, width, height };
}

/**
 * Panneau flottant, piloté au pointeur (souris, doigt, stylet).
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — panneau du terrain 3D
 */
export class OverlayFrame extends EventEmitter {
  #element;
  #rect = { x: 0, y: 0, width: 0, height: 0 };
  #area = { x: 0, y: 0, width: 0, height: 0 };
  #gesture = null;

  /**
   * @param {object} options
   * @param {HTMLElement} options.element panneau, positionné en absolu dans la scène
   * @param {HTMLElement} options.handle barre de déplacement
   * @param {HTMLElement} options.resizeHandle poignée de redimensionnement
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — panneau du terrain 3D
   */
  constructor({ element, handle, resizeHandle }) {
    super();
    this.#element = element;
    this.locked = false;
    this.minimized = false;
    handle.addEventListener('pointerdown', (event) => this.#start(event, 'move'));
    resizeHandle.addEventListener('pointerdown', (event) => this.#start(event, 'resize'));
    element.addEventListener('pointermove', (event) => this.#continue(event));
    element.addEventListener('pointerup', (event) => this.#end(event));
    element.addEventListener('pointercancel', (event) => this.#end(event));
  }

  /**
   * Position et taille actuelles, en pixels CSS dans la scène.
   * @returns {{x: number, y: number, width: number, height: number}}
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — panneau du terrain 3D
   */
  get rect() {
    return { ...this.#rect };
  }

  /**
   * Fixe la zone où le panneau doit rester (l'image de la vidéo), et l'y ramène.
   * @param {{x: number, y: number, width: number, height: number}} area
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — panneau du terrain 3D
   */
  setArea(area) {
    this.#area = { ...area };
    this.setRect(this.#rect);
  }

  /**
   * Place le panneau.
   * @param {{x: number, y: number, width: number, height: number}} rect
   * @param {{animate?: boolean}} [options] animation douce (placement automatique)
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — panneau du terrain 3D
   */
  setRect(rect, { animate = false } = {}) {
    const next = clampRect(rect, this.#area);
    const resized = next.width !== this.#rect.width || next.height !== this.#rect.height;
    this.#rect = next;
    const style = this.#element.style;
    this.#element.classList.toggle('vz-panel--animating', animate);
    style.left = `${next.x}px`;
    style.top = `${next.y}px`;
    style.width = `${next.width}px`;
    style.height = `${next.height}px`;
    if (resized) {
      this.emit('resize', this.rect);
    }
  }

  /**
   * Verrouille ou déverrouille le panneau : verrouillé, il ne bouge plus, ni à la main ni seul.
   * @param {boolean} locked
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — panneau du terrain 3D
   */
  setLocked(locked) {
    this.locked = locked;
    this.#element.classList.toggle('vz-panel--locked', locked);
    this.emit('lock', locked);
  }

  /**
   * Réduit le panneau en bouton, ou le rouvre.
   * @param {boolean} minimized
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — panneau du terrain 3D
   */
  setMinimized(minimized) {
    this.minimized = minimized;
    this.#element.hidden = minimized;
    this.emit('minimize', minimized);
  }

  /**
   * Début d'un geste sur la barre ou la poignée.
   * @param {PointerEvent} event
   * @param {'move'|'resize'} kind
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — panneau du terrain 3D
   */
  #start(event, kind) {
    if (this.locked || event.button > 0 || event.target.closest('button')) {
      return;
    }
    event.preventDefault();
    this.#element.setPointerCapture(event.pointerId);
    this.#gesture = { kind, pointerId: event.pointerId, x: event.clientX, y: event.clientY, rect: this.rect };
  }

  /**
   * Suit le geste en cours : déplacement ou redimensionnement.
   * @param {PointerEvent} event
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — panneau du terrain 3D
   */
  #continue(event) {
    const gesture = this.#gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const { rect } = gesture;
    if (gesture.kind === 'move') {
      this.setRect({ ...rect, x: rect.x + dx, y: rect.y + dy });
    } else {
      this.setRect({ ...rect, width: rect.width + dx, height: rect.height + dy });
    }
  }

  /**
   * Fin du geste : prévient que l'utilisateur a placé le panneau lui-même.
   * @param {PointerEvent} event
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — panneau du terrain 3D
   */
  #end(event) {
    const gesture = this.#gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    this.#gesture = null;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 2) {
      this.emit('usermove', { kind: gesture.kind, rect: this.rect });
    }
  }
}
