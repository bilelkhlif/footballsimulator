/**
 * Calques de lecture du terrain en 3D (phase 6) : tiers, cinq couloirs, demi-espaces et zone 14
 * (src/pitch-zones.mjs), posés à plat sur le gazon, dans le repère du terrain (pitchGroup) : ils
 * restent justes quand le terrain est posé, ancré, agrandi ou tourné en AR.
 *
 * Chaque calque est un seul maillage, fait de tous ses rectangles : quatre appels de dessin au
 * plus, et aucun quand les calques sont masqués (par défaut). L'entraîneur les affiche depuis la
 * carte Analyse tactique. C'est un réglage d'affichage, comme les lignes de hors-jeu : il n'entre
 * pas dans l'historique et ne change pas la tactique. La zone 14 de chaque équipe prend la couleur
 * de son maillot (observateur du tableau tactique).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';
import { TEAMS } from './config.mjs';
import {
  halfSpaces, laneLines, PITCH_LAYERS, thirdLines, toModel, zone14,
} from './pitch-zones.mjs';

/** Largeur des traits des tiers et des couloirs, en mètres réels (30 cm, lisible sur une table). */
export const ZONE_LINE_WIDTH = 0.3;

/**
 * Hauteurs au-dessus du gazon, en mètres de la maquette : sous les zones surlignées (1 mm), les
 * lignes de hors-jeu (1,1 mm) et les anneaux de sélection (1,3 mm).
 */
export const LAYER_HEIGHTS = Object.freeze({
  [PITCH_LAYERS.HALF_SPACES]: 0.0006,
  [PITCH_LAYERS.ZONE_14]: 0.0007,
  [PITCH_LAYERS.LANES]: 0.0008,
  [PITCH_LAYERS.THIRDS]: 0.0009,
});

/**
 * Géométrie de plusieurs rectangles à plat (plan XZ), à une hauteur donnée, en un seul tampon.
 * @param {Array<{x1: number, z1: number, x2: number, z2: number}>} rects en mètres de la maquette
 * @param {number} y hauteur
 * @returns {THREE.BufferGeometry}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Scène 3D — calques de lecture du terrain
 */
export function createRectanglesGeometry(rects, y) {
  const positions = new Float32Array(rects.length * 12);
  const indices = [];
  rects.forEach(({ x1, z1, x2, z2 }, index) => {
    positions.set([x1, y, z1, x2, y, z1, x2, y, z2, x1, y, z2], index * 12);
    const base = index * 4;
    // Sens anti-horaire vu du dessus : face tournée vers +y.
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Matériau translucide d'un calque, sans écriture de profondeur : il ne cache rien.
 * @param {number} color
 * @param {number} opacity
 * @returns {THREE.MeshBasicMaterial}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Scène 3D — calques de lecture du terrain
 */
function createLayerMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
}

/**
 * Couche des calques de lecture du terrain.
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Scène 3D — calques de lecture du terrain
 */
export class PitchZonesLayer {
  #board;
  #group = new THREE.Group();
  /** @type {Map<string, THREE.Object3D>} objet de chaque calque */
  #layers = new Map();
  /** @type {Map<string, THREE.Mesh>} zone 14 de chaque équipe */
  #zone14 = new Map();
  #unsubscribers = [];

  /**
   * @param {object} options
   * @param {THREE.Object3D} options.pitchGroup groupe racine du terrain
   * @param {import('./tactics-board.mjs').TacticsBoard} options.board couleurs des équipes
   * @param {Record<string, {attacksPositiveX: boolean, color: number}>} [options.teams]
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Scène 3D — calques de lecture du terrain
   */
  constructor({ pitchGroup, board, teams = TEAMS }) {
    this.#board = board;
    this.#group.name = 'pitch-zones';
    const line = (rects, layer) => createRectanglesGeometry(rects.map(toModel), LAYER_HEIGHTS[layer]);
    this.#addLayer(PITCH_LAYERS.THIRDS, new THREE.Mesh(line(thirdLines(ZONE_LINE_WIDTH), PITCH_LAYERS.THIRDS), createLayerMaterial(0xffffff, 0.55)));
    this.#addLayer(PITCH_LAYERS.LANES, new THREE.Mesh(line(laneLines(ZONE_LINE_WIDTH), PITCH_LAYERS.LANES), createLayerMaterial(0xdff5e4, 0.45)));
    this.#addLayer(PITCH_LAYERS.HALF_SPACES, new THREE.Mesh(line(halfSpaces(), PITCH_LAYERS.HALF_SPACES), createLayerMaterial(0xf4c542, 0.16)));
    const zones = new THREE.Group();
    for (const teamId of board.teamIds) {
      const mesh = new THREE.Mesh(line([zone14(teams[teamId]?.attacksPositiveX ?? true)], PITCH_LAYERS.ZONE_14), createLayerMaterial(teams[teamId]?.color ?? 0xffffff, 0.24));
      mesh.name = `zone-14-${teamId}`;
      this.#zone14.set(teamId, mesh);
      zones.add(mesh);
    }
    this.#addLayer(PITCH_LAYERS.ZONE_14, zones);
    pitchGroup.add(this.#group);
    this.#unsubscribers.push(board.on('identitychange', () => this.syncColors()), board.on('change', ({ type }) => {
      if (type === 'restore') this.syncColors();
    }));
    this.syncColors();
  }

  /**
   * Calques proposés, dans l'ordre des boutons.
   * @returns {string[]}
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Scène 3D — calques de lecture du terrain
   */
  get layers() {
    return [...this.#layers.keys()];
  }

  /**
   * Vrai si un calque est affiché.
   * @param {string} layer une valeur de PITCH_LAYERS
   * @returns {boolean}
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Scène 3D — calques de lecture du terrain
   */
  isVisible(layer) {
    return this.#require(layer).visible;
  }

  /**
   * Affiche ou masque un calque.
   * @param {string} layer une valeur de PITCH_LAYERS
   * @param {boolean} visible
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Scène 3D — calques de lecture du terrain
   */
  setVisible(layer, visible) {
    this.#require(layer).visible = Boolean(visible);
  }

  /**
   * Objet 3D d'un calque (tests et débogage).
   * @param {string} layer
   * @returns {THREE.Object3D|undefined}
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Scène 3D — calques de lecture du terrain
   */
  objectFor(layer) {
    return this.#layers.get(layer);
  }

  /**
   * Couleur de la zone 14 de chaque équipe : celle de son maillot.
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Scène 3D — calques de lecture du terrain
   */
  syncColors() {
    for (const [teamId, mesh] of this.#zone14) {
      mesh.material.color.setHex(this.#board.getIdentity(teamId).color);
    }
  }

  /**
   * Retire la couche de la scène et libère ses ressources.
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Scène 3D — calques de lecture du terrain
   */
  dispose() {
    this.#unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.#group.removeFromParent();
    this.#group.traverse((object) => {
      object.geometry?.dispose();
      object.material?.dispose();
    });
  }

  /**
   * Ajoute un calque, masqué.
   * @param {string} layer
   * @param {THREE.Object3D} object
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Scène 3D — calques de lecture du terrain
   */
  #addLayer(layer, object) {
    object.name ||= `pitch-layer-${layer}`;
    object.visible = false;
    this.#layers.set(layer, object);
    this.#group.add(object);
  }

  /**
   * Objet d'un calque connu ; erreur sinon.
   * @param {string} layer
   * @returns {THREE.Object3D}
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Scène 3D — calques de lecture du terrain
   */
  #require(layer) {
    const object = this.#layers.get(layer);
    if (!object) {
      throw new RangeError(`Calque inconnu : ${layer}`);
    }
    return object;
  }
}
