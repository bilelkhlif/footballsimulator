/**
 * Point de vue d'un joueur : la scène du terrain vue à hauteur d'homme, depuis la place du joueur
 * sélectionné, et la souris (ou le doigt) pour regarder autour de lui.
 *
 * Aucun second moteur ni seconde scène : c'est la scène three.js du tableau tactique, dessinée par
 * une caméra en perspective placée sur le joueur, à 1,75 m réels du sol. La boucle de rendu dessine
 * avec cette caméra tant que le point de vue est actif (createRenderLoop, getViewCamera). La caméra
 * suit la place affichée du joueur à chaque image : elle reste juste pendant une transition de
 * formation ou la lecture d'une séquence. Le pion du joueur est masqué pendant le point de vue
 * (numéro, zone de sélection et instance de son équipe), puis rétabli à la sortie.
 *
 * Le point de vue ne fait que regarder : il ne touche ni au tableau tactique, ni à l'historique, ni
 * à la séquence, ni au stockage. Hors AR seulement.
 *
 * Regarder autour : un clic sur le terrain verrouille le pointeur (Pointer Lock) quand le
 * navigateur le permet ; la souris tourne alors la vue sans limite, et Échap rend le curseur.
 * Sans verrouillage (refusé, non pris en charge, écran tactile), on glisse sur le terrain.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';
import { EventEmitter } from './events.mjs';
import { PITCH_SCALE } from './config.mjs';

/** Hauteur des yeux, en mètres de la maquette : 1,75 m réels. */
export const EYE_HEIGHT = 1.75 * PITCH_SCALE;

/** Champ de vision vertical, en degrés : large, comme un regard humain. */
export const POV_FIELD_OF_VIEW = 72;

/** Inclinaison maximale vers le haut ou vers le bas, en radians (80°) : la vue ne se retourne pas. */
export const MAX_LOOK_PITCH = THREE.MathUtils.degToRad(80);

/** Inclinaison de départ : le regard légèrement baissé vers le jeu. */
export const START_LOOK_PITCH = THREE.MathUtils.degToRad(-6);

/** Radians par pixel de déplacement : souris verrouillée, puis glissé. */
export const LOOK_SENSITIVITY = Object.freeze({ locked: 0.0022, drag: 0.0045 });

/** Amortissement de la rotation, par seconde : la vue rejoint le regard voulu en douceur. */
const LOOK_DAMPING = 18;

/** Matrice d'une instance masquée : échelle nulle. */
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Inclinaison bornée à ±MAX_LOOK_PITCH.
 * @param {number} pitch
 * @returns {number}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Point de vue — regard du joueur
 */
export function clampLookPitch(pitch) {
  return Math.min(MAX_LOOK_PITCH, Math.max(-MAX_LOOK_PITCH, pitch));
}

/**
 * Regard après un déplacement de la souris ou du doigt : à droite, la vue tourne à droite ; vers
 * le haut, elle se lève.
 * @param {{yaw: number, pitch: number}} look regard voulu
 * @param {number} dx déplacement horizontal, en pixels
 * @param {number} dy déplacement vertical, en pixels
 * @param {number} sensitivity radians par pixel
 * @returns {{yaw: number, pitch: number}}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Point de vue — regard du joueur
 */
export function applyLookDelta({ yaw, pitch }, dx, dy, sensitivity) {
  return { yaw: yaw - dx * sensitivity, pitch: clampLookPitch(pitch - dy * sensitivity) };
}

/**
 * Lacet de départ : le regard suit l'orientation du pion, tourné vers le but adverse (rotation.y
 * vaut 0 pour l'équipe qui attaque vers +X, π pour l'autre). La caméra regarde vers -Z quand son
 * lacet est nul : -π/2 la tourne vers +X.
 * @param {number} playerYaw rotation.y du joueur
 * @returns {number}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Point de vue — regard du joueur
 */
export function startYawFor(playerYaw) {
  return playerYaw - Math.PI / 2;
}

/**
 * Mode « Point de vue » : caméra, regard, masquage du pion et saisie de la souris.
 * Événements : `change` ({ active, target }) à l'entrée et à la sortie ; `lockchange`
 * ({ locked }) quand le pointeur est verrouillé ou rendu.
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Point de vue — mode et caméra
 */
export class PointOfView extends EventEmitter {
  #renderer;
  #pitchGroup;
  #teamGroups;
  #teamMeshes;
  #controls;
  #document;
  #camera = new THREE.PerspectiveCamera(POV_FIELD_OF_VIEW, 1, 0.0004, 4);
  #target = null;
  #look = { yaw: 0, pitch: 0 };
  #view = { yaw: 0, pitch: 0 };
  #lastTime = null;
  #drag = null;
  #controlsWereEnabled = true;
  #size = new THREE.Vector2();
  #worldPosition = new THREE.Vector3();
  #worldScale = new THREE.Vector3();
  #pitchQuaternion = new THREE.Quaternion();
  #euler = new THREE.Euler(0, 0, 0, 'YXZ');
  #up = new THREE.Vector3();

  /**
   * @param {object} options
   * @param {{domElement: HTMLCanvasElement, xr: {isPresenting: boolean}, getSize: Function}} options.renderer
   * @param {THREE.Object3D} options.pitchGroup groupe du terrain
   * @param {Record<string, THREE.Group>} options.teamGroups groupes des équipes (createTeam)
   * @param {Record<string, {meshes: THREE.InstancedMesh[]}>} options.teamMeshes pions instanciés par équipe
   * @param {{enabled: boolean}} options.controls contrôles d'orbite de la vue normale
   * @param {Document} [options.document]
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — mode et caméra
   */
  constructor({ renderer, pitchGroup, teamGroups, teamMeshes, controls, document = globalThis.document }) {
    super();
    this.#renderer = renderer;
    this.#pitchGroup = pitchGroup;
    this.#teamGroups = teamGroups;
    this.#teamMeshes = teamMeshes;
    this.#controls = controls;
    this.#document = document;
    this.#camera.name = 'point-of-view-camera';
  }

  /**
   * Vrai pendant le point de vue.
   * @returns {boolean}
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — mode et caméra
   */
  get active() {
    return this.#target !== null;
  }

  /**
   * Joueur regardé ({ teamId, number }), ou null.
   * @returns {{teamId: string, number: number}|null}
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — mode et caméra
   */
  get target() {
    return this.#target ? { teamId: this.#target.teamId, number: this.#target.number } : null;
  }

  /**
   * Caméra à utiliser par la boucle de rendu : celle du point de vue, ou null hors point de vue.
   * @returns {THREE.PerspectiveCamera|null}
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — mode et caméra
   */
  get viewCamera() {
    return this.#target ? this.#camera : null;
  }

  /**
   * Regard voulu (lacet et inclinaison, en radians), pour les tests et le diagnostic.
   * @returns {{yaw: number, pitch: number}}
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — mode et caméra
   */
  get look() {
    return { ...this.#look };
  }

  /**
   * Entre dans le point de vue d'un joueur. Sans effet en AR, ou si le joueur n'existe pas.
   * @param {{type?: string, teamId: string, number: number}|null} selection joueur sélectionné
   * @returns {boolean} vrai si le point de vue est ouvert
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — mode et caméra
   */
  enter(selection) {
    if (!selection || selection.type === 'ball' || this.#renderer.xr?.isPresenting) {
      return false;
    }
    const group = this.#teamGroups[selection.teamId];
    const index = group ? group.children.findIndex((child) => child.userData.number === selection.number) : -1;
    if (index < 0) {
      return false;
    }
    if (this.#target) {
      this.#restoreMarker();
      this.#detachInput();
    }
    const player = group.children[index];
    this.#target = { teamId: selection.teamId, number: selection.number, player, index };
    const yaw = startYawFor(player.rotation.y);
    this.#look = { yaw, pitch: START_LOOK_PITCH };
    this.#view = { ...this.#look };
    this.#lastTime = null;
    this.#controlsWereEnabled = this.#controls.enabled;
    this.#controls.enabled = false;
    player.visible = false;
    this.#attachInput();
    this.#placeCamera();
    this.emit('change', { active: true, target: this.target });
    return true;
  }

  /**
   * Quitte le point de vue : pion rétabli, curseur rendu, vue normale et ses commandes rendues.
   * @returns {boolean} vrai si le point de vue était ouvert
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — mode et caméra
   */
  exit() {
    if (!this.#target) {
      return false;
    }
    this.#detachInput();
    this.#restoreMarker();
    this.#target = null;
    this.#drag = null;
    this.#controls.enabled = this.#controlsWereEnabled;
    this.emit('change', { active: false, target: null });
    return true;
  }

  /**
   * Travail d'une image (tâche de la boucle de rendu, après les pions instanciés) : regard amorti,
   * caméra replacée sur le joueur, pion masqué.
   * @param {number} time horodatage de l'image, en millisecondes
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — mode et caméra
   */
  update(time) {
    if (!this.#target) {
      return;
    }
    if (this.#renderer.xr?.isPresenting) {
      this.exit();
      return;
    }
    const seconds = this.#lastTime === null ? 1 : Math.min(0.1, Math.max(0, (time - this.#lastTime) / 1000));
    this.#lastTime = time;
    const blend = 1 - Math.exp(-LOOK_DAMPING * seconds);
    this.#view.yaw += (this.#look.yaw - this.#view.yaw) * blend;
    this.#view.pitch += (this.#look.pitch - this.#view.pitch) * blend;
    this.#placeCamera();
    this.#hideMarker();
  }

  /**
   * Place la caméra aux yeux du joueur, orientée selon le regard, dans le repère du terrain.
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — mode et caméra
   */
  #placeCamera() {
    const { player } = this.#target;
    this.#pitchGroup.updateWorldMatrix(true, false);
    this.#pitchGroup.getWorldQuaternion(this.#pitchQuaternion);
    const scale = this.#pitchGroup.getWorldScale(this.#worldScale).y;
    player.getWorldPosition(this.#worldPosition);
    this.#camera.position.set(this.#worldPosition.x, this.#worldPosition.y, this.#worldPosition.z);
    this.#camera.position.addScaledVector(this.#up.set(0, 1, 0).applyQuaternion(this.#pitchQuaternion), EYE_HEIGHT * scale);
    this.#euler.set(this.#view.pitch, this.#view.yaw, 0, 'YXZ');
    this.#camera.quaternion.setFromEuler(this.#euler).premultiply(this.#pitchQuaternion);
    this.#camera.near = 0.0004 * scale;
    this.#camera.far = 4 * scale;
    this.#renderer.getSize(this.#size);
    const aspect = this.#size.y > 0 ? this.#size.x / this.#size.y : 1;
    this.#camera.aspect = aspect;
    this.#camera.updateProjectionMatrix();
    this.#camera.updateMatrixWorld();
  }

  /**
   * Masque l'instance du joueur dans les pions de son équipe (réécrite à chaque image : les pions
   * peuvent avoir recopié sa pose juste avant).
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — mode et caméra
   */
  #hideMarker() {
    const { teamId, index } = this.#target;
    for (const mesh of this.#teamMeshes[teamId]?.meshes ?? []) {
      mesh.setMatrixAt(index, HIDDEN_MATRIX);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Rétablit le pion du joueur : numéro, zone de sélection et instance à sa pose.
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — mode et caméra
   */
  #restoreMarker() {
    const { teamId, index, player } = this.#target;
    player.visible = true;
    player.updateMatrix();
    for (const mesh of this.#teamMeshes[teamId]?.meshes ?? []) {
      mesh.setMatrixAt(index, player.matrix);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Abonne la saisie du regard : canvas (clic, glissé) et document (souris verrouillée).
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — saisie du regard
   */
  #attachInput() {
    const canvas = this.#renderer.domElement;
    canvas.addEventListener('pointerdown', this.#onPointerDown);
    canvas.addEventListener('pointermove', this.#onPointerMove);
    canvas.addEventListener('pointerup', this.#onPointerUp);
    canvas.addEventListener('pointercancel', this.#onPointerUp);
    this.#document?.addEventListener('mousemove', this.#onMouseMove);
    this.#document?.addEventListener('pointerlockchange', this.#onLockChange);
    this.#document?.addEventListener('pointerlockerror', this.#onLockChange);
  }

  /**
   * Désabonne la saisie du regard et rend le curseur s'il était verrouillé.
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — saisie du regard
   */
  #detachInput() {
    const canvas = this.#renderer.domElement;
    canvas.removeEventListener('pointerdown', this.#onPointerDown);
    canvas.removeEventListener('pointermove', this.#onPointerMove);
    canvas.removeEventListener('pointerup', this.#onPointerUp);
    canvas.removeEventListener('pointercancel', this.#onPointerUp);
    this.#document?.removeEventListener('mousemove', this.#onMouseMove);
    this.#document?.removeEventListener('pointerlockchange', this.#onLockChange);
    this.#document?.removeEventListener('pointerlockerror', this.#onLockChange);
    if (this.#isLocked()) {
      this.#document.exitPointerLock?.();
    }
  }

  /**
   * Vrai si le pointeur est verrouillé sur le canvas.
   * @returns {boolean}
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — saisie du regard
   */
  #isLocked() {
    return Boolean(this.#document) && this.#document.pointerLockElement === this.#renderer.domElement;
  }

  /**
   * Appui sur le terrain : verrouille le pointeur de la souris si possible, et commence un glissé
   * (utilisé si le verrouillage est refusé, et toujours au doigt ou au stylet).
   * @param {PointerEvent} event
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — saisie du regard
   */
  #onPointerDown = (event) => {
    const canvas = this.#renderer.domElement;
    if (event.pointerType === 'mouse' && !this.#isLocked() && typeof canvas.requestPointerLock === 'function') {
      try {
        // Chrome rend une promesse, d'autres navigateurs rien : un refus laisse le glissé.
        canvas.requestPointerLock()?.catch?.(() => {});
      } catch {
        // Verrouillage indisponible : le glissé suffit.
      }
    }
    this.#drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture?.(event.pointerId);
  };

  /**
   * Glissé : la vue suit le doigt ou la souris non verrouillée.
   * @param {PointerEvent} event
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — saisie du regard
   */
  #onPointerMove = (event) => {
    if (!this.#drag || event.pointerId !== this.#drag.id || this.#isLocked()) {
      return;
    }
    this.#look = applyLookDelta(this.#look, event.clientX - this.#drag.x, event.clientY - this.#drag.y, LOOK_SENSITIVITY.drag);
    this.#drag.x = event.clientX;
    this.#drag.y = event.clientY;
  };

  /**
   * Fin du glissé.
   * @param {PointerEvent} event
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — saisie du regard
   */
  #onPointerUp = (event) => {
    if (this.#drag?.id === event.pointerId) {
      this.#drag = null;
    }
  };

  /**
   * Souris verrouillée : chaque mouvement tourne la vue, sans limite horizontale.
   * @param {MouseEvent} event
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — saisie du regard
   */
  #onMouseMove = (event) => {
    if (this.#isLocked()) {
      this.#look = applyLookDelta(this.#look, event.movementX ?? 0, event.movementY ?? 0, LOOK_SENSITIVITY.locked);
    }
  };

  /**
   * Verrouillage obtenu, rendu (Échap) ou refusé.
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Point de vue — saisie du regard
   */
  #onLockChange = () => {
    this.emit('lockchange', { locked: this.#isLocked() });
  };
}