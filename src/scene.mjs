/**
 * Scène three.js de la vue 3D hors AR : moteur de rendu WebGPU, caméra, lumières,
 * contrôles d'orbite et groupe racine du terrain.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BOARD_LENGTH, BOARD_THICKNESS, BOARD_WIDTH, SCENE_COLORS } from './config.mjs';
import { createWebGpuRenderer } from './webgpu.mjs';
import { createWebGlTestRenderer, RENDER_MODES } from './webgl-test-mode.mjs';

/**
 * Part de l'écran où le plateau est cadré, en coordonnées normalisées (1 = bord de l'écran) :
 * entre le bandeau supérieur et la barre d'outils, plus haute sur un téléphone en portrait. La
 * fenêtre ne dépend que de l'orientation : le cadrage est le même avant et après une session AR.
 */
export const FRAMING_WINDOWS = Object.freeze({
  portrait: Object.freeze({ x: 0.92, top: 0.7, bottom: -0.38 }),
  landscape: Object.freeze({ x: 0.92, top: 0.8, bottom: -0.62 }),
});

/**
 * Fenêtre de cadrage pour l'orientation de la caméra.
 * @param {THREE.PerspectiveCamera} camera
 * @returns {{x: number, top: number, bottom: number}}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Scène 3D — cadrage de la caméra
 */
export function framingWindow(camera) {
  return camera.aspect < 1 ? FRAMING_WINDOWS.portrait : FRAMING_WINDOWS.landscape;
}

/**
 * Décale l'image vers le centre de la fenêtre de cadrage (setViewOffset) : le centre du terrain
 * reste le pivot de la rotation, mais s'affiche au milieu de la place libre, au-dessus de la barre
 * d'outils. Le rayon de la souris et du doigt utilise la même projection : la sélection reste exacte.
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} width largeur du rendu, en pixels CSS
 * @param {number} height hauteur du rendu, en pixels CSS
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Scène 3D — cadrage de la caméra
 */
export function applyFramingOffset(camera, width, height) {
  const { top, bottom } = framingWindow(camera);
  if (width > 0 && height > 0) {
    camera.setViewOffset(width, height, 0, ((top + bottom) / 2) * (height / 2), width, height);
  }
  camera.updateProjectionMatrix();
}

/** Coins du plateau, dessus et dessous, utilisés pour le cadrage. */
const BOARD_CORNERS = [-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [0, -BOARD_THICKNESS].map(
  (y) => new THREE.Vector3((sx * BOARD_LENGTH) / 2, y, (sz * BOARD_WIDTH) / 2),
)));

/**
 * Crée le moteur de rendu et insère son canvas dans le conteneur : WebGPU, sauf si l'adresse
 * demande le mode test WebGL (?webgl, src/webgl-test-mode.mjs), réservé aux tests.
 * Le fond transparent (alpha) sert à superposer la scène à la caméra en AR. WebXR est activé
 * avant l'initialisation : pendant une session AR immersive, three.js pilote lui-même la
 * caméra (position du téléphone) et la boucle de rendu (cadence de la session).
 * @param {HTMLElement} container élément qui reçoit le canvas
 * @param {string} renderMode une valeur de RENDER_MODES
 * @returns {Promise<import('three/webgpu').Renderer>}
 * @throws {import('./webgpu.mjs').WebGpuUnavailableError} si WebGPU est absent : aucun repli WebGL
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Rendu — choix du moteur (WebGPU, ou mode test WebGL sur demande)
 */
async function createRenderer(container, renderMode) {
  const renderer = renderMode === RENDER_MODES.WEBGL_TEST
    ? await createWebGlTestRenderer({ xrEnabled: true })
    : await createWebGpuRenderer({ xrEnabled: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);
  return renderer;
}

/**
 * Ajoute l'éclairage : une lumière d'ambiance et une lumière directionnelle,
 * sans ombres portées, pour rester fluide sur mobile (cahier, §6.3).
 * @param {THREE.Scene} scene
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Scène 3D — éclairage
 */
function addLights(scene) {
  const ambientLight = new THREE.HemisphereLight(0xffffff, 0x2b3a30, 2.2);
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.6);
  sunLight.position.set(0.4, 1.2, 0.5);
  scene.add(ambientLight, sunLight);
}

/**
 * Crée la table sur laquelle repose le terrain. Elle n'existe que hors AR :
 * en réalité augmentée, la vraie table la remplace.
 * @returns {THREE.Mesh}
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Scène 3D — table de la vue hors AR
 */
function createTable() {
  const table = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 72),
    new THREE.MeshStandardMaterial({ color: SCENE_COLORS.table, roughness: 1 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -BOARD_THICKNESS - 0.001;
  table.name = 'table';
  return table;
}

/**
 * Indique si tous les coins du plateau sont visibles depuis la position actuelle de la caméra.
 * @param {THREE.PerspectiveCamera} camera
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Scène 3D — cadrage de la caméra
 */
function boardFitsInView(camera) {
  const projected = new THREE.Vector3();
  const { x, top, bottom } = framingWindow(camera);
  return BOARD_CORNERS.every((corner) => {
    projected.copy(corner).project(camera);
    return Math.abs(projected.x) <= x && projected.y <= top && projected.y >= bottom;
  });
}

/**
 * Place la caméra pour que le terrain entier tienne à l'écran.
 * En paysage, la vue est latérale comme à la télévision ; en portrait, elle se
 * place derrière le but de l'équipe bleue pour exploiter la hauteur de l'écran.
 * La caméra recule jusqu'à ce que les coins projetés du plateau tiennent dans le cadre.
 * @param {THREE.PerspectiveCamera} camera
 * @param {OrbitControls} controls
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Scène 3D — cadrage de la caméra
 */
function frameWholePitch(camera, controls) {
  const isPortrait = camera.aspect < 1;
  const viewDirection = isPortrait
    ? new THREE.Vector3(-1, 1.4, 0).normalize()
    : new THREE.Vector3(0, 0.85, 1).normalize();
  camera.fov = isPortrait ? 55 : 45;
  camera.updateProjectionMatrix();

  let distance = 0.2;
  for (let step = 0; step < 80; step += 1) {
    camera.position.copy(viewDirection).multiplyScalar(distance);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    if (boardFitsInView(camera)) break;
    distance *= 1.04;
  }

  controls.target.set(0, 0, 0);
  controls.update();
}

/**
 * Configure les contrôles d'orbite : rotation, zoom et déplacement à la souris
 * ou au doigt, sans passer sous la table.
 * @param {THREE.PerspectiveCamera} camera
 * @param {HTMLCanvasElement} canvas
 * @returns {OrbitControls}
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Scène 3D — contrôles d'orbite
 */
function createControls(camera, canvas) {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.15;
  controls.maxDistance = 3;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(82);
  return controls;
}

/**
 * Crée le contexte de rendu de la vue 3D hors AR. Asynchrone : WebGPU demande l'adaptateur
 * et le périphérique graphique avant le premier rendu.
 * Tous les éléments du terrain doivent être ajoutés à `pitchGroup` : déplacer
 * ou ancrer ce groupe déplace l'ensemble du terrain (cahier, §3.2).
 * @param {HTMLElement} container élément qui reçoit le canvas
 * @param {{renderMode?: string}} [options] mode de rendu : WebGPU par défaut
 * @returns {Promise<{renderer: import('three/webgpu').Renderer, scene: THREE.Scene,
 *   camera: THREE.PerspectiveCamera, controls: OrbitControls, pitchGroup: THREE.Group,
 *   table: THREE.Mesh, resetView: () => void, resize: () => void}>}
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Scène 3D — contexte de rendu de la vue hors AR
 */
export async function createSceneContext(container, { renderMode = RENDER_MODES.WEBGPU } = {}) {
  const renderer = await createRenderer(container, renderMode);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE_COLORS.background);

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 20);
  applyFramingOffset(camera, container.clientWidth, container.clientHeight);
  const controls = createControls(camera, renderer.domElement);

  addLights(scene);
  const table = createTable();
  scene.add(table);

  const pitchGroup = new THREE.Group();
  pitchGroup.name = 'pitchGroup';
  scene.add(pitchGroup);

  /** Recadre la caméra sur le terrain entier : au démarrage et par le bouton « Recentrer ». */
  const resetView = () => frameWholePitch(camera, controls);
  resetView();

  // Un redimensionnement simple (barre d'adresse mobile) garde la vue choisie ;
  // seul un changement d'orientation recadre le terrain.
  let wasPortrait = camera.aspect < 1;

  /**
   * Adapte le rendu et la caméra à la taille du conteneur. Sans effet pendant une session AR :
   * la taille du rendu vient alors de la session, et three.js la restaure à la sortie.
   */
  const resize = () => {
    if (renderer.xr.isPresenting) {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    applyFramingOffset(camera, container.clientWidth, container.clientHeight);
    const isPortrait = camera.aspect < 1;
    if (isPortrait !== wasPortrait) {
      wasPortrait = isPortrait;
      resetView();
    }
  };
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, controls, pitchGroup, table, resetView, resize };
}
