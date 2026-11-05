/**
 * Modèle 3D du terrain : plateau, gazon texturé et buts.
 * Les lignes sont tracées sur un canvas 2D selon les mesures des lois du jeu
 * (IFAB), puis appliquées comme texture sur un PlaneGeometry (cahier, §3.2).
 */
import * as THREE from 'three';
import {
  BOARD_LENGTH, BOARD_THICKNESS, BOARD_WIDTH, PITCH_LENGTH, PITCH_RUNOFF, PITCH_SCALE, REAL_PITCH, SCENE_COLORS,
} from './config.js';

/** Mesures réglementaires utilisées pour le tracé, en mètres réels. */
const MARKINGS = Object.freeze({
  lineWidth: 0.3, // 0,12 m en réalité, épaissie pour rester lisible en miniature
  centerCircleRadius: 9.15,
  spotRadius: 0.35,
  penaltyAreaDepth: 16.5,
  penaltyAreaWidth: 40.32,
  goalAreaDepth: 5.5,
  goalAreaWidth: 18.32,
  penaltySpotDistance: 11,
  cornerArcRadius: 1,
  goalWidth: 7.32,
  stripeCount: 14,
});

/** Résolution de la texture, en pixels par mètre réel. */
const PIXELS_PER_METER = 16;

/** Dimensions des buts dans la scène, en mètres (hauteur et profondeur exagérées). */
const GOAL_SIZE = Object.freeze({
  width: MARKINGS.goalWidth * PITCH_SCALE,
  height: 0.02,
  depth: 0.012,
  postRadius: 0.0008,
});

/**
 * Trace un cercle plein, utilisé pour le point central et les points de penalty.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x abscisse en mètres
 * @param {number} y ordonnée en mètres
 */
function drawSpot(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x, y, MARKINGS.spotRadius, 0, 2 * Math.PI);
  ctx.fill();
}

/**
 * Trace les surfaces de réparation et de but, le point et l'arc de penalty d'un côté.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} side -1 pour le but de gauche, +1 pour celui de droite
 */
function drawPenaltyEnd(ctx, side) {
  const { length, width } = REAL_PITCH;
  const goalLineX = side < 0 ? 0 : length;
  const inward = -side; // direction de la ligne de but vers le centre
  const centerY = width / 2;

  const areaX = side < 0 ? 0 : length - MARKINGS.penaltyAreaDepth;
  ctx.strokeRect(areaX, centerY - MARKINGS.penaltyAreaWidth / 2, MARKINGS.penaltyAreaDepth, MARKINGS.penaltyAreaWidth);

  const goalAreaX = side < 0 ? 0 : length - MARKINGS.goalAreaDepth;
  ctx.strokeRect(goalAreaX, centerY - MARKINGS.goalAreaWidth / 2, MARKINGS.goalAreaDepth, MARKINGS.goalAreaWidth);

  const spotX = goalLineX + inward * MARKINGS.penaltySpotDistance;
  drawSpot(ctx, spotX, centerY);

  // Arc de penalty : seule la partie hors de la surface de réparation est tracée.
  const arcHalfAngle = Math.acos((MARKINGS.penaltyAreaDepth - MARKINGS.penaltySpotDistance) / MARKINGS.centerCircleRadius);
  const arcCenterAngle = side < 0 ? 0 : Math.PI;
  ctx.beginPath();
  ctx.arc(spotX, centerY, MARKINGS.centerCircleRadius, arcCenterAngle - arcHalfAngle, arcCenterAngle + arcHalfAngle);
  ctx.stroke();
}

/**
 * Dessine le gazon rayé et toutes les lignes du terrain sur un canvas 2D.
 * Le dessin se fait en mètres réels grâce à un changement d'échelle du contexte.
 * @returns {HTMLCanvasElement}
 */
function drawPitchCanvas() {
  const { length, width } = REAL_PITCH;
  const totalLength = length + 2 * PITCH_RUNOFF;
  const totalWidth = width + 2 * PITCH_RUNOFF;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(totalLength * PIXELS_PER_METER);
  canvas.height = Math.round(totalWidth * PIXELS_PER_METER);
  const ctx = canvas.getContext('2d');
  ctx.scale(PIXELS_PER_METER, PIXELS_PER_METER);

  // Gazon : couleur de fond, puis une bande de tonte sur deux dans le terrain.
  ctx.fillStyle = SCENE_COLORS.grassDark;
  ctx.fillRect(0, 0, totalLength, totalWidth);
  const stripeLength = length / MARKINGS.stripeCount;
  ctx.fillStyle = SCENE_COLORS.grassLight;
  for (let stripe = 1; stripe < MARKINGS.stripeCount; stripe += 2) {
    ctx.fillRect(PITCH_RUNOFF + stripe * stripeLength, PITCH_RUNOFF, stripeLength, width);
  }

  // Lignes : le repère part du coin du terrain, à l'intérieur de la bande de gazon.
  ctx.translate(PITCH_RUNOFF, PITCH_RUNOFF);
  ctx.strokeStyle = SCENE_COLORS.lines;
  ctx.fillStyle = SCENE_COLORS.lines;
  ctx.lineWidth = MARKINGS.lineWidth;

  ctx.strokeRect(0, 0, length, width);
  ctx.beginPath();
  ctx.moveTo(length / 2, 0);
  ctx.lineTo(length / 2, width);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(length / 2, width / 2, MARKINGS.centerCircleRadius, 0, 2 * Math.PI);
  ctx.stroke();
  drawSpot(ctx, length / 2, width / 2);

  drawPenaltyEnd(ctx, -1);
  drawPenaltyEnd(ctx, 1);

  // Arcs de coin, un quart de cercle à chaque angle.
  const corners = [[0, 0, 0], [length, 0, Math.PI / 2], [length, width, Math.PI], [0, width, 1.5 * Math.PI]];
  for (const [x, y, startAngle] of corners) {
    ctx.beginPath();
    ctx.arc(x, y, MARKINGS.cornerArcRadius, startAngle, startAngle + Math.PI / 2);
    ctx.stroke();
  }

  return canvas;
}

/**
 * Crée le gazon : un plan horizontal texturé avec les lignes du terrain.
 * Sa surface définit la hauteur y = 0 sur laquelle reposent joueurs et ballon.
 * @param {THREE.WebGLRenderer} renderer utilisé pour régler le filtrage anisotrope
 * @returns {THREE.Mesh}
 */
function createGrass(renderer) {
  const texture = new THREE.CanvasTexture(drawPitchCanvas());
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD_LENGTH, BOARD_WIDTH),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.name = 'grass';
  return grass;
}

/**
 * Crée le plateau qui donne de l'épaisseur au terrain, comme un tableau posé sur la table.
 * @returns {THREE.Mesh}
 */
function createBoard() {
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD_LENGTH, BOARD_THICKNESS, BOARD_WIDTH),
    new THREE.MeshStandardMaterial({ color: SCENE_COLORS.board, roughness: 0.85 }),
  );
  board.position.y = -BOARD_THICKNESS / 2 - 0.0003;
  board.name = 'board';
  return board;
}

/**
 * Crée un but : deux poteaux, une barre transversale et un filet translucide.
 * Le but est construit ligne de but en x = 0, filet vers les x négatifs, puis
 * tourné et placé à l'extrémité du terrain.
 * @param {number} side -1 pour le but de gauche, +1 pour celui de droite
 * @returns {THREE.Group}
 */
function createGoal(side) {
  const goal = new THREE.Group();
  goal.name = side < 0 ? 'goal-left' : 'goal-right';
  const { width, height, depth, postRadius } = GOAL_SIZE;
  const frameMaterial = new THREE.MeshStandardMaterial({ color: SCENE_COLORS.goal, roughness: 0.4 });

  const postGeometry = new THREE.CylinderGeometry(postRadius, postRadius, height, 8);
  for (const z of [-width / 2, width / 2]) {
    const post = new THREE.Mesh(postGeometry, frameMaterial);
    post.position.set(0, height / 2, z);
    goal.add(post);
  }

  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(postRadius, postRadius, width, 8), frameMaterial);
  crossbar.rotation.x = Math.PI / 2;
  crossbar.position.y = height;
  goal.add(crossbar);

  // Filet : une boîte translucide dont la face avant (bouche du but) et le fond restent ouverts.
  const netMaterial = new THREE.MeshBasicMaterial({
    color: SCENE_COLORS.goal, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
  });
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  // Ordre des faces d'une BoxGeometry : +x, -x, +y, -y, +z, -z.
  const net = new THREE.Mesh(
    new THREE.BoxGeometry(depth, height, width),
    [hidden, netMaterial, netMaterial, hidden, netMaterial, netMaterial],
  );
  net.position.set(-depth / 2, height / 2, 0);
  goal.add(net);

  goal.position.x = side * PITCH_LENGTH / 2;
  goal.rotation.y = side > 0 ? Math.PI : 0;
  return goal;
}

/**
 * Crée le terrain complet, à ajouter au groupe racine `pitchGroup`.
 * @param {THREE.WebGLRenderer} renderer
 * @returns {THREE.Group}
 */
export function createPitch(renderer) {
  const pitch = new THREE.Group();
  pitch.name = 'pitch';
  pitch.add(createBoard(), createGrass(renderer), createGoal(-1), createGoal(1));
  return pitch;
}
