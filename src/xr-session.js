/**
 * Gestion des sessions WebXR immersive-ar (sprint 2, cahier §5.3).
 *
 * Enchaînement d'une entrée en AR :
 * 1. vérifier que WebXR existe et que le mode immersive-ar est pris en charge ;
 * 2. demander la session au navigateur (navigator.xr.requestSession) ;
 * 3. demander l'espace de référence local-floor, pour échouer tôt et clairement ;
 * 4. confier la session à three.js (renderer.xr.setSession) : il rend le contexte WebGL
 *    compatible XR, crée la couche de rendu XRWebGLLayer et cadence la boucle de rendu ;
 * 5. donner à three.js l'espace local-floor obtenu à l'étape 3.
 *
 * Le module signale le cycle de vie par des événements (patron Observer) : sessionstart,
 * sessionend et sessionerror. Il ne connaît ni l'interface HTML ni les objets de la scène :
 * c'est main.js qui s'abonne et met à jour l'affichage.
 */
import { EventEmitter } from './events.js';

/** Mode de session demandé au navigateur. */
const SESSION_MODE = 'immersive-ar';

/** Espace de référence : origine au sol, à l'endroit où se trouve l'utilisateur au départ. */
const REFERENCE_SPACE_TYPE = 'local-floor';

/** Causes d'échec transmises avec l'événement sessionerror. */
export const AR_ERROR_REASONS = Object.freeze({
  UNAVAILABLE: 'unavailable', // navigator.xr absent : navigateur sans WebXR ou page en HTTP
  UNSUPPORTED: 'unsupported', // WebXR présent, mais sans le mode immersive-ar
  REJECTED: 'rejected', // session refusée : autorisation de la caméra, ARCore absent…
  REFERENCE_SPACE: 'reference-space', // espace local-floor indisponible sur l'appareil
  LAYER: 'layer', // three.js n'a pas pu relier son rendu à la session
});

/**
 * Termine une session sans propager d'erreur, si elle est déjà terminée par exemple.
 * @param {XRSession} session
 * @returns {Promise<void>}
 */
async function endQuietly(session) {
  try {
    await session.end();
  } catch {
    // La session est déjà terminée : rien à faire.
  }
}

/**
 * Indique la couche de rendu que three.js a attachée à la session.
 * @param {XRSession} session
 * @returns {'XRWebGLLayer'|'XRProjectionLayer'|null}
 */
function describeLayer(session) {
  const { baseLayer, layers } = session.renderState ?? {};
  if (baseLayer) {
    return 'XRWebGLLayer';
  }
  return layers?.length ? 'XRProjectionLayer' : null;
}

/**
 * Session AR immersive, reliée au moteur de rendu three.js.
 *
 * Événements :
 * - sessionstart : { session, referenceSpace, layer, domOverlay } quand la session est prête ;
 * - sessionend : { session } quand elle se termine, par le bouton de l'application ou par le
 *   système (bouton retour du téléphone, par exemple), une fois le rendu de three.js restauré ;
 * - sessionerror : { reason, error } quand l'entrée en AR échoue ; aucune session ne reste ouverte.
 */
export class ArSession extends EventEmitter {
  #renderer;
  #getXr;
  #overlayRoot;
  #session = null;
  #referenceSpace = null;
  #pendingStart = null;
  #onRendererSessionEnd = () => this.#handleSessionEnd();

  /**
   * @param {object} options
   * @param {import('three').WebGLRenderer} options.renderer moteur de rendu, avec renderer.xr.enabled
   * @param {XRSystem} [options.xr] système WebXR ; par défaut navigator.xr, lu au moment de l'entrée
   *   en AR, car l'émulateur IWER le remplace après le chargement de la page
   * @param {HTMLElement} [options.overlayRoot] élément affiché par-dessus la vue AR (DOM Overlay)
   */
  constructor({ renderer, xr, overlayRoot = null }) {
    super();
    this.#renderer = renderer;
    this.#getXr = xr === undefined ? () => globalThis.navigator?.xr : () => xr;
    this.#overlayRoot = overlayRoot;
  }

  /** Vrai pendant une session AR. */
  get isActive() {
    return this.#session !== null;
  }

  /** Espace de référence local-floor de la session en cours, ou null. */
  get referenceSpace() {
    return this.#referenceSpace;
  }

  /**
   * Indique si le navigateur peut ouvrir une session immersive-ar.
   * @returns {Promise<boolean>}
   */
  async isSupported() {
    const xr = this.#getXr();
    if (!xr) {
      return false;
    }
    try {
      return await xr.isSessionSupported(SESSION_MODE);
    } catch {
      return false;
    }
  }

  /**
   * Entre en AR. Doit être appelé depuis une action de l'utilisateur (un clic) : le navigateur
   * refuse sinon la session. Un double clic ne lance qu'une seule demande.
   * @returns {Promise<XRSession|null>} la session, ou null en cas d'échec (voir sessionerror)
   */
  start() {
    if (this.#session) {
      return Promise.resolve(this.#session);
    }
    if (!this.#pendingStart) {
      this.#pendingStart = this.#open().finally(() => {
        this.#pendingStart = null;
      });
    }
    return this.#pendingStart;
  }

  /**
   * Quitte l'AR. L'événement sessionend suit, comme pour une sortie décidée par le système.
   * @returns {Promise<void>}
   */
  async end() {
    if (this.#session) {
      await endQuietly(this.#session);
    }
  }

  /**
   * Ouvre la session, étape par étape ; à la moindre erreur, la session est refermée.
   * @returns {Promise<XRSession|null>}
   */
  async #open() {
    const xr = this.#getXr();
    if (!xr) {
      return this.#fail(AR_ERROR_REASONS.UNAVAILABLE, new Error('WebXR est absent de ce navigateur.'));
    }
    if (!(await this.isSupported())) {
      return this.#fail(AR_ERROR_REASONS.UNSUPPORTED, new Error('Le mode immersive-ar n\'est pas pris en charge.'));
    }

    let session;
    try {
      session = await xr.requestSession(SESSION_MODE, this.#sessionInit());
    } catch (error) {
      return this.#fail(AR_ERROR_REASONS.REJECTED, error);
    }

    let referenceSpace;
    try {
      referenceSpace = await session.requestReferenceSpace(REFERENCE_SPACE_TYPE);
    } catch (error) {
      await endQuietly(session);
      return this.#fail(AR_ERROR_REASONS.REFERENCE_SPACE, error);
    }

    const xrManager = this.#renderer.xr;
    try {
      xrManager.setReferenceSpaceType(REFERENCE_SPACE_TYPE);
      // three.js : makeXRCompatible, puis XRWebGLLayer (ou couche de projection), puis boucle de rendu.
      await xrManager.setSession(session);
      // setSession réinitialise l'espace personnalisé : on donne le nôtre après.
      xrManager.setReferenceSpace(referenceSpace);
    } catch (error) {
      await endQuietly(session);
      return this.#fail(AR_ERROR_REASONS.LAYER, error);
    }

    this.#session = session;
    this.#referenceSpace = referenceSpace;
    xrManager.addEventListener('sessionend', this.#onRendererSessionEnd);
    this.emit('sessionstart', {
      session,
      referenceSpace,
      layer: describeLayer(session),
      domOverlay: session.domOverlayState?.type ?? null,
    });
    return session;
  }

  /**
   * Options de la session : local-floor obligatoire, DOM Overlay facultatif pour garder
   * les boutons HTML visibles en AR. Le hit test et les ancres arrivent au sprint 3.
   * @returns {XRSessionInit}
   */
  #sessionInit() {
    const sessionInit = { requiredFeatures: [REFERENCE_SPACE_TYPE] };
    if (this.#overlayRoot) {
      sessionInit.optionalFeatures = ['dom-overlay'];
      sessionInit.domOverlay = { root: this.#overlayRoot };
    }
    return sessionInit;
  }

  /**
   * Signale un échec d'entrée en AR.
   * @param {string} reason une valeur de AR_ERROR_REASONS
   * @param {Error} error
   * @returns {null}
   */
  #fail(reason, error) {
    this.emit('sessionerror', { reason, error });
    return null;
  }

  /**
   * Fin de session : three.js vient de restaurer son rendu (événement sessionend de renderer.xr),
   * l'application peut maintenant restaurer la vue 3D.
   */
  #handleSessionEnd() {
    const session = this.#session;
    this.#renderer.xr.removeEventListener('sessionend', this.#onRendererSessionEnd);
    this.#session = null;
    this.#referenceSpace = null;
    this.emit('sessionend', { session });
  }
}
