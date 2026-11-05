/**
 * Fabrique de joueurs (patron Factory, cahier §3.4) : crée un pion 3D selon
 * l'équipe (couleur, numéro, orientation).
 *
 * Géométries et matériaux sont partagés entre les 22 joueurs pour limiter la
 * mémoire et le coût de rendu sur mobile (cahier, §6.1).
 */
import * as THREE from 'three';
import { PLAYER_SIZE } from './config.js';

/** Résolution de la texture d'un numéro, en pixels. */
const LABEL_TEXTURE_SIZE = 128;

/**
 * Dessine le numéro d'un joueur : un disque blanc cerclé de la couleur de l'équipe.
 * @param {{cssColor: string}} team
 * @param {number} number numéro du maillot
 * @returns {THREE.CanvasTexture}
 */
function createLabelTexture(team, number) {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_TEXTURE_SIZE;
  canvas.height = LABEL_TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  const center = LABEL_TEXTURE_SIZE / 2;

  ctx.beginPath();
  ctx.arc(center, center, center - 7, 0, 2 * Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = team.cssColor;
  ctx.stroke();

  ctx.fillStyle = team.cssColor;
  ctx.font = `700 ${number >= 10 ? 56 : 66}px system-ui, "Segoe UI", Roboto, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), center, center + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Crée la flèche blanche posée au pied du joueur, qui indique son orientation.
 * La géométrie pointe vers +X, l'axe « avant » du joueur.
 * @param {number} radius rayon du pion
 * @returns {THREE.BufferGeometry}
 */
function createDirectionMarkerGeometry(radius) {
  const shape = new THREE.Shape();
  shape.moveTo(radius * 2.1, 0);
  shape.lineTo(radius * 1.3, radius * 0.6);
  shape.lineTo(radius * 1.3, -radius * 0.6);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0.0016, 0);
  return geometry;
}

/** Fabrique des pions joueurs. */
export class PlayerFactory {
  /**
   * Prépare les géométries partagées et les caches de matériaux.
   */
  constructor() {
    const { radius, height, hitboxRadius } = PLAYER_SIZE;

    this.bodyGeometry = new THREE.CapsuleGeometry(radius, height - 2 * radius, 4, 12);
    this.bodyGeometry.translate(0, height / 2, 0); // la base du pion repose sur y = 0

    this.baseGeometry = new THREE.CylinderGeometry(radius * 1.3, radius * 1.4, 0.0015, 20);
    this.baseGeometry.translate(0, 0.00075, 0);

    this.markerGeometry = createDirectionMarkerGeometry(radius);
    this.markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Zone de sélection invisible, plus large que le pion, pour le raycasting du sprint 5.
    this.hitboxGeometry = new THREE.CylinderGeometry(hitboxRadius, hitboxRadius, height * 1.5, 12);
    this.hitboxGeometry.translate(0, (height * 1.5) / 2, 0);
    this.hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });

    this.bodyMaterials = new Map();
    this.labelMaterials = new Map();
  }

  /**
   * Renvoie le matériau du corps d'un joueur, partagé par toute l'équipe.
   * @param {{id: string, color: number}} team
   * @returns {THREE.MeshStandardMaterial}
   */
  getBodyMaterial(team) {
    if (!this.bodyMaterials.has(team.id)) {
      this.bodyMaterials.set(team.id, new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.45, metalness: 0.05 }));
    }
    return this.bodyMaterials.get(team.id);
  }

  /**
   * Renvoie le matériau du numéro d'un joueur, créé une seule fois par équipe et par numéro.
   * @param {{id: string, cssColor: string}} team
   * @param {number} number
   * @returns {THREE.SpriteMaterial}
   */
  getLabelMaterial(team, number) {
    const key = `${team.id}-${number}`;
    if (!this.labelMaterials.has(key)) {
      this.labelMaterials.set(key, new THREE.SpriteMaterial({ map: createLabelTexture(team, number) }));
    }
    return this.labelMaterials.get(key);
  }

  /**
   * Crée un joueur prêt à être placé sur le terrain, tourné vers le but adverse.
   * Son numéro est un sprite, toujours tourné vers la caméra, donc lisible sous tous les angles.
   * @param {{team: object, number: number, role: string}} options
   * @returns {THREE.Group} groupe du joueur ; `userData` décrit l'équipe, le numéro et le poste
   */
  createPlayer({ team, number, role }) {
    const player = new THREE.Group();
    player.name = `player-${team.id}-${number}`;
    player.userData = { type: 'player', teamId: team.id, number, role };

    const bodyMaterial = this.getBodyMaterial(team);
    const base = new THREE.Mesh(this.baseGeometry, bodyMaterial);
    const marker = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
    const body = new THREE.Mesh(this.bodyGeometry, bodyMaterial);

    const label = new THREE.Sprite(this.getLabelMaterial(team, number));
    label.scale.setScalar(PLAYER_SIZE.labelSize);
    label.position.y = PLAYER_SIZE.height + PLAYER_SIZE.labelSize * 0.62;

    const hitbox = new THREE.Mesh(this.hitboxGeometry, this.hitboxMaterial);
    hitbox.name = 'hitbox';

    player.add(base, marker, body, label, hitbox);
    player.rotation.y = team.attacksPositiveX ? 0 : Math.PI;
    return player;
  }
}
