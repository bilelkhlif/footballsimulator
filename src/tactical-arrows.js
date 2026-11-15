/**
 * Flèches tactiques en 3D (sprint 5, BF7, cahier §3.2) : passes et courses tracées sur le gazon.
 *
 * Les flèches sont des enfants de pitchGroup, à 1,2 mm au-dessus du gazon : leur géométrie est
 * exprimée dans le repère du terrain, pas dans celui de la caméra. Quand l'utilisateur tourne autour
 * de la table, ou quand l'ancre recale le terrain, elles restent donc dessinées au même endroit du
 * terrain.
 *
 * Code couleur : une passe (trajet du ballon) est une flèche pleine, dorée ; une course
 * (déplacement d'un joueur) est une flèche en tirets, blanche.
 *
 * Ressources : chaque flèche a sa propre géométrie, libérée (dispose) dès que la flèche disparaît
 * (annulation, réinitialisation) ; les deux matériaux sont partagés. L'aperçu, mis à jour à chaque
 * image pendant le tracé, ne crée rien : il déforme deux maillages fixes.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';

/** Style de chaque type de flèche. */
export const ARROW_STYLES = Object.freeze({
  pass: Object.freeze({ color: 0xf4c542, dashed: false, label: 'Passe' }),
  run: Object.freeze({ color: 0xffffff, dashed: true, label: 'Course' }),
});

/** Dimensions des flèches, en mètres. */
export const ARROW_DIMENSIONS = Object.freeze({
  shaftWidth: 0.0045,
  headLength: 0.02,
  headWidth: 0.016,
  dash: 0.012,
  gap: 0.008,
  height: 0.0012, // au-dessus du gazon, pour ne pas se confondre avec ses lignes
});

/**
 * Construit la géométrie d'une flèche couchée sur le gazon, le long de +X, de 0 à sa longueur :
 * un corps (plein ou en tirets) puis une pointe triangulaire.
 * @param {number} length longueur totale, en mètres
 * @param {{dashed?: boolean}} [options]
 * @returns {THREE.BufferGeometry}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Scène 3D — flèches tactiques (géométrie)
 */
export function buildArrowGeometry(length, { dashed = false } = {}) {
  const { shaftWidth, headLength, headWidth, dash, gap } = ARROW_DIMENSIONS;
  const head = Math.min(headLength, length * 0.45);
  const shaftEnd = length - head;
  const halfWidth = shaftWidth / 2;
  const vertices = [];
  /** Ajoute un rectangle du corps, de x0 à x1, en deux triangles. */
  const addQuad = (x0, x1) => {
    vertices.push(x0, 0, -halfWidth, x1, 0, -halfWidth, x1, 0, halfWidth);
    vertices.push(x0, 0, -halfWidth, x1, 0, halfWidth, x0, 0, halfWidth);
  };
  if (dashed) {
    for (let x = 0; x < shaftEnd; x += dash + gap) {
      addQuad(x, Math.min(x + dash, shaftEnd));
    }
  } else {
    addQuad(0, shaftEnd);
  }
  vertices.push(shaftEnd, 0, -headWidth / 2, length, 0, 0, shaftEnd, 0, headWidth / 2);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Place et oriente un objet construit le long de +X pour qu'il aille de « from » à « to » sur le
 * gazon. Une rotation θ autour de Y envoie +X sur (cos θ, 0, -sin θ) : θ = atan2(-dz, dx).
 * @param {THREE.Object3D} object
 * @param {{x: number, z: number}} from départ, dans le repère du terrain
 * @param {{x: number, z: number}} to arrivée, dans le repère du terrain
 * @param {number} [height] hauteur au-dessus du gazon, en mètres
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Scène 3D — flèches tactiques (géométrie)
 */
export function placeArrow(object, from, to, height = ARROW_DIMENSIONS.height) {
  object.position.set(from.x, height, from.z);
  object.rotation.set(0, Math.atan2(-(to.z - from.z), to.x - from.x), 0);
}

/**
 * Couche des flèches du tableau tactique : un maillage par flèche, enfant de pitchGroup.
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Scène 3D — flèches tactiques (couche et ressources)
 */
export class ArrowLayer {
  #group;
  #materials;
  /** @type {Map<number, THREE.Mesh>} */
  #meshes = new Map();

  /**
   * @param {THREE.Object3D} parent groupe racine du terrain (pitchGroup)
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — flèches tactiques (couche et ressources)
   */
  constructor(parent) {
    this.#group = new THREE.Group();
    this.#group.name = 'tactical-arrows';
    parent.add(this.#group);
    this.#materials = Object.fromEntries(Object.entries(ARROW_STYLES).map(([kind, { color }]) => [
      kind, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
    ]));
  }

  /**
   * Groupe qui contient les flèches.
   * @returns {THREE.Group}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — flèches tactiques (couche et ressources)
   */
  get group() {
    return this.#group;
  }

  /**
   * Nombre de flèches dessinées.
   * @returns {number}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — flèches tactiques (couche et ressources)
   */
  get count() {
    return this.#meshes.size;
  }

  /**
   * Fait correspondre les maillages aux flèches du tableau : ajoute les nouvelles, retire et libère
   * celles qui ont disparu. Une flèche ne change jamais : son identifiant suffit à la reconnaître.
   * @param {Array<{id: number, kind: string, from: {x: number, z: number}, to: {x: number, z: number}}>} arrows
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — flèches tactiques (couche et ressources)
   */
  sync(arrows) {
    const ids = new Set(arrows.map(({ id }) => id));
    for (const [id, mesh] of this.#meshes) {
      if (!ids.has(id)) {
        this.#group.remove(mesh);
        mesh.geometry.dispose();
        this.#meshes.delete(id);
      }
    }
    for (const { id, kind, from, to } of arrows) {
      if (this.#meshes.has(id)) {
        continue;
      }
      const length = Math.hypot(to.x - from.x, to.z - from.z);
      const mesh = new THREE.Mesh(buildArrowGeometry(length, ARROW_STYLES[kind]), this.#materials[kind]);
      mesh.name = `arrow-${id}`;
      mesh.userData = { type: 'arrow', id, kind };
      placeArrow(mesh, from, to);
      this.#group.add(mesh);
      this.#meshes.set(id, mesh);
    }
  }

  /**
   * Retire toutes les flèches et libère géométries et matériaux.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — flèches tactiques (couche et ressources)
   */
  dispose() {
    this.sync([]);
    for (const material of Object.values(this.#materials)) {
      material.dispose();
    }
    this.#group.removeFromParent();
  }
}

/**
 * Aperçu translucide de la flèche en cours de tracé, du départ au point survolé.
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Scène 3D — flèches tactiques (aperçu)
 */
export class ArrowPreview {
  #group;
  #shaft;
  #head;
  #material;

  /**
   * @param {THREE.Object3D} parent groupe racine du terrain (pitchGroup)
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — flèches tactiques (aperçu)
   */
  constructor(parent) {
    const { shaftWidth, headLength, headWidth } = ARROW_DIMENSIONS;
    this.#material = new THREE.MeshBasicMaterial({
      color: ARROW_STYLES.pass.color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
    });
    // Corps de longueur 1, étiré à chaque image ; pointe de taille fixe.
    const shaftGeometry = new THREE.BufferGeometry();
    shaftGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, -shaftWidth / 2, 1, 0, -shaftWidth / 2, 1, 0, shaftWidth / 2,
      0, 0, -shaftWidth / 2, 1, 0, shaftWidth / 2, 0, 0, shaftWidth / 2,
    ], 3));
    const headGeometry = new THREE.BufferGeometry();
    headGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, -headWidth / 2, headLength, 0, 0, 0, 0, headWidth / 2,
    ], 3));
    this.#shaft = new THREE.Mesh(shaftGeometry, this.#material);
    this.#head = new THREE.Mesh(headGeometry, this.#material);
    this.#group = new THREE.Group();
    this.#group.name = 'arrow-preview';
    this.#group.add(this.#shaft, this.#head);
    this.#group.visible = false;
    parent.add(this.#group);
  }

  /**
   * Vrai quand l'aperçu est affiché.
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — flèches tactiques (aperçu)
   */
  get visible() {
    return this.#group.visible;
  }

  /**
   * Affiche l'aperçu de « from » à « to », sans rien allouer.
   * @param {{x: number, z: number}} from départ, dans le repère du terrain
   * @param {{x: number, z: number}} to point survolé, dans le repère du terrain
   * @param {string} kind type de flèche (ARROW_STYLES)
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — flèches tactiques (aperçu)
   */
  update(from, to, kind) {
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length < 1e-4) {
      this.hide();
      return;
    }
    const { headLength, height } = ARROW_DIMENSIONS;
    const head = Math.min(headLength, length * 0.45);
    this.#shaft.scale.set(Math.max(1e-4, length - head), 1, 1);
    this.#head.position.x = length - head;
    this.#head.scale.setScalar(head / headLength);
    placeArrow(this.#group, from, to, height + 0.0001);
    this.#material.color.setHex(ARROW_STYLES[kind]?.color ?? ARROW_STYLES.pass.color);
    this.#group.visible = true;
  }

  /**
   * Masque l'aperçu.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — flèches tactiques (aperçu)
   */
  hide() {
    this.#group.visible = false;
  }

  /**
   * Libère les géométries et le matériau de l'aperçu.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — flèches tactiques (aperçu)
   */
  dispose() {
    this.#shaft.geometry.dispose();
    this.#head.geometry.dispose();
    this.#material.dispose();
    this.#group.removeFromParent();
  }
}
