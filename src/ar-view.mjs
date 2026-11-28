/**
 * Passage de la scène entre la vue 3D et la vue AR (sprints 2 et 3).
 *
 * En AR, l'image de la caméra remplace le fond et la table virtuelle, et les contrôles d'orbite
 * sont coupés. Le terrain reste masqué jusqu'à sa pose : sur la surface visée par le réticule
 * (sprint 3), ou devant l'utilisateur quand l'appareil n'a pas de hit test (sprint 2). Une fois
 * ancré, il suit la pose de son ancre. À la sortie, la vue 3D est restaurée telle qu'au départ.
 *
 * Phase 6 : en AR, le terrain peut être agrandi (scale : 1 pour la table, jusqu'au sol) avant ou
 * après la pose. Le plateau grandit avec lui : sa pose est relevée d'autant pour qu'il repose sur
 * la surface au lieu de s'y enfoncer. La vue 3D garde toujours l'échelle 1. Le terrain posé peut
 * aussi tourner sur lui-même (rotateBy) : un angle ajouté à la pose, ou à celle de l'ancre, sans
 * déplacer l'ancre ; une nouvelle pose repart face à l'utilisateur.
 *
 * Ce module ne parle pas à WebXR : il reçoit des poses (position et orientation) et les applique
 * aux objets three.js. C'est src/ar-surface.mjs qui lit le hit test et les ancres.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { computePitchPlacement, SURFACE_OFFSET } from './ar-placement.mjs';

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
  /** Échelle du terrain en AR (phase 6), et dernière pose reçue, sans le relèvement dû à l'échelle. */
  let scale = 1;
  const pose = { x: 0, y: 0, z: 0, hasPose: false };
  /** Rotation ajoutée par l'utilisateur autour de l'axe vertical (phase 6), en radians. */
  let yaw = 0;
  /** Orientation reçue (pose ou ancre), sans la rotation ajoutée. */
  const baseQuaternion = { x: 0, y: 0, z: 0, w: 1 };

  /**
   * Oriente le terrain : orientation reçue, puis la rotation ajoutée, autour de son axe vertical.
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Réalité augmentée — rotation du terrain posé
   */
  function applyOrientation() {
    const { x, y, z, w } = baseQuaternion;
    const s = Math.sin(yaw / 2);
    const c = Math.cos(yaw / 2);
    // q = base × rotation(y, yaw) : la rotation se fait dans le repère du terrain posé.
    pitchGroup.quaternion.set(x * c - z * s, y * c + w * s, z * c + x * s, w * c - y * s);
  }

  /**
   * Applique l'échelle et la position de base au terrain : le plateau, épaissi par l'échelle,
   * reste posé sur la surface.
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Réalité augmentée — taille du terrain posé
   */
  function applyScaleAndPosition() {
    pitchGroup.scale.setScalar(scale);
    if (pose.hasPose) {
      pitchGroup.position.set(pose.x, pose.y + (scale - 1) * SURFACE_OFFSET, pose.z);
    }
  }

  /**
   * Remet le terrain au centre de la scène, à plat, comme dans la vue 3D.
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Réalité augmentée — scène pendant la session
   */
  function resetPitchPose() {
    pitchGroup.position.set(0, 0, 0);
    pitchGroup.quaternion.set(0, 0, 0, 1);
    pitchGroup.scale.setScalar(1);
    pose.hasPose = false;
    yaw = 0;
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

    /** Rotation ajoutée au terrain posé, en radians (0 : face à l'utilisateur à la pose). */
    get yaw() {
      return yaw;
    },

    /**
     * Fait tourner le terrain posé sur lui-même, autour de son axe vertical (phase 6). Sans effet
     * tant qu'il n'est pas posé.
     * @param {number} radians angle ajouté, positif dans le sens inverse des aiguilles d'une montre vu du dessus
     * @returns {boolean} vrai si le terrain a tourné
     */
    rotateBy(radians) {
      if (!isActive || needsPlacement || !Number.isFinite(radians)) {
        return false;
      }
      yaw = Math.atan2(Math.sin(yaw + radians), Math.cos(yaw + radians));
      applyOrientation();
      return true;
    },

    /** Échelle du terrain en AR (1 : terrain de table de 60 cm). */
    get scale() {
      return scale;
    },

    /**
     * Change l'échelle du terrain en AR (phase 6), avant ou après la pose : appliquée tout de
     * suite pendant une session, gardée pour la suivante sinon.
     * @param {number} value échelle strictement positive
     */
    setScale(value) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`Échelle invalide : ${value}`);
      }
      scale = value;
      if (isActive) {
        applyScaleAndPosition();
      }
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
      pose.hasPose = false;
      pitchGroup.scale.setScalar(scale);
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
      Object.assign(pose, { x: position.x, y: position.y, z: position.z, hasPose: true });
      applyScaleAndPosition();
      // Nouvelle pose : face à l'utilisateur, sans la rotation ajoutée à la pose précédente.
      yaw = 0;
      Object.assign(baseQuaternion, { x: 0, y: Math.sin(rotationY / 2), z: 0, w: Math.cos(rotationY / 2) });
      applyOrientation();
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
      Object.assign(pose, { x: position.x, y: position.y, z: position.z, hasPose: true });
      applyScaleAndPosition();
      Object.assign(baseQuaternion, { x: orientation.x, y: orientation.y, z: orientation.z, w: orientation.w });
      applyOrientation();
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
