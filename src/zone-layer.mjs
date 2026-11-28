/**
 * Zones surlignées en 3D (phase 6) : chaque zone du tableau tactique est un rectangle doré
 * translucide, cerné d'un liseré, posé à plat sur le gazon, dans le repère du terrain (pitchGroup).
 *
 * Observateur du tableau (patron Observer) : la couche se recale à chaque changement et ne modifie
 * jamais le tableau. Les zones sont dessinées par deux maillages instanciés (les fonds, puis les
 * liserés, quatre par zone) : deux appels de dessin pour toutes les zones, aucun sans zone.
 * Pendant le tracé, tâche de la boucle de rendu (update) : l'aperçu suit le coin visé, doré si la
 * zone est acceptée, rouge sinon, sans allocation par image.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';
import { MAX_ZONES } from './tactics-board.mjs';
import { INVALID_COLOR } from './tactical-arrows.mjs';

/** Couleur des zones : l'or de l'interface. */
export const ZONE_COLOR = 0xf4c542;

/** Hauteur du fond et du liseré au-dessus du gazon, en mètres : sous les lignes de hors-jeu (1,1 mm). */
export const ZONE_FILL_HEIGHT = 0.001;
export const ZONE_EDGE_HEIGHT = 0.00105;

/** Largeur du liseré, en mètres de maquette (1,2 mm, environ 20 cm réels). */
export const ZONE_EDGE_WIDTH = 0.0012;

/** Carré unité à plat (plan XZ), face vers le haut, partagé par tous les rectangles. */
const UNIT_SQUARE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/**
 * Matrices d'un rectangle et de ses quatre liserés, écrites dans un maillage instancié.
 * @param {{from: {x: number, z: number}, to: {x: number, z: number}}} zone rangée (coin min, coin max)
 * @param {THREE.InstancedMesh} fills
 * @param {number} fillIndex
 * @param {THREE.InstancedMesh} edges
 * @param {number} edgeIndex premier des quatre liserés
 * @param {THREE.Object3D} scratch objet de calcul réutilisé
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Scène 3D — zones surlignées
 */
export function writeZoneMatrices({ from, to }, fills, fillIndex, edges, edgeIndex, scratch) {
  const width = Math.max(to.x - from.x, 1e-6);
  const depth = Math.max(to.z - from.z, 1e-6);
  const centerX = (from.x + to.x) / 2;
  const centerZ = (from.z + to.z) / 2;
  scratch.rotation.set(0, 0, 0);
  scratch.position.set(centerX, ZONE_FILL_HEIGHT, centerZ);
  scratch.scale.set(width, 1, depth);
  scratch.updateMatrix();
  fills.setMatrixAt(fillIndex, scratch.matrix);
  // Liserés : deux en longueur (bords z), deux en largeur (bords x).
  const sides = [
    [centerX, from.z, width + ZONE_EDGE_WIDTH, ZONE_EDGE_WIDTH],
    [centerX, to.z, width + ZONE_EDGE_WIDTH, ZONE_EDGE_WIDTH],
    [from.x, centerZ, ZONE_EDGE_WIDTH, depth],
    [to.x, centerZ, ZONE_EDGE_WIDTH, depth],
  ];
  sides.forEach(([x, z, sx, sz], index) => {
    scratch.position.set(x, ZONE_EDGE_HEIGHT, z);
    scratch.scale.set(sx, 1, sz);
    scratch.updateMatrix();
    edges.setMatrixAt(edgeIndex + index, scratch.matrix);
  });
}

/**
 * Maillage instancié translucide, sans écriture de profondeur, masqué tant qu'il n'a rien à montrer.
 * @param {number} count nombre maximal d'instances
 * @param {number} color
 * @param {number} opacity
 * @param {string} name
 * @returns {THREE.InstancedMesh}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Scène 3D — zones surlignées
 */
function createInstanced(count, color, opacity, name) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(UNIT_SQUARE, material, count);
  mesh.name = name;
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Couche des zones surlignées et de l'aperçu de la zone en cours de tracé.
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Scène 3D — zones surlignées
 */
export class ZoneLayer {
  #board;
  #interaction;
  #group = new THREE.Group();
  #fills = createInstanced(MAX_ZONES, ZONE_COLOR, 0.22, 'zone-fills');
  #edges = createInstanced(MAX_ZONES * 4, ZONE_COLOR, 0.9, 'zone-edges');
  #previewFill = createInstanced(1, ZONE_COLOR, 0.16, 'zone-preview-fill');
  #previewEdges = createInstanced(4, ZONE_COLOR, 0.95, 'zone-preview-edges');
  #scratch = new THREE.Object3D();
  #corner = { from: { x: 0, z: 0 }, to: { x: 0, z: 0 } };
  #unsubscribers = [];

  /**
   * @param {object} options
   * @param {THREE.Object3D} options.pitchGroup groupe racine du terrain
   * @param {import('./tactics-board.mjs').TacticsBoard} options.board zones observées
   * @param {{draft: object|null, hoverPoint: THREE.Vector3|null, hoverVerdict: object|null}} [options.interaction]
   *   interaction tactique, pour l'aperçu
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Scène 3D — zones surlignées
   */
  constructor({ pitchGroup, board, interaction = null }) {
    this.#board = board;
    this.#interaction = interaction;
    this.#group.name = 'zones';
    this.#group.add(this.#fills, this.#edges, this.#previewFill, this.#previewEdges);
    pitchGroup.add(this.#group);
    this.#unsubscribers.push(board.on('change', () => this.sync()));
    this.sync();
  }

  /**
   * Nombre de zones dessinées (tests et débogage).
   * @returns {number}
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Scène 3D — zones surlignées
   */
  get count() {
    return this.#fills.count;
  }

  /**
   * Vrai si l'aperçu d'une zone est affiché.
   * @returns {boolean}
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Scène 3D — zones surlignées
   */
  get previewVisible() {
    return this.#previewFill.visible;
  }

  /**
   * Redessine les zones d'après le tableau tactique.
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Scène 3D — zones surlignées
   */
  sync() {
    const zones = this.#board.getZones();
    zones.forEach((zone, index) => writeZoneMatrices(zone, this.#fills, index, this.#edges, index * 4, this.#scratch));
    this.#fills.count = zones.length;
    this.#edges.count = zones.length * 4;
    this.#fills.instanceMatrix.needsUpdate = true;
    this.#edges.instanceMatrix.needsUpdate = true;
    this.#fills.visible = zones.length > 0;
    this.#edges.visible = zones.length > 0;
  }

  /**
   * Travail d'une image : l'aperçu de la zone en cours suit le coin visé.
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Scène 3D — zones surlignées
   */
  update() {
    const draft = this.#interaction?.draft ?? null;
    const hover = draft?.kind === 'zone' ? this.#interaction.hoverPoint : null;
    const show = Boolean(hover);
    this.#previewFill.visible = show;
    this.#previewEdges.visible = show;
    if (!show) {
      return;
    }
    const { start } = draft;
    this.#corner.from.x = Math.min(start.x, hover.x);
    this.#corner.from.z = Math.min(start.z, hover.z);
    this.#corner.to.x = Math.max(start.x, hover.x);
    this.#corner.to.z = Math.max(start.z, hover.z);
    writeZoneMatrices(this.#corner, this.#previewFill, 0, this.#previewEdges, 0, this.#scratch);
    this.#previewFill.count = 1;
    this.#previewEdges.count = 4;
    this.#previewFill.instanceMatrix.needsUpdate = true;
    this.#previewEdges.instanceMatrix.needsUpdate = true;
    const color = this.#interaction.hoverVerdict?.valid === false ? INVALID_COLOR : ZONE_COLOR;
    this.#previewFill.material.color.setHex(color);
    this.#previewEdges.material.color.setHex(color);
  }

  /**
   * Retire la couche de la scène et libère ses matériaux.
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Scène 3D — zones surlignées
   */
  dispose() {
    this.#unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.#group.removeFromParent();
    for (const mesh of [this.#fills, this.#edges, this.#previewFill, this.#previewEdges]) {
      mesh.material.dispose();
      mesh.dispose();
    }
  }
}
