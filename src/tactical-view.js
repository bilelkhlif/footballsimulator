/**
 * Vue tactique (sprint 5) : la scène 3D suit le tableau tactique (patron Observer).
 *
 * À chaque événement change du tableau, la vue compare la place voulue de chaque joueur et du
 * ballon à la dernière place demandée, et lance un déplacement pour ceux qui changent : 0,35 s pour
 * un déplacement à la main, 0,7 s pour un changement de formation, une annulation ou une
 * réinitialisation. Elle fait aussi correspondre les flèches 3D à celles du tableau.
 *
 * C'est le seul chemin entre l'état tactique et la scène. Les commandes, leurs annulations et
 * leurs rétablissements passent tous par lui : la scène ne peut pas diverger du tableau. Un
 * déplacement en cours est remplacé par le suivant (FormationAnimator.moveTo), qui repart de la
 * position affichée : un joueur déplacé à la main pendant une transition de formation quitte cette
 * transition sans saut, et les autres joueurs la terminent.
 *
 * À chaque image (update), l'anneau de sélection suit l'objet sélectionné, même pendant son
 * déplacement, et l'aperçu de la flèche en cours suit le point survolé, sans rien allouer.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';
import { assignFormationRoles } from './team.js';
import { ARROW_STYLES, ArrowLayer, ArrowPreview } from './tactical-arrows.js';
import { TRANSITION_DURATION_MS } from './formation-transition.js';

/** Durée d'un déplacement à la main, en millisecondes. */
export const MOVE_DURATION_MS = 350;

/** Couleur de l'anneau de sélection : l'or de l'interface. */
const SELECTION_COLOR = 0xe3a81a;

/** Hauteur des repères au-dessus du gazon, en mètres. */
const MARKER_HEIGHT = 0.0013;

/**
 * Vue de la tactique dans la scène 3D.
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Scène 3D — vue tactique (observateur du tableau tactique)
 */
export class TacticalView {
  #board;
  #pitchGroup;
  #teamGroups;
  #teams;
  #ball;
  #animator;
  #moveDuration;
  #formationDuration;
  /** @type {Array<{object: THREE.Object3D, teamId: string, number: number}>} */
  #players = [];
  /** @type {Map<THREE.Object3D, {x: number, z: number}>} dernière place demandée, par objet */
  #targets = new Map();
  #hitboxes = [];
  #arrowLayer;
  #preview;
  #ring;
  #startMarker;
  #interaction = null;
  #selectedObject = null;
  #draftStart = null;
  #draftKind = null;
  #unsubscribers = [];

  /**
   * @param {object} options
   * @param {import('./tactics-board.js').TacticsBoard} options.board état tactique observé
   * @param {THREE.Object3D} options.pitchGroup groupe racine du terrain
   * @param {Record<string, THREE.Group>} options.teamGroups groupe de chaque équipe (createTeam)
   * @param {Record<string, {attacksPositiveX: boolean}>} options.teams équipes (config.TEAMS)
   * @param {THREE.Object3D} options.ball ballon (createBall)
   * @param {{moveTo: Function}} options.animator déplacements animés (FormationAnimator)
   * @param {number} [options.moveDuration] durée d'un déplacement à la main (0 : sans animation)
   * @param {number} [options.formationDuration] durée d'une transition de formation
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — vue tactique (observateur du tableau tactique)
   */
  constructor({
    board, pitchGroup, teamGroups, teams, ball, animator,
    moveDuration = MOVE_DURATION_MS, formationDuration = TRANSITION_DURATION_MS,
  }) {
    this.#board = board;
    this.#pitchGroup = pitchGroup;
    this.#teamGroups = teamGroups;
    this.#teams = teams;
    this.#ball = ball;
    this.#animator = animator;
    this.#moveDuration = moveDuration;
    this.#formationDuration = formationDuration;

    for (const [teamId, teamGroup] of Object.entries(teamGroups)) {
      for (const object of teamGroup.children) {
        const { number } = object.userData;
        this.#players.push({ object, teamId, number });
        this.#targets.set(object, board.getPlayerPosition(teamId, number));
        this.#hitboxes.push(object.getObjectByName('hitbox'));
      }
    }
    this.#targets.set(ball, board.getBallPosition());
    this.#hitboxes.push(ball.getObjectByName('hitbox'));

    this.#arrowLayer = new ArrowLayer(pitchGroup);
    this.#arrowLayer.sync(board.getArrows());
    this.#preview = new ArrowPreview(pitchGroup);
    this.#ring = this.#createMarker(new THREE.RingGeometry(0.0115, 0.0155, 40), SELECTION_COLOR, 'selection-ring');
    this.#startMarker = this.#createMarker(new THREE.CircleGeometry(0.0055, 24), ARROW_STYLES.pass.color, 'arrow-start');

    this.#unsubscribers.push(
      board.on('change', ({ type }) => this.sync(type)),
      board.on('formationchange', ({ teamId, formation }) => {
        assignFormationRoles(this.#teamGroups[teamId], this.#teams[teamId], formation);
      }),
    );
  }

  /**
   * Zones de sélection des 22 joueurs et du ballon, pour le raycasting.
   * @returns {THREE.Object3D[]}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — vue tactique (observateur du tableau tactique)
   */
  get hitboxes() {
    return this.#hitboxes;
  }

  /**
   * Couche des flèches 3D.
   * @returns {ArrowLayer}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — vue tactique (observateur du tableau tactique)
   */
  get arrowLayer() {
    return this.#arrowLayer;
  }

  /**
   * Objet 3D d'une sélection : un joueur, reconnu par son équipe et son numéro, ou le ballon.
   * @param {{type: string, teamId?: string, number?: number}|null} selection
   * @returns {THREE.Object3D|null}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — vue tactique (observateur du tableau tactique)
   */
  objectFor(selection) {
    if (!selection) {
      return null;
    }
    if (selection.type === 'ball') {
      return this.#ball;
    }
    return this.#players.find(({ teamId, number }) => teamId === selection.teamId && number === selection.number)?.object ?? null;
  }

  /**
   * Relie la vue à l'interaction : anneau de sélection, départ et aperçu des flèches.
   * @param {import('./tactical-interaction.js').TacticalInteraction} interaction
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — vue tactique (observateur du tableau tactique)
   */
  bindInteraction(interaction) {
    this.#interaction = interaction;
    this.#unsubscribers.push(interaction.on('statechange', ({ mode, selection, arrowStart }) => {
      this.#selectedObject = this.objectFor(selection);
      this.#draftStart = arrowStart;
      this.#draftKind = mode;
      if (arrowStart) {
        this.#startMarker.material.color.setHex(ARROW_STYLES[mode]?.color ?? ARROW_STYLES.pass.color);
      }
    }));
  }

  /**
   * Fait suivre au tableau les joueurs, le ballon et les flèches de la scène.
   * @param {string} [type] type de changement (événement change du tableau)
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — vue tactique (observateur du tableau tactique)
   */
  sync(type = 'restore') {
    const duration = type === 'player' || type === 'ball' ? this.#moveDuration : this.#formationDuration;
    for (const { object, teamId, number } of this.#players) {
      this.#moveIfChanged(object, this.#board.getPlayerPosition(teamId, number), duration);
    }
    this.#moveIfChanged(this.#ball, this.#board.getBallPosition(), duration);
    this.#arrowLayer.sync(this.#board.getArrows());
  }

  /**
   * Travail d'une image : anneau de sélection, départ et aperçu de la flèche en cours.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — vue tactique (observateur du tableau tactique)
   */
  update() {
    const selected = this.#selectedObject;
    this.#ring.visible = Boolean(selected);
    if (selected) {
      this.#ring.position.set(selected.position.x, MARKER_HEIGHT, selected.position.z);
      this.#ring.scale.setScalar(selected === this.#ball ? 0.6 : 1);
    }
    const start = this.#draftStart;
    this.#startMarker.visible = Boolean(start);
    if (!start) {
      this.#preview.hide();
      return;
    }
    this.#startMarker.position.set(start.x, MARKER_HEIGHT, start.z);
    const hover = this.#interaction?.hoverPoint ?? null;
    if (hover) {
      this.#preview.update(start, hover, this.#draftKind);
    } else {
      this.#preview.hide();
    }
  }

  /**
   * Désabonne la vue et libère ses ressources : flèches, aperçu, anneau et repère.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — vue tactique (observateur du tableau tactique)
   */
  dispose() {
    for (const unsubscribe of this.#unsubscribers) {
      unsubscribe();
    }
    this.#unsubscribers.length = 0;
    this.#arrowLayer.dispose();
    this.#preview.dispose();
    for (const marker of [this.#ring, this.#startMarker]) {
      marker.geometry.dispose();
      marker.material.dispose();
      marker.removeFromParent();
    }
  }

  /**
   * Lance le déplacement d'un objet si sa place voulue a changé depuis la dernière demande.
   * @param {THREE.Object3D} object
   * @param {{x: number, z: number}} target place voulue, dans le repère du terrain
   * @param {number} duration en millisecondes
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — vue tactique (observateur du tableau tactique)
   */
  #moveIfChanged(object, target, duration) {
    const last = this.#targets.get(object);
    if (last && last.x === target.x && last.z === target.z) {
      return;
    }
    this.#targets.set(object, target);
    this.#animator.moveTo(object, target, { duration });
  }

  /**
   * Crée un repère couché sur le gazon (anneau de sélection, départ de flèche), masqué.
   * @param {THREE.BufferGeometry} geometry géométrie dans le plan XY, couchée ici sur le gazon
   * @param {number} color
   * @param {string} name
   * @returns {THREE.Mesh}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — vue tactique (observateur du tableau tactique)
   */
  #createMarker(geometry, color, name) {
    geometry.rotateX(-Math.PI / 2);
    const marker = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    marker.name = name;
    marker.visible = false;
    this.#pitchGroup.add(marker);
    return marker;
  }
}
