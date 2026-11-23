/**
 * Tableau tactique : l'état complet de la tactique, sans rien savoir de la scène 3D ni de
 * l'interface HTML (cahier §2.2 et §3.4).
 *
 * Sprint 4 : la formation en place de chaque équipe (BF4).
 * Sprint 5 : la place de chaque joueur (BF5), celle du ballon (BF6) et les flèches tactiques (BF7),
 * toutes dans le repère du terrain (pitchGroup) : x le long du terrain, z en largeur, en mètres.
 * Un joueur est reconnu par son équipe et son numéro de maillot.
 *
 * C'est le sujet du patron Observer : chaque changement émet un événement, et la scène
 * (src/tactical-view.mjs) comme l'interface y répondent. Les actions de l'utilisateur ne le modifient
 * pas directement : elles passent par des commandes (src/commands.mjs, patron Command), qui savent
 * s'annuler grâce aux instantanés (snapshot, captureTeam) que le tableau fournit.
 *
 * Le tableau refuse tout état incohérent : une place hors du plateau, une flèche dont l'arrivée sort
 * des lignes du terrain, trop courte, aux coordonnées invalides, ou identique à une flèche déjà
 * tracée lève une erreur avant toute modification. C'est la dernière garde : l'interface applique
 * avant elle les règles complètes des flèches (src/arrow-rules.mjs, docs/regles-des-fleches.md), et
 * une flèche refusée n'entre jamais dans l'historique.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { EventEmitter } from './events.mjs';
import { getFormation } from './formations.mjs';
import { computeTeamTargets } from './formation-transition.mjs';
import { BALL_RADIUS, BOARD_LENGTH, BOARD_WIDTH, PITCH_LENGTH, PITCH_WIDTH, PLAYER_SIZE, TEAMS } from './config.mjs';

/** Demi-longueur et demi-largeur du plateau (terrain et bande de gazon), en mètres. */
export const BOARD_HALF_EXTENTS = Object.freeze({ x: BOARD_LENGTH / 2, z: BOARD_WIDTH / 2 });

/** Demi-longueur et demi-largeur du terrain, lignes de touche et de but comprises, en mètres. */
export const PITCH_HALF_EXTENTS = Object.freeze({ x: PITCH_LENGTH / 2, z: PITCH_WIDTH / 2 });

/** Tolérance au bord du terrain : un point posé sur une ligne est sur le terrain (1 mm). */
export const LINE_TOLERANCE = 0.001;

/** Distance sous laquelle deux extrémités de flèche sont confondues (doublon), en mètres (5 mm). */
export const DUPLICATE_TOLERANCE = 0.005;

/** Marge d'un joueur au bord du plateau : son socle (1,4 fois le rayon du pion) reste dessus. */
export const PLAYER_MARGIN = PLAYER_SIZE.radius * 1.4;

/** Marge du ballon au bord du plateau : son rayon. */
export const BALL_MARGIN = BALL_RADIUS;

/** Types de flèches tactiques : passe (trajet du ballon) et course (déplacement d'un joueur). */
export const ARROW_KINDS = Object.freeze({ PASS: 'pass', RUN: 'run' });

/** Longueur minimale d'une flèche, en mètres (2 cm, environ 3,5 m sur un vrai terrain). */
export const MIN_ARROW_LENGTH = 0.02;

/** Tolérance des comparaisons de positions, en mètres. */
const EPSILON = 1e-9;

/**
 * Indique si une place est sur le plateau, avec une marge au bord.
 * @param {{x: number, z: number}} position place dans le repère du terrain
 * @param {number} [margin] marge au bord, en mètres
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Logique métier — limites du plateau
 */
export function isOnBoard(position, margin = 0) {
  return Number.isFinite(position?.x) && Number.isFinite(position?.z)
    && Math.abs(position.x) <= BOARD_HALF_EXTENTS.x - margin + EPSILON
    && Math.abs(position.z) <= BOARD_HALF_EXTENTS.z - margin + EPSILON;
}

/**
 * Indique si un point est sur le terrain : entre les lignes de touche et de but, lignes comprises.
 * La bande de gazon autour des lignes n'en fait pas partie.
 * @param {{x: number, z: number}} position point dans le repère du terrain
 * @param {number} [tolerance] marge au-delà des lignes, en mètres
 * @returns {boolean} faux aussi pour des coordonnées non finies (NaN, infini)
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Logique métier — limites du terrain (règles des flèches)
 */
export function isOnPitch(position, tolerance = LINE_TOLERANCE) {
  return Number.isFinite(position?.x) && Number.isFinite(position?.z)
    && Math.abs(position.x) <= PITCH_HALF_EXTENTS.x + tolerance
    && Math.abs(position.z) <= PITCH_HALF_EXTENTS.z + tolerance;
}

/**
 * Indique si deux flèches ont le même type et le même tracé, à DUPLICATE_TOLERANCE près.
 * @param {{kind: string, from: {x: number, z: number}, to: {x: number, z: number}}} a
 * @param {{kind: string, from: {x: number, z: number}, to: {x: number, z: number}}} b
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Logique métier — doublons de flèches (règles des flèches)
 */
export function sameArrowPath(a, b) {
  return a.kind === b.kind
    && Math.hypot(a.from.x - b.from.x, a.from.z - b.from.z) <= DUPLICATE_TOLERANCE
    && Math.hypot(a.to.x - b.to.x, a.to.z - b.to.z) <= DUPLICATE_TOLERANCE;
}

/**
 * Ramène une place sur le plateau, à la marge près : un pion posé tout au bord reste entier
 * sur le plateau.
 * @param {{x: number, z: number}} position
 * @param {number} [margin] marge au bord, en mètres
 * @returns {{x: number, z: number}} nouvelle place
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Logique métier — limites du plateau
 */
export function clampToBoard(position, margin = 0) {
  const limitX = BOARD_HALF_EXTENTS.x - margin;
  const limitZ = BOARD_HALF_EXTENTS.z - margin;
  return {
    x: Math.min(limitX, Math.max(-limitX, position.x)),
    z: Math.min(limitZ, Math.max(-limitZ, position.z)),
  };
}

/**
 * Clé d'un joueur : son équipe et son numéro, qui ne changent jamais.
 * @param {string} teamId
 * @param {number} number
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Logique métier — identité des joueurs
 */
function playerKey(teamId, number) {
  return `${teamId}:${number}`;
}

/**
 * Copie d'une place, réduite à x et z.
 * @param {{x: number, z: number}} position
 * @returns {{x: number, z: number}}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Logique métier — tableau tactique (sujet du patron Observer)
 */
function copyPosition({ x, z }) {
  return { x, z };
}

/**
 * Indique si deux places sont identiques.
 * @param {{x: number, z: number}} a
 * @param {{x: number, z: number}} b
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Logique métier — tableau tactique (sujet du patron Observer)
 */
function samePosition(a, b) {
  return Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.z - b.z) <= EPSILON;
}

/**
 * État tactique des deux équipes : formations, places des joueurs, ballon et flèches.
 *
 * Événements :
 * - formationchange : { teamId, formation, previous } quand la formation d'une équipe change ;
 * - change : { type, teamId?, number? } après chaque modification, type valant « formation »,
 *   « player », « ball », « arrows » ou « restore » (annulation, rétablissement, réinitialisation).
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Logique métier — tableau tactique (sujet du patron Observer)
 */
export class TacticsBoard extends EventEmitter {
  /** @type {Map<string, import('./formations.mjs').FormationStrategy>} */
  #formations = new Map();

  /** @type {Map<string, {x: number, z: number}>} place de chaque joueur, par clé équipe:numéro */
  #players = new Map();

  #ball = { x: 0, z: 0 };

  /** @type {Array<{id: number, kind: string, from: {x: number, z: number}, to: {x: number, z: number}}>} */
  #arrows = [];

  #nextArrowId = 1;
  #teams;
  #initialState;

  /**
   * @param {Record<string, string>} initialFormations nom de la formation de départ de chaque
   *   équipe, par exemple { blue: '4-3-3', red: '4-4-2' }
   * @param {object} [options]
   * @param {Record<string, {attacksPositiveX: boolean}>} [options.teams] sens d'attaque de chaque
   *   équipe (config.TEAMS), pour placer ses joueurs
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Logique métier — tableau tactique (sujet du patron Observer)
   */
  constructor(initialFormations, { teams = TEAMS } = {}) {
    super();
    this.#teams = teams;
    for (const [teamId, name] of Object.entries(initialFormations)) {
      this.#formations.set(teamId, getFormation(name));
      this.#placeTeamInFormation(teamId);
    }
    this.#initialState = this.snapshot();
  }

  /**
   * Identifiants des équipes, dans l'ordre de départ.
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Logique métier — tableau tactique (sujet du patron Observer)
   */
  get teamIds() {
    return [...this.#formations.keys()];
  }

  /**
   * Formation en place d'une équipe.
   * @param {string} teamId
   * @returns {import('./formations.mjs').FormationStrategy}
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Logique métier — tableau tactique (sujet du patron Observer)
   */
  getFormation(teamId) {
    const formation = this.#formations.get(teamId);
    if (!formation) {
      throw new Error(`Équipe inconnue : ${teamId}`);
    }
    return formation;
  }

  /**
   * Change la formation d'une équipe et prévient les observateurs. Les 11 joueurs prennent les
   * places de la nouvelle formation, même ceux que l'utilisateur avait déplacés. Sans effet si la
   * formation demandée est déjà en place.
   * @param {string} teamId
   * @param {string} name nom d'une formation de FORMATIONS, par exemple « 4-4-2 »
   * @returns {import('./formations.mjs').FormationStrategy} la formation précédente
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Logique métier — tableau tactique (sujet du patron Observer)
   */
  setFormation(teamId, name) {
    const previous = this.getFormation(teamId);
    const formation = getFormation(name);
    if (formation !== previous) {
      this.#formations.set(teamId, formation);
      this.#placeTeamInFormation(teamId);
      this.emit('formationchange', { teamId, formation, previous });
      this.emit('change', { type: 'formation', teamId });
    }
    return previous;
  }

  /**
   * Place d'un joueur, dans le repère du terrain.
   * @param {string} teamId
   * @param {number} number numéro du maillot
   * @returns {{x: number, z: number}} copie de la place
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — tableau tactique : places des joueurs
   */
  getPlayerPosition(teamId, number) {
    return copyPosition(this.#requirePlayer(teamId, number));
  }

  /**
   * Déplace un joueur. La place doit être sur le plateau, socle compris.
   * @param {string} teamId
   * @param {number} number numéro du maillot
   * @param {{x: number, z: number}} position nouvelle place, dans le repère du terrain
   * @returns {boolean} vrai si le joueur a changé de place
   * @throws {RangeError} si la place sort du plateau
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — tableau tactique : places des joueurs
   */
  setPlayerPosition(teamId, number, position) {
    const current = this.#requirePlayer(teamId, number);
    if (!isOnBoard(position, PLAYER_MARGIN)) {
      throw new RangeError(`Place hors du plateau pour le joueur ${number} (${teamId})`);
    }
    if (samePosition(current, position)) {
      return false;
    }
    this.#players.set(playerKey(teamId, number), copyPosition(position));
    this.emit('change', { type: 'player', teamId, number });
    return true;
  }

  /**
   * Place du ballon, dans le repère du terrain.
   * @returns {{x: number, z: number}} copie de la place
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — tableau tactique : ballon
   */
  getBallPosition() {
    return copyPosition(this.#ball);
  }

  /**
   * Déplace le ballon. La place doit être sur le plateau.
   * @param {{x: number, z: number}} position
   * @returns {boolean} vrai si le ballon a changé de place
   * @throws {RangeError} si la place sort du plateau
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — tableau tactique : ballon
   */
  setBallPosition(position) {
    if (!isOnBoard(position, BALL_MARGIN)) {
      throw new RangeError('Place hors du plateau pour le ballon');
    }
    if (samePosition(this.#ball, position)) {
      return false;
    }
    this.#ball = copyPosition(position);
    this.emit('change', { type: 'ball' });
    return true;
  }

  /**
   * Flèches tactiques, dans l'ordre où elles ont été tracées.
   * @returns {Array<{id: number, kind: string, from: {x: number, z: number}, to: {x: number, z: number}}>}
   *   copies des flèches
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — tableau tactique : flèches
   */
  getArrows() {
    return this.#arrows.map(({ id, kind, from, to }) => ({ id, kind, from: copyPosition(from), to: copyPosition(to) }));
  }

  /**
   * Ajoute une flèche. Son départ doit être sur le plateau (un joueur ou le ballon peut se trouver
   * sur la bande de gazon, pour une touche par exemple), son arrivée sur le terrain, lignes
   * comprises, à au moins 2 cm du départ, et elle ne doit pas doubler une flèche du même type
   * (DUPLICATE_TOLERANCE). Un identifiant est attribué, sauf s'il est fourni (rétablissement d'une
   * flèche annulée).
   * @param {{kind: string, from: {x: number, z: number}, to: {x: number, z: number}, id?: number}} arrow
   * @returns {{id: number, kind: string, from: {x: number, z: number}, to: {x: number, z: number}}}
   *   la flèche ajoutée
   * @throws {RangeError} si la flèche est invalide
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — tableau tactique : flèches
   */
  addArrow({ kind, from, to, id }) {
    if (!Object.values(ARROW_KINDS).includes(kind)) {
      throw new RangeError(`Type de flèche inconnu : ${kind}`);
    }
    if (!isOnBoard(from)) {
      throw new RangeError('Départ de la flèche hors du plateau');
    }
    if (!isOnPitch(to)) {
      throw new RangeError('Arrivée de la flèche hors du terrain');
    }
    if (Math.hypot(to.x - from.x, to.z - from.z) < MIN_ARROW_LENGTH) {
      throw new RangeError('Flèche trop courte');
    }
    if (id !== undefined && this.#arrows.some((arrow) => arrow.id === id)) {
      throw new RangeError(`Flèche déjà présente : ${id}`);
    }
    if (this.#arrows.some((arrow) => sameArrowPath(arrow, { kind, from, to }))) {
      throw new RangeError('Flèche identique à une flèche déjà tracée');
    }
    const arrow = { id: id ?? this.#nextArrowId, kind, from: copyPosition(from), to: copyPosition(to) };
    this.#nextArrowId = Math.max(this.#nextArrowId, arrow.id + 1);
    this.#arrows.push(arrow);
    this.emit('change', { type: 'arrows' });
    return { ...arrow, from: copyPosition(arrow.from), to: copyPosition(arrow.to) };
  }

  /**
   * Retire une flèche.
   * @param {number} id
   * @returns {boolean} vrai si la flèche existait
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — tableau tactique : flèches
   */
  removeArrow(id) {
    const index = this.#arrows.findIndex((arrow) => arrow.id === id);
    if (index === -1) {
      return false;
    }
    this.#arrows.splice(index, 1);
    this.emit('change', { type: 'arrows' });
    return true;
  }

  /**
   * Instantané d'une équipe : sa formation et la place de chacun de ses joueurs. Il sert à annuler
   * un changement de formation, y compris pendant la transition animée d'un changement précédent :
   * il contient les places voulues, pas les positions intermédiaires de l'animation.
   * @param {string} teamId
   * @returns {{teamId: string, formation: string, players: Array<[number, {x: number, z: number}]>}}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — instantanés pour l'annulation (patron Command)
   */
  captureTeam(teamId) {
    const formation = this.getFormation(teamId);
    const players = formation.computePositions().map(({ number }) => [number, this.getPlayerPosition(teamId, number)]);
    return { teamId, formation: formation.name, players };
  }

  /**
   * Rétablit une équipe telle que captureTeam l'a décrite.
   * @param {{teamId: string, formation: string, players: Array<[number, {x: number, z: number}]>}} snapshot
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — instantanés pour l'annulation (patron Command)
   */
  restoreTeam({ teamId, formation, players }) {
    this.#restoreFormation(teamId, formation);
    for (const [number, position] of players) {
      this.#requirePlayer(teamId, number);
      this.#players.set(playerKey(teamId, number), copyPosition(position));
    }
    this.emit('change', { type: 'restore', teamId });
  }

  /**
   * Instantané complet du tableau, sous forme de données simples.
   * @returns {{formations: Record<string, string>, players: Record<string, {x: number, z: number}>,
   *   ball: {x: number, z: number}, arrows: Array<object>}}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — instantanés pour l'annulation (patron Command)
   */
  snapshot() {
    return {
      formations: Object.fromEntries([...this.#formations].map(([teamId, formation]) => [teamId, formation.name])),
      players: Object.fromEntries([...this.#players].map(([key, position]) => [key, copyPosition(position)])),
      ball: this.getBallPosition(),
      arrows: this.getArrows(),
    };
  }

  /**
   * Rétablit un instantané complet : formations, joueurs, ballon et flèches.
   * @param {ReturnType<TacticsBoard['snapshot']>} snapshot
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — instantanés pour l'annulation (patron Command)
   */
  restore(snapshot) {
    for (const [teamId, name] of Object.entries(snapshot.formations)) {
      this.#restoreFormation(teamId, name);
    }
    for (const [key, position] of Object.entries(snapshot.players)) {
      if (!this.#players.has(key)) {
        throw new Error(`Joueur inconnu dans l'instantané : ${key}`);
      }
      this.#players.set(key, copyPosition(position));
    }
    this.#ball = copyPosition(snapshot.ball);
    this.#arrows = snapshot.arrows.map(({ id, kind, from, to }) => ({ id, kind, from: copyPosition(from), to: copyPosition(to) }));
    // Les identifiants ne reculent jamais : une flèche rétablie ne peut pas en remplacer une autre.
    this.#nextArrowId = Math.max(this.#nextArrowId, ...this.#arrows.map(({ id }) => id + 1));
    this.emit('change', { type: 'restore' });
  }

  /**
   * Indique si le tableau est dans son état de départ : formations du scénario de démonstration,
   * joueurs à leurs places, ballon au centre, aucune flèche.
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — réinitialisation du terrain
   */
  isInInitialState() {
    return JSON.stringify(this.snapshot()) === JSON.stringify(this.#initialState);
  }

  /**
   * Remet le tableau dans son état de départ (BF8, « réinitialiser le terrain »).
   * @returns {boolean} vrai si quelque chose a changé
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — réinitialisation du terrain
   */
  reset() {
    if (this.isInInitialState()) {
      return false;
    }
    this.restore(this.#initialState);
    return true;
  }

  /**
   * Place tous les joueurs d'une équipe aux places de sa formation.
   * @param {string} teamId
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — tableau tactique : places des joueurs
   */
  #placeTeamInFormation(teamId) {
    const attacksPositiveX = this.#teams[teamId]?.attacksPositiveX ?? true;
    for (const [number, { x, z }] of computeTeamTargets(this.getFormation(teamId), attacksPositiveX)) {
      this.#players.set(playerKey(teamId, number), { x, z });
    }
  }

  /**
   * Rétablit la formation d'une équipe, sans toucher aux places, et prévient les observateurs si
   * elle change (boutons et pastilles de l'interface).
   * @param {string} teamId
   * @param {string} name
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — instantanés pour l'annulation (patron Command)
   */
  #restoreFormation(teamId, name) {
    const previous = this.getFormation(teamId);
    const formation = getFormation(name);
    if (formation !== previous) {
      this.#formations.set(teamId, formation);
      this.emit('formationchange', { teamId, formation, previous });
    }
  }

  /**
   * Place enregistrée d'un joueur ; erreur si l'équipe ou le numéro est inconnu.
   * @param {string} teamId
   * @param {number} number
   * @returns {{x: number, z: number}}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — identité des joueurs
   */
  #requirePlayer(teamId, number) {
    this.getFormation(teamId);
    const position = this.#players.get(playerKey(teamId, number));
    if (!position) {
      throw new Error(`Joueur inconnu : ${number} (${teamId})`);
    }
    return position;
  }
}
