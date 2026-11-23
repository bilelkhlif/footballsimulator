/**
 * Pose du terrain sur une surface réelle (sprint 3, cahier §5.3) : hit test, réticule, toucher
 * pour poser, ancre.
 *
 * À chaque image de la session, le hit test WebXR lance un rayon depuis le centre de l'écran
 * (espace « viewer ») et renvoie le point où il rencontre une surface réelle détectée par ARCore.
 * Le réticule s'y affiche ; un toucher sur l'écran (événement select) y pose le terrain. Une ancre
 * WebXR est alors créée à la pose du terrain : le système de suivi la recale quand sa
 * connaissance de la pièce s'améliore, et le terrain la suit sans dériver.
 *
 * Sans hit test (appareil ou navigateur qui ne le propose pas), le terrain est placé devant
 * l'utilisateur, comme au sprint 2. Sans ancres, il reste à sa pose dans l'espace local-floor.
 *
 * États, signalés par l'événement statechange (patron Observer) :
 * - searching : hit test actif, aucune surface sous le réticule ;
 * - surface : une surface est visée, un toucher y pose le terrain ;
 * - placed : terrain posé (anchored indique s'il est ancré) ;
 * - in-front : pas de hit test, terrain placé devant l'utilisateur.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { EventEmitter } from './events.mjs';
import { computeSurfacePlacement, yawToQuaternion } from './ar-placement.mjs';

/** États de la pose du terrain. */
export const PLACEMENT_STATES = Object.freeze({
  SEARCHING: 'searching',
  SURFACE: 'surface',
  PLACED: 'placed',
  IN_FRONT: 'in-front',
});

/**
 * Supprime une ancre sans propager d'erreur (session déjà terminée, par exemple).
 * @param {XRAnchor|null} anchor
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Réalité augmentée — hit test, pose et ancrage du terrain
 */
function deleteQuietly(anchor) {
  try {
    anchor?.delete();
  } catch {
    // L'ancre n'existe déjà plus : rien à faire.
  }
}

/**
 * Pose du terrain pour une session AR. Une instance par session : main.mjs la crée à l'événement
 * sessionstart et l'arrête à sessionend.
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Réalité augmentée — hit test, pose et ancrage du terrain
 */
export class SurfacePlacement extends EventEmitter {
  #session;
  #referenceSpace;
  #view;
  #createRigidTransform;
  #hitTestSource = null;
  #state = null;
  #placementRequested = false;
  #anchor = null;
  #anchorGeneration = 0;
  #stopped = false;

  /**
   * @param {object} options
   * @param {XRSession} options.session
   * @param {XRReferenceSpace} options.referenceSpace espace local-floor de la session
   * @param {ReturnType<typeof import('./ar-view.mjs').createArView>} options.view vue AR de la scène
   * @param {(position: object, orientation: object) => XRRigidTransform} [options.createRigidTransform]
   *   fabrique de poses WebXR ; par défaut new XRRigidTransform, remplacée dans les tests
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Réalité augmentée — hit test, pose et ancrage du terrain
   */
  constructor({ session, referenceSpace, view, createRigidTransform = (position, orientation) => new XRRigidTransform(position, orientation) }) {
    super();
    this.#session = session;
    this.#referenceSpace = referenceSpace;
    this.#view = view;
    this.#createRigidTransform = createRigidTransform;
  }

  /**
   * État courant : une valeur de PLACEMENT_STATES, ou null avant start().
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Réalité augmentée — hit test, pose et ancrage du terrain
   */
  get state() {
    return this.#state;
  }

  /**
   * Vrai quand le terrain posé suit une ancre WebXR.
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Réalité augmentée — hit test, pose et ancrage du terrain
   */
  get anchored() {
    return this.#anchor !== null;
  }

  /**
   * Vrai quand le terrain est affiché à sa place, posé sur la surface ou devant l'utilisateur : les
   * touchers vont alors à l'interaction tactique (sprint 5), et non plus à la pose du terrain.
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Réalité augmentée — séparation pose du terrain / interaction tactique
   */
  get pitchReady() {
    if (this.#state === PLACEMENT_STATES.PLACED) {
      return true;
    }
    return this.#state === PLACEMENT_STATES.IN_FRONT && !this.#view.needsPlacement;
  }

  /**
   * Démarre le hit test depuis le centre de l'écran. Sans hit test, passe en placement devant
   * l'utilisateur.
   * @returns {Promise<void>}
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Réalité augmentée — hit test, pose et ancrage du terrain
   */
  async start() {
    const features = this.#session.enabledFeatures;
    if (Array.isArray(features) && !features.includes('hit-test')) {
      this.#setState(PLACEMENT_STATES.IN_FRONT);
      return;
    }
    try {
      // Espace « viewer » : le rayon part du téléphone, dans la direction du regard.
      const viewerSpace = await this.#session.requestReferenceSpace('viewer');
      const source = await this.#session.requestHitTestSource({ space: viewerSpace });
      if (this.#stopped) {
        source.cancel();
        return;
      }
      this.#hitTestSource = source;
      this.#setState(PLACEMENT_STATES.SEARCHING);
    } catch (error) {
      console.warn('Hit test indisponible : terrain placé devant l’utilisateur.', error);
      this.#setState(PLACEMENT_STATES.IN_FRONT);
    }
  }

  /**
   * Demande la pose du terrain au prochain rendu (toucher sur l'écran). Sans effet si aucune
   * surface n'est visée : le toucher ne pose rien dans le vide.
   * @returns {boolean} vrai si la demande est prise en compte
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Réalité augmentée — hit test, pose et ancrage du terrain
   */
  requestPlacement() {
    if (this.#state !== PLACEMENT_STATES.SURFACE) {
      return false;
    }
    this.#placementRequested = true;
    return true;
  }

  /**
   * Retire le terrain pour le poser ailleurs : l'ancre est supprimée, le réticule revient.
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Réalité augmentée — hit test, pose et ancrage du terrain
   */
  startOver() {
    if (this.#state !== PLACEMENT_STATES.PLACED) {
      return;
    }
    this.#releaseAnchor();
    this.#view.liftPitch();
    this.#setState(PLACEMENT_STATES.SEARCHING);
  }

  /**
   * Travail d'une image de la session, appelé par la boucle de rendu avec le XRFrame actif.
   * @param {XRFrame} frame
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Réalité augmentée — hit test, pose et ancrage du terrain
   */
  update(frame) {
    switch (this.#state) {
      case PLACEMENT_STATES.IN_FRONT:
        this.#placeInFrontOnce(frame);
        break;
      case PLACEMENT_STATES.SEARCHING:
      case PLACEMENT_STATES.SURFACE:
        this.#aim(frame);
        break;
      case PLACEMENT_STATES.PLACED:
        this.#followAnchor(frame);
        break;
      default:
        break; // hit test en cours de démarrage
    }
  }

  /**
   * Arrête le hit test et supprime l'ancre, à la fin de la session.
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Réalité augmentée — hit test, pose et ancrage du terrain
   */
  stop() {
    this.#stopped = true;
    try {
      this.#hitTestSource?.cancel();
    } catch {
      // Source déjà annulée avec la session.
    }
    this.#hitTestSource = null;
    this.#releaseAnchor();
  }

  /**
   * Sans hit test : place le terrain devant l'utilisateur dès que sa pose est connue.
   * @param {XRFrame} frame
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Réalité augmentée — hit test, pose et ancrage du terrain
   */
  #placeInFrontOnce(frame) {
    if (!this.#view.needsPlacement) {
      return;
    }
    // Pose du téléphone ; null tant que le suivi n'est pas établi.
    const viewerPose = frame.getViewerPose(this.#referenceSpace);
    if (viewerPose) {
      this.#view.placeInFront(viewerPose.transform);
    }
  }

  /**
   * Avec hit test : déplace le réticule sur la surface visée, et pose le terrain si l'utilisateur
   * vient de toucher l'écran.
   * @param {XRFrame} frame
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Réalité augmentée — hit test, pose et ancrage du terrain
   */
  #aim(frame) {
    if (!this.#hitTestSource) {
      return;
    }
    // Résultats triés du plus proche au plus lointain : on garde le premier.
    const [hit] = frame.getHitTestResults(this.#hitTestSource);
    const hitPose = hit?.getPose(this.#referenceSpace) ?? null;
    this.#view.showReticle(hitPose?.transform ?? null);
    this.#setState(hitPose ? PLACEMENT_STATES.SURFACE : PLACEMENT_STATES.SEARCHING);

    if (!this.#placementRequested) {
      return;
    }
    this.#placementRequested = false;
    const viewerPose = frame.getViewerPose(this.#referenceSpace);
    if (!hitPose || !viewerPose) {
      return;
    }
    const placement = computeSurfacePlacement(hitPose.transform.position, viewerPose.transform.position);
    this.#view.placeAt(placement);
    this.#setState(PLACEMENT_STATES.PLACED);
    this.#createAnchor(frame, placement);
  }

  /**
   * Crée une ancre à la pose du terrain. createAnchor n'est valable que pendant l'image active :
   * c'est pourquoi le toucher ne pose pas le terrain tout de suite, mais à l'image suivante.
   * @param {XRFrame} frame
   * @param {{position: {x: number, y: number, z: number}, rotationY: number}} placement
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Réalité augmentée — hit test, pose et ancrage du terrain
   */
  #createAnchor(frame, placement) {
    if (typeof frame.createAnchor !== 'function') {
      return; // navigateur sans ancres : le terrain reste à sa pose dans local-floor
    }
    const generation = ++this.#anchorGeneration;
    const pose = this.#createRigidTransform(placement.position, yawToQuaternion(placement.rotationY));
    frame.createAnchor(pose, this.#referenceSpace)
      .then((anchor) => {
        // Le terrain a pu être déplacé, ou la session arrêtée, pendant la création de l'ancre.
        if (generation !== this.#anchorGeneration || this.#stopped || this.#state !== PLACEMENT_STATES.PLACED) {
          deleteQuietly(anchor);
          return;
        }
        this.#anchor = anchor;
        this.#emitState();
      })
      .catch((error) => {
        // Ancres refusées (fonctionnalité non accordée) : le terrain reste posé, sans ancre.
        console.warn('Ancre WebXR indisponible : le terrain reste à sa pose.', error);
      });
  }

  /**
   * Terrain posé : suit la pose de son ancre, tant que le système la suit.
   * @param {XRFrame} frame
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Réalité augmentée — hit test, pose et ancrage du terrain
   */
  #followAnchor(frame) {
    const anchor = this.#anchor;
    if (!anchor || !frame.trackedAnchors?.has(anchor)) {
      return; // ancre perdue un instant : le terrain garde sa dernière pose
    }
    const anchorPose = frame.getPose(anchor.anchorSpace, this.#referenceSpace);
    if (anchorPose) {
      this.#view.followAnchor(anchorPose.transform);
    }
  }

  /**
   * Supprime l'ancre en cours, et invalide celle qui serait encore en création.
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Réalité augmentée — hit test, pose et ancrage du terrain
   */
  #releaseAnchor() {
    this.#anchorGeneration += 1;
    deleteQuietly(this.#anchor);
    this.#anchor = null;
  }

  /**
   * Change d'état et prévient les observateurs, seulement si l'état change.
   * @param {string} state une valeur de PLACEMENT_STATES
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Réalité augmentée — hit test, pose et ancrage du terrain
   */
  #setState(state) {
    if (state === this.#state) {
      return;
    }
    this.#state = state;
    this.#emitState();
  }

  /**
   * Prévient les observateurs de l'état courant.
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Réalité augmentée — hit test, pose et ancrage du terrain
   */
  #emitState() {
    this.emit('statechange', { state: this.#state, anchored: this.anchored });
  }
}
