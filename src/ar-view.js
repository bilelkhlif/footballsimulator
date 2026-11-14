/**
 * Passage de la scène entre la vue 3D et la vue AR (sprints 2 et 3).
 *
 * En AR, l'image de la caméra remplace le fond et la table virtuelle, et les contrôles d'orbite
 * sont coupés. Le terrain reste masqué jusqu'à sa pose : sur la surface visée par le réticule
 * (sprint 3), ou devant l'utilisateur quand l'appareil n'a pas de hit test (sprint 2). Une fois
 * ancré, il suit la pose de son ancre. À la sortie, la vue 3D est restaurée telle qu'au départ.
 *
 * Ce module ne parle pas à WebXR : il reçoit des poses (position et orientation) et les applique
 * aux objets three.js. C'est src/ar-surface.js qui lit le hit test et les ancres.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { computePitchPlacement } from './ar-placement.js';

/**
 * Crée la vue AR de la scène.
 * @param {object} context
 * @param {import('three').Scene} context.scene
 * @param {import('three').Object3D} context.table table virtuelle, masquée en AR
 * @param {import('three').Group} context.pitchGroup groupe racine du terrain
 * @param {{enabled: boolean}} context.controls contrôles d'orbite de la vue 3D
 * @param {import('three').Object3D} [context.reticle] réticule de visée (sprint 3)
 * @param {() => void} [context.onExit] appelé après la restauration, pour recadrer la vue 3D
 * @responsable Bilel Khlif
 * @date 2026-11-09
 * @role Réalité augmentée — scène pendant la session
 */
export function createArView({ scene, table, pitchGroup, controls, reticle = null, onExit = () => {} }) {
  let isActive = false;
  let needsPlacement = false;
  let savedBackground = null;

  /**
   * Remet le terrain au centre de la scène, à plat, comme dans la vue 3D.
   */
  function resetPitchPose() {
    pitchGroup.position.set(0, 0, 0);
    pitchGroup.quaternion.set(0, 0, 0, 1);
  }

  return {
    /** Vrai entre enter() et exit(). */
    get isActive() {
      return isActive;
    },

    /** Vrai tant que le terrain attend sa pose. */
    get needsPlacement() {
      return needsPlacement;
    },

    /**
     * Prépare la scène pour l'AR.
     */
    enter() {
      if (isActive) {
        return;
      }
      isActive = true;
      savedBackground = scene.background;
      scene.background = null; // fond transparent : l'image de la caméra apparaît derrière la scène
      table.visible = false; // la vraie table remplace la table virtuelle
      controls.enabled = false; // le téléphone déplace la caméra, plus la souris ni le doigt
      pitchGroup.visible = false; // masqué jusqu'à sa pose
      needsPlacement = true;
    },

    /**
     * Affiche le réticule à la pose de la surface détectée, ou le masque.
     * @param {{matrix: ArrayLike<number>}|null} surfaceTransform pose du résultat du hit test
     *   (XRRigidTransform, matrice 4 × 4 en colonnes), ou null sans surface
     */
    showReticle(surfaceTransform) {
      if (!reticle) {
        return;
      }
      if (surfaceTransform) {
        reticle.matrix.fromArray(surfaceTransform.matrix);
        reticle.visible = true;
      } else {
        reticle.visible = false;
      }
    },

    /**
     * Place le terrain devant l'utilisateur, d'après la pose de la vue (sprint 2, et secours
     * du sprint 3 sans hit test).
     * @param {{position: object, orientation: object}} viewerTransform pose de la vue (XRRigidTransform)
     */
    placeInFront(viewerTransform) {
      const { position, rotationY } = computePitchPlacement(viewerTransform);
      this.placeAt({ position, rotationY });
    },

    /**
     * Pose le terrain à une position et une orientation données (sprint 3 : sur la surface).
     * @param {{position: {x: number, y: number, z: number}, rotationY: number}} placement
     */
    placeAt({ position, rotationY }) {
      pitchGroup.position.set(position.x, position.y, position.z);
      pitchGroup.rotation.set(0, rotationY, 0);
      pitchGroup.visible = true;
      needsPlacement = false;
      this.showReticle(null);
    },

    /**
     * Recale le terrain sur la pose de son ancre : la position du terrain suit alors ce que
     * le système de suivi sait de la pièce, sans dériver (cahier §4.3).
     * @param {{position: {x: number, y: number, z: number}, orientation: {x: number, y: number, z: number, w: number}}} anchorTransform
     */
    followAnchor({ position, orientation }) {
      pitchGroup.position.set(position.x, position.y, position.z);
      pitchGroup.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
    },

    /**
     * Retire le terrain pour le poser ailleurs (bouton « Déplacer le terrain »).
     */
    liftPitch() {
      if (!isActive) {
        return;
      }
      pitchGroup.visible = false;
      needsPlacement = true;
    },

    /**
     * Restaure la vue 3D : fond, table, terrain au centre et contrôles d'orbite.
     */
    exit() {
      if (!isActive) {
        return;
      }
      isActive = false;
      needsPlacement = false;
      scene.background = savedBackground;
      table.visible = true;
      controls.enabled = true;
      this.showReticle(null);
      resetPitchPose();
      pitchGroup.visible = true;
      onExit();
    },
  };
}
