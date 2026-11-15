/**
 * Saisie en réalité augmentée (sprint 5) : les touchers de la session WebXR deviennent des rayons.
 *
 * Un toucher sur l'écran du téléphone produit l'événement select de la session. Son XRFrame
 * (event.frame), valable pendant l'événement, donne la pose du rayon de la source d'entrée :
 * frame.getPose(event.inputSource.targetRaySpace, espace local-floor). Sur un téléphone (mode
 * « screen »), ce rayon part de la caméra et passe par le point touché ; avec une manette
 * (« tracked-pointer »), il part de la manette. Le même code sert aux deux.
 *
 * Pose du terrain et interaction tactique sont séparées : routeXrSelect envoie un toucher à la
 * pose du terrain tant qu'il n'est pas posé, puis à l'interaction tactique. Un même toucher ne fait
 * jamais les deux. Les touchers sur l'interface HTML (DOM Overlay) sont arrêtés avant par
 * l'événement beforexrselect (src/main.js).
 *
 * À chaque image, pendant le tracé d'une flèche, une source d'entrée guide l'aperçu : celle qui a
 * posé le départ de la flèche (une manette, suivie en continu), sinon un doigt qui touche l'écran
 * (source « screen », qui n'existe que pendant le toucher). Une autre manette, qui vise ailleurs,
 * ne le guide pas.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { setRayFromXrPose } from './raycasting.js';

/** Destinations possibles d'un toucher en AR. */
export const SELECT_ROUTES = Object.freeze({ PLACEMENT: 'placement', TACTICS: 'tactics', IGNORED: 'ignored' });

/**
 * Choisit la destination d'un toucher en AR : la pose du terrain tant qu'il n'est pas posé,
 * l'interaction tactique ensuite.
 * @param {{pitchReady: boolean}|null} placement pose du terrain de la session (src/ar-surface.js)
 * @returns {string} une valeur de SELECT_ROUTES
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Saisie en AR — séparation pose du terrain / interaction tactique
 */
export function routeXrSelect(placement) {
  if (!placement) {
    return SELECT_ROUTES.IGNORED;
  }
  return placement.pitchReady ? SELECT_ROUTES.TACTICS : SELECT_ROUTES.PLACEMENT;
}

/**
 * Saisie tactique d'une session AR. Une instance par session, arrêtée à sa fin.
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Saisie en AR — rayon de la source d'entrée (targetRaySpace)
 */
export class XrTacticalInput {
  #session;
  #referenceSpace;
  #interaction;
  #raycaster;
  #lastSource = null;

  /**
   * @param {object} options
   * @param {XRSession} options.session
   * @param {XRReferenceSpace} options.referenceSpace espace local-floor, aussi donné à three.js
   * @param {import('./tactical-interaction.js').TacticalInteraction} options.interaction
   * @param {import('three').Raycaster} options.raycaster rayon réutilisé
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Saisie en AR — rayon de la source d'entrée (targetRaySpace)
   */
  constructor({ session, referenceSpace, interaction, raycaster }) {
    this.#session = session;
    this.#referenceSpace = referenceSpace;
    this.#interaction = interaction;
    this.#raycaster = raycaster;
  }

  /**
   * Vrai jusqu'à stop().
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Saisie en AR — rayon de la source d'entrée (targetRaySpace)
   */
  get active() {
    return this.#session !== null;
  }

  /**
   * Traite un toucher (événement select) : rayon de sa source d'entrée, puis interaction tactique.
   * @param {XRInputSourceEvent} event
   * @returns {boolean} vrai si le rayon a été transmis
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Saisie en AR — rayon de la source d'entrée (targetRaySpace)
   */
  handleSelect(event) {
    if (!this.active || !event?.frame || !event.inputSource) {
      return false;
    }
    const pose = event.frame.getPose(event.inputSource.targetRaySpace, this.#referenceSpace);
    if (!pose) {
      return false; // suivi perdu à cet instant : le toucher ne vise rien
    }
    this.#lastSource = event.inputSource;
    setRayFromXrPose(this.#raycaster, pose.transform);
    this.#interaction.handleTap(this.#raycaster);
    return true;
  }

  /**
   * Travail d'une image : pendant le tracé d'une flèche, l'aperçu suit la source qui a posé le
   * départ, si elle est encore là ; sinon un doigt qui touche l'écran. Boucle indexée : pas
   * d'itérateur créé à chaque image.
   * @param {XRFrame} frame
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Saisie en AR — aperçu des flèches
   */
  update(frame) {
    if (!this.active || !frame || !this.#interaction.wantsHover) {
      return;
    }
    const sources = this.#session.inputSources;
    let guide = null;
    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index];
      if (source === this.#lastSource) {
        guide = source;
        break;
      }
      if (!guide && source.targetRayMode === 'screen') {
        guide = source;
      }
    }
    const pose = guide ? frame.getPose(guide.targetRaySpace, this.#referenceSpace) : null;
    if (pose) {
      setRayFromXrPose(this.#raycaster, pose.transform);
      this.#interaction.hover(this.#raycaster);
    } else {
      this.#interaction.hover(null);
    }
  }

  /**
   * Fin de session : la saisie se tait, l'aperçu disparaît, et les références à la session et à
   * son espace sont lâchées.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Saisie en AR — rayon de la source d'entrée (targetRaySpace)
   */
  stop() {
    this.#session = null;
    this.#referenceSpace = null;
    this.#lastSource = null;
    this.#interaction.hover(null);
  }
}
