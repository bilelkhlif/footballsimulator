/**
 * Passage de la scène entre la vue 3D et la vue AR (sprint 2).
 *
 * En AR, l'image de la caméra remplace le fond et la table virtuelle, les contrôles d'orbite
 * sont coupés, et le terrain est placé devant l'utilisateur dès que la pose du téléphone est
 * connue. À la sortie, la vue 3D est restaurée telle qu'au départ.
 */
import { computePitchPlacement } from './ar-placement.js';

/**
 * Crée la vue AR de la scène.
 * @param {object} context
 * @param {import('three').Scene} context.scene
 * @param {import('three').Object3D} context.table table virtuelle, masquée en AR
 * @param {import('three').Group} context.pitchGroup groupe racine du terrain
 * @param {{enabled: boolean}} context.controls contrôles d'orbite de la vue 3D
 * @param {() => void} [context.onExit] appelé après la restauration, pour recadrer la vue 3D
 * @returns {{isActive: boolean, needsPlacement: boolean, enter: () => void,
 *   placeInFront: (viewerTransform: object) => void, exit: () => void}}
 */
export function createArView({ scene, table, pitchGroup, controls, onExit = () => {} }) {
  let isActive = false;
  let needsPlacement = false;
  let savedBackground = null;

  return {
    /** Vrai entre enter() et exit(). */
    get isActive() {
      return isActive;
    },

    /** Vrai tant que le terrain attend son placement devant l'utilisateur. */
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
      pitchGroup.visible = false; // masqué jusqu'à son placement, pour ne pas apparaître au sol
      needsPlacement = true;
    },

    /**
     * Place le terrain devant l'utilisateur, d'après la pose de la vue.
     * @param {{position: object, orientation: object}} viewerTransform pose de la vue (XRRigidTransform)
     */
    placeInFront(viewerTransform) {
      const { position, rotationY } = computePitchPlacement(viewerTransform);
      pitchGroup.position.set(position.x, position.y, position.z);
      pitchGroup.rotation.set(0, rotationY, 0);
      pitchGroup.visible = true;
      needsPlacement = false;
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
      pitchGroup.position.set(0, 0, 0);
      pitchGroup.rotation.set(0, 0, 0);
      pitchGroup.visible = true;
      onExit();
    },
  };
}
