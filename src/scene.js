/**
 * Scène three.js de la vue 3D hors AR : moteur de rendu, caméra, lumières,
 * contrôles d'orbite et groupe racine du terrain.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BOARD_LENGTH, BOARD_THICKNESS, BOARD_WIDTH, SCENE_COLORS } from './config.js';

/**
 * Part de l'écran que le plateau peut occuper lors du cadrage, en coordonnées
 * normalisées (1 = bord de l'écran). La marge verticale laisse place aux bandeaux.
 */
const FRAMING_LIMITS = Object.freeze({ x: 0.92, y: 0.74 });

/** Coins du plateau, dessus et dessous, utilisés pour le cadrage. */
const BOARD_CORNERS = [-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [0, -BOARD_THICKNESS].map(
  (y) => new THREE.Vector3((sx * BOARD_LENGTH) / 2, y, (sz * BOARD_WIDTH) / 2),
)));

/**
 * Crée le moteur de rendu WebGL et insère son canvas dans le conteneur.
 * Le fond transparent (alpha) servira à superposer la scène à la caméra en AR,
 * et WebXR est activé pour les sessions AR immersives.
 * @param {HTMLElement} container élément qui reçoit le canvas
 * @returns {THREE.WebGLRenderer}
 */
function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  // WebXR activé : pendant une session AR immersive, three.js pilote lui-même
  // la caméra (position du téléphone) et la boucle de rendu (cadence de la session).
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);
  return renderer;
}

/**
 * Ajoute l'éclairage : une lumière d'ambiance et une lumière directionnelle,
 * sans ombres portées, pour rester fluide sur mobile (cahier, §6.3).
 * @param {THREE.Scene} scene
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
 */
function boardFitsInView(camera) {
  const projected = new THREE.Vector3();
  return BOARD_CORNERS.every((corner) => {
    projected.copy(corner).project(camera);
    return Math.abs(projected.x) <= FRAMING_LIMITS.x && Math.abs(projected.y) <= FRAMING_LIMITS.y;
  });
}

/**
 * Place la caméra pour que le terrain entier tienne à l'écran.
 * En paysage, la vue est latérale comme à la télévision ; en portrait, elle se
 * place derrière le but de l'équipe bleue pour exploiter la hauteur de l'écran.
 * La caméra recule jusqu'à ce que les coins projetés du plateau tiennent dans le cadre.
 * @param {THREE.PerspectiveCamera} camera
 * @param {OrbitControls} controls
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
 * Crée le contexte de rendu de la vue 3D hors AR.
 * Tous les éléments du terrain doivent être ajoutés à `pitchGroup` : déplacer
 * ou ancrer ce groupe déplace l'ensemble du terrain (cahier, §3.2).
 * @param {HTMLElement} container élément qui reçoit le canvas
 * @returns {{renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera,
 *   controls: OrbitControls, pitchGroup: THREE.Group, table: THREE.Mesh, resetView: () => void,
 *   resize: () => void}}
 */
export function createSceneContext(container) {
  const renderer = createRenderer(container);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE_COLORS.background);

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 20);
  const controls = createControls(camera, renderer.domElement);

  addLights(scene);
  const table = createTable();
  scene.add(table);

  const pitchGroup = new THREE.Group();
  pitchGroup.name = 'pitchGroup';
  scene.add(pitchGroup);

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
    camera.updateProjectionMatrix();
    const isPortrait = camera.aspect < 1;
    if (isPortrait !== wasPortrait) {
      wasPortrait = isPortrait;
      resetView();
    }
  };
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, controls, pitchGroup, table, resetView, resize };
}
