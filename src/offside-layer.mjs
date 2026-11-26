/**
 * Lignes de hors-jeu en 3D : une ligne par équipe qui attaque, en travers de tout le terrain, à
 * la couleur de l'équipe concernée. Observateur du tableau tactique (patron Observer) : la couche
 * recalcule les lignes à chaque changement et ne modifie jamais le tableau. Dans le repère du
 * terrain (pitchGroup), elle reste juste quand le terrain est posé, ancré et tourné en AR.
 *
 * Les lignes sont masquées par défaut : l'entraîneur les affiche depuis la carte Analyse tactique.
 * C'est un réglage d'affichage, pas un état tactique : il n'entre pas dans l'historique.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';
import { PITCH_WIDTH, TEAMS } from './config.mjs';
import { computeOffside } from './offside.mjs';

/** Hauteur des lignes au-dessus du gazon, sous les anneaux de sélection (1,3 mm). */
export const OFFSIDE_LINE_HEIGHT = 0.0011;

/** Largeur d'une ligne : 2 mm de maquette, soit 35 cm réels, lisible sur une table. */
export const OFFSIDE_LINE_WIDTH = 0.002;

/**
 * Couche des lignes de hors-jeu, une par équipe qui attaque.
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Scène 3D — lignes de hors-jeu (observateur)
 */
export class OffsideLayer {
  #board;
  #teams;
  #group = new THREE.Group();
  /** @type {Map<string, THREE.Mesh>} ligne de chaque équipe qui attaque */
  #lines = new Map();
  #unsubscribers = [];

  /**
   * @param {object} options
   * @param {THREE.Object3D} options.pitchGroup groupe racine du terrain
   * @param {import('./tactics-board.mjs').TacticsBoard} options.board
   * @param {Record<string, {id: string, color: number, attacksPositiveX: boolean}>} [options.teams]
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Scène 3D — lignes de hors-jeu (observateur)
   */
  constructor({ pitchGroup, board, teams = TEAMS }) {
    this.#board = board;
    this.#teams = teams;
    this.#group.name = 'offside-lines';
    this.#group.visible = false;
    const geometry = new THREE.PlaneGeometry(OFFSIDE_LINE_WIDTH, PITCH_WIDTH);
    geometry.rotateX(-Math.PI / 2);
    for (const teamId of board.teamIds) {
      const material = new THREE.MeshBasicMaterial({
        color: teams[teamId].color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
      });
      const line = new THREE.Mesh(geometry, material);
      line.name = `offside-line-${teamId}`;
      line.position.y = OFFSIDE_LINE_HEIGHT;
      this.#lines.set(teamId, line);
      this.#group.add(line);
    }
    pitchGroup.add(this.#group);
    this.#unsubscribers.push(board.on('change', () => this.sync()));
    this.sync();
  }

  /**
   * Vrai si les lignes sont affichées.
   * @returns {boolean}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Scène 3D — lignes de hors-jeu (observateur)
   */
  get visible() {
    return this.#group.visible;
  }

  /**
   * Affiche ou masque les lignes.
   * @param {boolean} visible
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Scène 3D — lignes de hors-jeu (observateur)
   */
  set visible(visible) {
    this.#group.visible = Boolean(visible);
  }

  /**
   * Ligne d'une équipe qui attaque (pour les tests et le débogage).
   * @param {string} teamId
   * @returns {THREE.Mesh|undefined}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Scène 3D — lignes de hors-jeu (observateur)
   */
  lineFor(teamId) {
    return this.#lines.get(teamId);
  }

  /**
   * Replace chaque ligne d'après le tableau tactique.
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Scène 3D — lignes de hors-jeu (observateur)
   */
  sync() {
    for (const [teamId, line] of this.#lines) {
      line.position.x = computeOffside(this.#board, teamId, this.#teams).x;
      line.material.color.setHex(this.#board.getIdentity(teamId).color);
    }
  }

  /**
   * Retire la couche de la scène et libère ses ressources.
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Scène 3D — lignes de hors-jeu (observateur)
   */
  dispose() {
    this.#unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.#group.removeFromParent();
    const [first] = this.#lines.values();
    first?.geometry.dispose();
    for (const line of this.#lines.values()) line.material.dispose();
  }
}
