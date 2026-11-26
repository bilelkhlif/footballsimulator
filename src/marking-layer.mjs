/**
 * Marquages individuels en 3D : un trait fin du défenseur vers l'attaquant qu'il marque, à la
 * couleur de l'équipe du défenseur. Observateur du tableau tactique (patron Observer) : la couche
 * crée et retire ses traits quand les marquages changent, sans jamais modifier le tableau.
 *
 * Les joueurs glissent vers leurs places (formations, déplacements, séquence) : chaque trait est
 * replacé à chaque image d'après la position affichée des deux pions. C'est une tâche de la boucle
 * de rendu (update), dans le repère du terrain : elle reste juste quand le terrain est posé et
 * tourné en AR.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';
import { TEAMS } from './config.mjs';

/** Largeur d'un trait de marquage : 2,5 mm de maquette, soit 44 cm réels. */
export const MARKING_LINE_WIDTH = 0.0025;

/** Hauteur du trait au-dessus du gazon, sous les flèches (1,2 mm) et au-dessus des lignes. */
export const MARKING_LINE_HEIGHT = 0.0009;

/**
 * Couche des traits de marquage.
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Scène 3D — marquage individuel (observateur, tâche de la boucle de rendu)
 */
export class MarkingLayer {
  #board;
  #teamGroups;
  #group = new THREE.Group();
  #geometry;
  /** @type {Record<string, THREE.MeshBasicMaterial>} */
  #materials;
  /** @type {Map<string, {mesh: THREE.Mesh, defender: THREE.Object3D, attacker: THREE.Object3D}>} */
  #lines = new Map();
  #unsubscribe;

  /**
   * @param {object} options
   * @param {THREE.Object3D} options.pitchGroup groupe racine du terrain
   * @param {import('./tactics-board.mjs').TacticsBoard} options.board
   * @param {Record<string, THREE.Group>} options.teamGroups groupe des joueurs de chaque équipe
   * @param {Record<string, {color: number}>} [options.teams]
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Scène 3D — marquage individuel (observateur, tâche de la boucle de rendu)
   */
  constructor({ pitchGroup, board, teamGroups, teams = TEAMS }) {
    this.#board = board;
    this.#teamGroups = teamGroups;
    this.#group.name = 'marking-lines';
    // Quadrilatère d'une unité de long, le long de +X : étiré à la longueur du marquage.
    this.#geometry = new THREE.PlaneGeometry(1, MARKING_LINE_WIDTH);
    this.#geometry.rotateX(-Math.PI / 2);
    this.#geometry.translate(0.5, 0, 0);
    this.#materials = Object.fromEntries(Object.keys(teamGroups).map((teamId) => [teamId, new THREE.MeshBasicMaterial({
      color: teams[teamId].color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide,
    })]));
    pitchGroup.add(this.#group);
    this.#unsubscribe = board.on('change', () => this.sync());
    this.sync();
  }

  /**
   * Nombre de traits affichés.
   * @returns {number}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Scène 3D — marquage individuel (observateur, tâche de la boucle de rendu)
   */
  get count() {
    return this.#lines.size;
  }

  /**
   * Crée les traits des nouveaux marquages et retire ceux qui n'existent plus.
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Scène 3D — marquage individuel (observateur, tâche de la boucle de rendu)
   */
  sync() {
    const wanted = new Map(this.#board.getMarkings().map((marking) => [
      `${marking.defender.teamId}:${marking.defender.number}>${marking.attacker.teamId}:${marking.attacker.number}`, marking,
    ]));
    for (const [key, { mesh }] of this.#lines) {
      if (!wanted.has(key)) {
        this.#group.remove(mesh);
        this.#lines.delete(key);
      }
    }
    for (const [key, { defender, attacker }] of wanted) {
      if (this.#lines.has(key)) continue;
      const mesh = new THREE.Mesh(this.#geometry, this.#materials[defender.teamId]);
      mesh.name = `marking-${key}`;
      this.#group.add(mesh);
      this.#lines.set(key, { mesh, defender: this.#playerObject(defender), attacker: this.#playerObject(attacker) });
    }
    this.update();
  }

  /**
   * Tâche de chaque image : replace chaque trait entre les deux pions, à leur position affichée.
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Scène 3D — marquage individuel (observateur, tâche de la boucle de rendu)
   */
  update() {
    for (const { mesh, defender, attacker } of this.#lines.values()) {
      const dx = attacker.position.x - defender.position.x;
      const dz = attacker.position.z - defender.position.z;
      mesh.position.set(defender.position.x, MARKING_LINE_HEIGHT, defender.position.z);
      mesh.rotation.set(0, Math.atan2(-dz, dx), 0);
      mesh.scale.set(Math.max(Math.hypot(dx, dz), 1e-6), 1, 1);
    }
  }

  /**
   * Retire la couche et libère ses ressources.
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Scène 3D — marquage individuel (observateur, tâche de la boucle de rendu)
   */
  dispose() {
    this.#unsubscribe();
    this.#group.removeFromParent();
    this.#geometry.dispose();
    Object.values(this.#materials).forEach((material) => material.dispose());
  }

  /**
   * Pion d'un joueur dans la scène.
   * @param {{teamId: string, number: number}} player
   * @returns {THREE.Object3D}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Scène 3D — marquage individuel (observateur, tâche de la boucle de rendu)
   */
  #playerObject({ teamId, number }) {
    return this.#teamGroups[teamId].children.find((object) => object.userData.number === number);
  }
}
