/**
 * Saisie hors AR (sprint 5) : souris sur ordinateur, doigt sur écran tactile.
 *
 * Un toucher court et immobile est un « tap » : il devient un rayon depuis la caméra, à travers le
 * point touché, transmis à l'interaction tactique. Un glissé reste aux contrôles d'orbite (tourner,
 * zoomer) ; un geste à deux doigts (pincer) n'est jamais un tap. La souris survolant le terrain
 * guide l'aperçu d'une flèche en cours de tracé, ou de la place visée par un déplacement.
 *
 * Visée au doigt : quand une destination est attendue (joueur ou ballon sélectionné, arrivée d'une
 * flèche), un doigt posé sur le terrain montre l'aperçu jugé à l'endroit touché, le suit s'il glisse,
 * et le relâcher valide à l'endroit final, comme en AR où l'aperçu suit le doigt et le select part
 * au relâchement. Pendant ce choix, un doigt ne fait plus tourner la vue : src/main.mjs confie la
 * rotation aux gestes à deux doigts. Un second doigt interrompt la visée sans rien valider.
 *
 * Clic fantôme : après un tap au doigt, le navigateur synthétise un clic au même endroit. Le tap
 * vient de sélectionner un joueur et d'afficher sous le doigt « Désélectionner », « Point de vue » ou
 * « Personnaliser le joueur » : ce clic les déclencherait sans que personne les ait touchés. La fin
 * du toucher (touchend) est donc annulée quand le tap a été traité, ce qui supprime ce clic.
 *
 * Pendant une session AR, cette saisie se tait : c'est la session WebXR qui transmet les touchers
 * (src/xr-input.mjs). Le rayon et les coordonnées normalisées sont réutilisés d'un geste à l'autre.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';
import { pointerToNdc, setRayFromCamera } from './raycasting.mjs';

/** Déplacement maximal du pointeur pendant un tap, en pixels CSS. */
export const TAP_MAX_DISTANCE_PX = 8;

/** Durée maximale d'un tap, en millisecondes. */
export const TAP_MAX_DURATION_MS = 500;

/**
 * Indique si un appui puis un relâchement forment un tap : peu de mouvement, peu de temps.
 * @param {{x: number, y: number, time: number}} down appui
 * @param {{x: number, y: number, time: number}} up relâchement
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Saisie hors AR — reconnaissance du tap
 */
export function isTap(down, up) {
  return Math.hypot(up.x - down.x, up.y - down.y) <= TAP_MAX_DISTANCE_PX && up.time - down.time <= TAP_MAX_DURATION_MS;
}

/**
 * Saisie par pointeur sur le canvas de la vue 3D.
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Saisie hors AR — souris et écran tactile
 */
export class PointerInput {
  #element;
  #camera;
  #raycaster;
  #interaction;
  #isPresenting;
  #ndc = new THREE.Vector2();
  #down = null;
  /** Doigt qui vise une destination (identifiant du pointeur), ou null. */
  #aimingId = null;
  #activePointers = new Set();
  #attached = false;
  /** Vrai entre un tap au doigt traité et la fin de ce toucher : son clic synthétisé sera annulé. */
  #swallowClick = false;

  /**
   * @param {object} options
   * @param {HTMLElement} options.element canvas du moteur de rendu
   * @param {THREE.Camera} options.camera caméra de la vue 3D
   * @param {THREE.Raycaster} options.raycaster rayon réutilisé
   * @param {import('./tactical-interaction.mjs').TacticalInteraction} options.interaction
   * @param {() => boolean} [options.isPresenting] vrai pendant une session AR
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Saisie hors AR — souris et écran tactile
   */
  constructor({ element, camera, raycaster, interaction, isPresenting = () => false }) {
    this.#element = element;
    this.#camera = camera;
    this.#raycaster = raycaster;
    this.#interaction = interaction;
    this.#isPresenting = isPresenting;
  }

  /**
   * Commence à écouter le canvas.
   * @returns {PointerInput}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Saisie hors AR — souris et écran tactile
   */
  attach() {
    if (!this.#attached) {
      this.#element.addEventListener('pointerdown', this.#onPointerDown);
      this.#element.addEventListener('pointerup', this.#onPointerUp);
      this.#element.addEventListener('pointercancel', this.#onPointerCancel);
      this.#element.addEventListener('pointermove', this.#onPointerMove);
      this.#element.addEventListener('pointerleave', this.#onPointerLeave);
      this.#element.addEventListener('touchend', this.#onTouchEnd, { passive: false });
      this.#attached = true;
    }
    return this;
  }

  /**
   * Cesse d'écouter le canvas.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Saisie hors AR — souris et écran tactile
   */
  detach() {
    this.#element.removeEventListener('pointerdown', this.#onPointerDown);
    this.#element.removeEventListener('pointerup', this.#onPointerUp);
    this.#element.removeEventListener('pointercancel', this.#onPointerCancel);
    this.#element.removeEventListener('pointermove', this.#onPointerMove);
    this.#element.removeEventListener('pointerleave', this.#onPointerLeave);
    this.#element.removeEventListener('touchend', this.#onTouchEnd);
    this.#attached = false;
    this.#down = null;
    this.#aimingId = null;
    this.#swallowClick = false;
    this.#activePointers.clear();
  }

  /**
   * Vrai pendant une visée au doigt (destination montrée sous le doigt, validée au relâchement).
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Saisie hors AR — visée au doigt
   */
  get aiming() {
    return this.#aimingId !== null;
  }

  /**
   * Appui : début d'un tap possible ; un deuxième doigt l'annule (pincer pour zoomer), et
   * interrompt une visée. Un doigt posé quand une destination est attendue commence une visée.
   * @param {PointerEvent} event
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Saisie hors AR — souris et écran tactile
   */
  #onPointerDown = (event) => {
    this.#activePointers.add(event.pointerId);
    this.#swallowClick = false;
    if (this.#isPresenting() || this.#activePointers.size > 1 || event.button > 0) {
      this.#down = null;
      this.#stopAiming();
      return;
    }
    this.#down = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
    if (event.pointerType !== 'mouse' && this.#interaction.wantsHover) {
      this.#aimingId = event.pointerId;
      this.#castFrom(event);
      this.#interaction.hover(this.#raycaster);
    }
  };

  /**
   * Relâchement : un tap devient un rayon, transmis à l'interaction tactique.
   * @param {PointerEvent} event
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Saisie hors AR — souris et écran tactile
   */
  #onPointerUp = (event) => {
    this.#activePointers.delete(event.pointerId);
    const down = this.#down;
    this.#down = null;
    if (!down || down.id !== event.pointerId || this.#isPresenting()) {
      return;
    }
    if (this.#aimingId === event.pointerId) {
      // Fin d'une visée : la destination est celle sous le doigt au relâchement, glissé compris.
      this.#aimingId = null;
      this.#castFrom(event);
      this.#interaction.handleTap(this.#raycaster);
      this.#interaction.hover(null);
      this.#swallowClick = event.pointerType === 'touch';
      return;
    }
    if (isTap(down, { x: event.clientX, y: event.clientY, time: event.timeStamp })) {
      this.#castFrom(event);
      this.#interaction.handleTap(this.#raycaster);
      this.#swallowClick = event.pointerType === 'touch';
    }
  };

  /**
   * Fin d'un toucher : si ce toucher était un tap traité, annule le clic que le navigateur
   * synthétiserait ensuite à cet endroit, sur ce que le tap vient d'afficher sous le doigt.
   * @param {TouchEvent} event
   * @responsable Bilel Khlif
   * @date 2026-11-26
   * @role Saisie hors AR — suppression du clic fantôme après un tap
   */
  #onTouchEnd = (event) => {
    if (this.#swallowClick && event.cancelable) {
      event.preventDefault();
    }
    this.#swallowClick = false;
  };

  /**
   * Geste interrompu par le navigateur : pas de tap.
   * @param {PointerEvent} event
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Saisie hors AR — souris et écran tactile
   */
  #onPointerCancel = (event) => {
    this.#activePointers.delete(event.pointerId);
    this.#down = null;
    this.#stopAiming();
  };

  /**
   * Survol à la souris, ou doigt qui vise : guide l'aperçu de la destination.
   * @param {PointerEvent} event
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Saisie hors AR — souris et écran tactile
   */
  #onPointerMove = (event) => {
    const aimingFinger = this.#aimingId === event.pointerId;
    if ((event.pointerType !== 'mouse' && !aimingFinger) || this.#isPresenting() || !this.#interaction.wantsHover) {
      return;
    }
    this.#castFrom(event);
    this.#interaction.hover(this.#raycaster);
  };

  /**
   * Souris sortie du canvas : plus d'aperçu.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Saisie hors AR — souris et écran tactile
   */
  #onPointerLeave = () => {
    if (!this.#isPresenting()) {
      this.#interaction.hover(null);
    }
  };

  /**
   * Interrompt une visée sans rien valider, et efface l'aperçu.
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Saisie hors AR — visée au doigt
   */
  #stopAiming() {
    if (this.#aimingId !== null) {
      this.#aimingId = null;
      this.#interaction.hover(null);
    }
  }

  /**
   * Oriente le rayon depuis la caméra, à travers la position du pointeur.
   * @param {PointerEvent} event
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Saisie hors AR — souris et écran tactile
   */
  #castFrom(event) {
    pointerToNdc(event.clientX, event.clientY, this.#element.getBoundingClientRect(), this.#ndc);
    setRayFromCamera(this.#raycaster, this.#ndc, this.#camera);
  }
}
