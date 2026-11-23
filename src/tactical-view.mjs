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
 * déplacement, et l'aperçu de la destination suit le point survolé, sans rien allouer. Depuis les
 * règles des flèches (docs/regles-des-fleches.md), l'aperçu montre le jugement du toucher à venir :
 * aux couleurs de la flèche et cerclé à l'arrivée s'il est valide, rouge s'il est refusé ; le
 * receveur d'une passe est entouré. En mode passe, avant le départ, des anneaux pulsés marquent
 * les départs possibles (le ballon, l'arrivée des passes déjà tracées). En mode déplacer, un anneau
 * montre la place visée.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';
import { assignFormationRoles } from './team.mjs';
import { ARROW_STYLES, ArrowLayer, ArrowPreview, INVALID_COLOR } from './tactical-arrows.mjs';
import { TRANSITION_DURATION_MS } from './formation-transition.mjs';
import { passOrigins } from './arrow-rules.mjs';

/** Durée d'un déplacement à la main, en millisecondes. */
export const MOVE_DURATION_MS = 350;

/** Couleur de l'anneau de sélection : l'or de l'interface. */
const SELECTION_COLOR = 0xe3a81a;

/** Couleur de la place visée par un déplacement valide. */
const DESTINATION_COLOR = 0x9ed3ae;

/** Hauteur des repères au-dessus du gazon, en mètres. */
const MARKER_HEIGHT = 0.0013;

/** Nombre maximal de départs de passe marqués à la fois (le ballon et les passes tracées). */
const MAX_ORIGIN_MARKERS = 8;

/** Période de la pulsation des départs de passe, en millisecondes. */
const PULSE_PERIOD_MS = 1200;

/** Aucun départ de passe à marquer. */
const NO_ORIGINS = Object.freeze([]);

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
  #endMarker;
  #receiverRing;
  #ghost;
  #originMarkers = [];
  #interaction = null;
  #selectedObject = null;
  #draftStart = null;
  #draftKind = null;
  #showOrigins = false;
  #originsState = null;
  #origins = NO_ORIGINS;
  #unsubscribers = [];

  /**
   * @param {object} options
   * @param {import('./tactics-board.mjs').TacticsBoard} options.board état tactique observé
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
    this.#endMarker = this.#createMarker(new THREE.RingGeometry(0.0045, 0.0072, 32), ARROW_STYLES.pass.color, 'arrow-end');
    this.#receiverRing = this.#createMarker(new THREE.RingGeometry(0.0125, 0.0158, 40), ARROW_STYLES.pass.color, 'receiver-ring');
    this.#ghost = this.#createMarker(new THREE.RingGeometry(0.008, 0.0105, 36), DESTINATION_COLOR, 'move-destination');
    const originGeometry = new THREE.RingGeometry(0.0085, 0.0105, 36);
    originGeometry.rotateX(-Math.PI / 2);
    const originMaterial = new THREE.MeshBasicMaterial({ color: ARROW_STYLES.pass.color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    for (let index = 0; index < MAX_ORIGIN_MARKERS; index += 1) {
      const marker = new THREE.Mesh(originGeometry, originMaterial);
      marker.name = `pass-origin-${index}`;
      marker.visible = false;
      pitchGroup.add(marker);
      this.#originMarkers.push(marker);
    }

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
   * @param {import('./tactical-interaction.mjs').TacticalInteraction} interaction
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — vue tactique (observateur du tableau tactique)
   */
  bindInteraction(interaction) {
    this.#interaction = interaction;
    this.#unsubscribers.push(interaction.on('statechange', ({ mode, state, selection, arrowStart }) => {
      this.#selectedObject = this.objectFor(selection);
      this.#draftStart = arrowStart;
      this.#draftKind = mode;
      this.#showOrigins = mode === 'pass' && state === 'arrow-start';
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
   * Ramène chaque joueur et le ballon à sa place du tableau, depuis l'endroit où il est affiché
   * (sprint 6 : fin de la lecture d'une séquence, qui les avait déplacés sans changer le tableau).
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Scène 3D — vue tactique (observateur du tableau tactique)
   */
  returnToBoard() {
    for (const { object, teamId, number } of this.#players) {
      const target = this.#board.getPlayerPosition(teamId, number);
      this.#targets.set(object, target);
      this.#animator.moveTo(object, target, { duration: this.#moveDuration });
    }
    const ball = this.#board.getBallPosition();
    this.#targets.set(this.#ball, ball);
    this.#animator.moveTo(this.#ball, ball, { duration: this.#moveDuration });
  }

  /**
   * Travail d'une image : anneau de sélection, départs de passe possibles, départ, aperçu jugé de
   * la flèche en cours et de son receveur, place visée par un déplacement.
   * @param {number} [time] temps de la boucle de rendu, en millisecondes (pulsation des départs)
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Scène 3D — vue tactique (observateur du tableau tactique)
   */
  update(time = 0) {
    const selected = this.#selectedObject;
    this.#ring.visible = Boolean(selected);
    if (selected) {
      this.#ring.position.set(selected.position.x, MARKER_HEIGHT, selected.position.z);
      this.#ring.scale.setScalar(selected === this.#ball ? 0.6 : 1);
    }
    this.#updateOrigins(time);
    const hover = this.#interaction?.hoverPoint ?? null;
    const verdict = hover ? this.#interaction.hoverVerdict : null;
    this.#updateMoveGhost(selected, hover, verdict);

    const start = this.#draftStart;
    this.#startMarker.visible = Boolean(start);
    this.#receiverRing.visible = false;
    if (!start || !hover || verdict?.cancel) {
      this.#preview.hide();
      this.#endMarker.visible = false;
      if (start) {
        this.#startMarker.position.set(start.x, MARKER_HEIGHT, start.z);
      }
      return;
    }
    this.#startMarker.position.set(start.x, MARKER_HEIGHT, start.z);
    const valid = verdict?.valid ?? true;
    const color = valid ? (ARROW_STYLES[this.#draftKind]?.color ?? ARROW_STYLES.pass.color) : INVALID_COLOR;
    this.#preview.update(start, hover, this.#draftKind, { valid });
    this.#endMarker.visible = true;
    this.#endMarker.position.set(hover.x, MARKER_HEIGHT + 0.0001, hover.z);
    this.#endMarker.material.color.setHex(color);
    const receiver = valid ? this.objectFor(verdict?.receiver ?? null) : null;
    if (receiver) {
      this.#receiverRing.visible = true;
      this.#receiverRing.position.set(receiver.position.x, MARKER_HEIGHT, receiver.position.z);
      this.#receiverRing.material.color.setHex(color);
    }
  }

  /**
   * Anneaux pulsés aux départs possibles d'une passe, tant qu'une passe n'est pas commencée.
   * @param {number} time
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Scène 3D — vue tactique : départs possibles d'une passe
   */
  #updateOrigins(time) {
    let origins = NO_ORIGINS;
    if (this.#showOrigins && this.#interaction) {
      // L'état des règles ne change qu'avec le tableau : départs recalculés seulement alors.
      const state = this.#interaction.rulesState;
      if (state !== this.#originsState) {
        this.#originsState = state;
        this.#origins = passOrigins(state);
      }
      origins = this.#origins;
    }
    const pulse = 1 + 0.18 * Math.sin((time / PULSE_PERIOD_MS) * Math.PI * 2);
    for (let index = 0; index < this.#originMarkers.length; index += 1) {
      const marker = this.#originMarkers[index];
      const origin = origins[index];
      marker.visible = Boolean(origin);
      if (origin) {
        marker.position.set(origin.x, MARKER_HEIGHT, origin.z);
        marker.scale.setScalar(pulse);
      }
    }
  }

  /**
   * Place visée par un déplacement : anneau vert si valide, rouge hors du plateau.
   * @param {THREE.Object3D|null} selected objet sélectionné
   * @param {THREE.Vector3|null} hover point survolé
   * @param {{valid: boolean}|null} verdict jugement de l'aperçu
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Scène 3D — vue tactique : aperçu d'un déplacement
   */
  #updateMoveGhost(selected, hover, verdict) {
    const show = Boolean(selected && hover && !this.#draftStart);
    this.#ghost.visible = show;
    if (show) {
      this.#ghost.position.set(hover.x, MARKER_HEIGHT, hover.z);
      this.#ghost.scale.setScalar(selected === this.#ball ? 0.6 : 1);
      this.#ghost.material.color.setHex(verdict?.valid ? DESTINATION_COLOR : INVALID_COLOR);
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
    for (const marker of [this.#ring, this.#startMarker, this.#endMarker, this.#receiverRing, this.#ghost]) {
      marker.geometry.dispose();
      marker.material.dispose();
      marker.removeFromParent();
    }
    const [first] = this.#originMarkers;
    first.geometry.dispose();
    first.material.dispose();
    for (const marker of this.#originMarkers) {
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
