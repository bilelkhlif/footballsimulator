/**
 * Règles des flèches tactiques : ce qu'une passe et une course ont le droit d'être, vérifié avant
 * toute action (docs/regles-des-fleches.md).
 *
 * Fonctions pures : elles ne connaissent ni three.js, ni la scène, ni l'interface. Elles reçoivent
 * un état tactique en données simples (readTacticalState) et une cible décrite par l'interaction
 * (un joueur, le ballon, ou un point du gazon dans le repère du terrain), et renvoient une décision :
 * acceptée, avec les extrémités de la flèche, ou refusée, avec une raison (ARROW_REASONS) et un
 * message court en français (describeReason). Les mêmes fonctions servent à l'aperçu (survol) et au
 * toucher qui valide : ce que montre l'aperçu est ce que fera le toucher.
 *
 * Sens des flèches, d'après le tableau du sprint 5 :
 * - une passe est le trajet du ballon : elle part du ballon, ou de l'arrivée d'une passe, d'un
 *   dribble ou d'un centre déjà tracés (enchaînement), et va vers un partenaire ou un espace libre ;
 * - une course est le déplacement d'un joueur : elle part d'un joueur et va vers un point du
 *   terrain.
 *
 * Trois gestes du porteur s'y ajoutent (version 0.4), avec leurs règles sur le terrain réel de
 * 105 × 68 m (mesures IFAB) :
 * - un dribble part du ballon, mais exige un porteur : un ballon que personne ne tient ne se
 *   conduit pas ;
 * - un centre part d'un couloir (hors de la largeur de la surface, à plus de 20,16 m de l'axe),
 *   dans le dernier tiers (à moins de 35 m de la ligne de but adverse), et arrive dans la surface
 *   de réparation ;
 * - un tir arrive entre les poteaux (but de 7,32 m), à moins de 2,5 m de la ligne de but, part
 *   d'au plus 40 m du but, et jamais vers le but de sa propre équipe.
 * Le but visé est celui de l'adversaire du porteur ; sans porteur, celui du côté de l'arrivée.
 *
 * Aucune règle du football n'est inventée : passes longues, transversales, centres, passes en
 * retrait, courses en diagonale ou croisées restent possibles. Le hors-jeu, les contacts et les
 * croisements de trajectoires ne sont pas jugés : l'application ne connaît ni le moment de la
 * passe ni la position de chaque joueur à cet instant.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { PITCH_LENGTH, PITCH_SCALE, TEAMS } from './config.mjs';
import { teamOf } from './team-identity.mjs';
import { ARROW_KINDS, isOnBoard, isOnPitch, MIN_ARROW_LENGTH, sameArrowPath } from './tactics-board.mjs';

/**
 * Rayon de possession : un joueur à moins de 2,5 cm du ballon (environ 4,4 m sur un vrai terrain,
 * moins de deux zones de sélection de pion) en est le porteur. C'est une convention de sélection
 * adaptée aux pions agrandis ; elle n'impose aucune distance minimale entre le ballon et un joueur.
 */
export const POSSESSION_RADIUS = 0.025;

/** Distance sous laquelle un toucher sur le gazon s'accroche au départ d'une passe enchaînée (1,5 cm). */
export const ORIGIN_SNAP_RADIUS = 0.015;

/** Distance sous laquelle l'arrivée d'une passe s'accroche à l'arrivée d'une course (1,2 cm). */
export const RUN_END_SNAP_RADIUS = 0.012;

/** Demi-largeur de la surface de réparation : 40,32 m de large (IFAB), en mètres de maquette. */
export const PENALTY_AREA_HALF_WIDTH = 20.16 * PITCH_SCALE;

/** Profondeur de la surface de réparation : 16,5 m (IFAB). */
export const PENALTY_AREA_DEPTH = 16.5 * PITCH_SCALE;

/** Demi-largeur du but : 7,32 m entre les poteaux (IFAB). */
export const GOAL_HALF_WIDTH = 3.66 * PITCH_SCALE;

/** Arrivée d'un tir : à moins de 2,5 m de la ligne de but, pour viser au doigt. */
export const SHOT_END_DEPTH = 2.5 * PITCH_SCALE;

/** Distance maximale d'un tir au centre du but : 40 m. */
export const SHOT_MAX_DISTANCE = 40 * PITCH_SCALE;

/** Dernier tiers : un centre part à moins de 35 m de la ligne de but adverse. */
export const FINAL_THIRD_DEPTH = 35 * PITCH_SCALE;

/** Flèches qui portent le ballon : elles partent du ballon ou d'une arrivée de ballon. */
export const BALL_ARROW_KINDS = Object.freeze([ARROW_KINDS.PASS, ARROW_KINDS.DRIBBLE, ARROW_KINDS.CROSS, ARROW_KINDS.SHOT]);

/** Raisons d'un refus. */
export const ARROW_REASONS = Object.freeze({
  INVALID_POINT: 'invalid-point',
  MISSED: 'missed',
  UNKNOWN_KIND: 'unknown-kind',
  OFF_PITCH: 'off-pitch',
  START_OFF_BOARD: 'start-off-board',
  TOO_SHORT: 'too-short',
  DUPLICATE: 'duplicate',
  RUN_NEEDS_PLAYER: 'run-needs-player',
  PASS_NEEDS_BALL: 'pass-needs-ball',
  PASS_TO_OPPONENT: 'pass-to-opponent',
  DRIBBLE_NEEDS_CARRIER: 'dribble-needs-carrier',
  CROSS_NOT_WIDE: 'cross-not-wide',
  CROSS_TOO_FAR: 'cross-too-far',
  CROSS_NOT_IN_BOX: 'cross-not-in-box',
  SHOT_NOT_ON_GOAL: 'shot-not-on-goal',
  SHOT_TOO_FAR: 'shot-too-far',
  SHOT_OWN_GOAL: 'shot-own-goal',
});

/** Message court affiché pour chaque raison de refus. */
const REASON_MESSAGES = Object.freeze({
  [ARROW_REASONS.INVALID_POINT]: 'Point invalide : touchez de nouveau le terrain.',
  [ARROW_REASONS.MISSED]: 'Visez le terrain.',
  [ARROW_REASONS.UNKNOWN_KIND]: 'Type de flèche inconnu.',
  [ARROW_REASONS.OFF_PITCH]: 'Arrivée hors du terrain : visez l’intérieur des lignes.',
  [ARROW_REASONS.START_OFF_BOARD]: 'Départ hors du plateau.',
  [ARROW_REASONS.TOO_SHORT]: 'Flèche trop courte : visez plus loin.',
  [ARROW_REASONS.DUPLICATE]: 'Cette flèche est déjà tracée.',
  [ARROW_REASONS.RUN_NEEDS_PLAYER]: 'Une course part d’un joueur : touchez un joueur.',
  [ARROW_REASONS.PASS_NEEDS_BALL]: 'Une passe part du ballon : touchez le ballon ou son porteur.',
  [ARROW_REASONS.PASS_TO_OPPONENT]: 'Passe vers un adversaire : visez un partenaire ou un espace libre.',
  [ARROW_REASONS.DRIBBLE_NEEDS_CARRIER]: 'Un dribble part d’un porteur : touchez le joueur qui a le ballon.',
  [ARROW_REASONS.CROSS_NOT_WIDE]: 'Un centre part d’un couloir, hors de la largeur de la surface.',
  [ARROW_REASONS.CROSS_TOO_FAR]: 'Un centre part du dernier tiers, à moins de 35 m du but.',
  [ARROW_REASONS.CROSS_NOT_IN_BOX]: 'Un centre arrive dans la surface de réparation.',
  [ARROW_REASONS.SHOT_NOT_ON_GOAL]: 'Un tir vise le but : touchez entre les poteaux.',
  [ARROW_REASONS.SHOT_TOO_FAR]: 'Tir de plus de 40 m : rapprochez le ballon du but.',
  [ARROW_REASONS.SHOT_OWN_GOAL]: 'Tir vers son propre but : visez le but adverse.',
});

/**
 * Message court d'une raison de refus.
 * @param {string} reason une valeur de ARROW_REASONS
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Règles des flèches — messages de refus
 */
export function describeReason(reason) {
  return REASON_MESSAGES[reason] ?? 'Action impossible.';
}

/**
 * Indique si deux cibles désignent le même objet : le même joueur (équipe et numéro) ou le ballon.
 * @param {{type: string, teamId?: string, number?: number}|null} a
 * @param {{type: string, teamId?: string, number?: number}|null} b
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Règles des flèches — identité des objets sélectionnables
 */
export function sameTarget(a, b) {
  if (!a || !b || a.type !== b.type) {
    return false;
  }
  return a.type === 'ball' || (a.type === 'player' && a.teamId === b.teamId && a.number === b.number);
}

/**
 * Nom court d'un objet : « le n° 9 des Bleus » ou « le ballon ».
 * @param {{type: string, teamId?: string, number?: number}} target
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Règles des flèches — noms affichés
 */
export function targetLabel(target) {
  return target.type === 'ball' ? 'le ballon' : `le n° ${target.number} ${teamOf(target.teamId)}`;
}

/**
 * Distance entre deux points du terrain.
 * @param {{x: number, z: number}} a
 * @param {{x: number, z: number}} b
 * @returns {number} en mètres
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Règles des flèches — géométrie
 */
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Indique si un point a deux coordonnées finies.
 * @param {{x: number, z: number}|null|undefined} point
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Règles des flèches — géométrie
 */
export function isFinitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.z);
}

/**
 * État tactique en données simples, lu dans le tableau : ballon, joueurs et flèches.
 * @param {import('./tactics-board.mjs').TacticsBoard} board
 * @returns {{ball: {x: number, z: number}, players: Array<{type: 'player', teamId: string, number: number, x: number, z: number}>,
 *   arrows: Array<{id: number, kind: string, from: {x: number, z: number}, to: {x: number, z: number}}>}}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Règles des flèches — état tactique en données simples
 */
export function readTacticalState(board) {
  const players = Object.entries(board.snapshot().players).map(([key, { x, z }]) => {
    const [teamId, number] = key.split(':');
    return { type: 'player', teamId, number: Number(number), x, z };
  });
  return { ball: board.getBallPosition(), players, arrows: board.getArrows() };
}

/**
 * Place d'une cible dans l'état tactique : un joueur ou le ballon.
 * @param {{type: string, teamId?: string, number?: number}} target
 * @param {ReturnType<typeof readTacticalState>} state
 * @returns {{x: number, z: number}|null}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Règles des flèches — état tactique en données simples
 */
export function targetPosition(target, state) {
  if (target?.type === 'ball') {
    return { x: state.ball.x, z: state.ball.z };
  }
  const player = target?.type === 'player' ? state.players.find((candidate) => sameTarget(candidate, target)) : null;
  return player ? { x: player.x, z: player.z } : null;
}

/**
 * Joueur le plus proche d'un point, à moins du rayon de possession : le porteur du ballon posé là.
 * @param {ReturnType<typeof readTacticalState>} state
 * @param {{x: number, z: number}} point
 * @param {number} [radius]
 * @returns {{type: 'player', teamId: string, number: number}|null}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Règles des flèches — porteur du ballon
 */
export function findCarrier(state, point, radius = POSSESSION_RADIUS) {
  let carrier = null;
  let best = radius;
  for (const player of state.players) {
    const gap = distance(player, point);
    if (gap <= best) {
      best = gap;
      carrier = player;
    }
  }
  return carrier ? { type: 'player', teamId: carrier.teamId, number: carrier.number } : null;
}

/**
 * Départs possibles d'une passe : le ballon, puis l'arrivée de chaque flèche qui porte le ballon
 * (passe, dribble ou centre) déjà tracée. Un tir termine l'action : son arrivée n'en est pas un.
 * @param {ReturnType<typeof readTacticalState>} state
 * @returns {Array<{x: number, z: number, source: string, arrowId?: number}>} source : 'ball', ou le type de la flèche
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Règles des flèches — départs d'une passe
 */
export function passOrigins(state) {
  return [
    { x: state.ball.x, z: state.ball.z, source: 'ball' },
    ...state.arrows.filter(({ kind }) => kind === ARROW_KINDS.PASS || kind === ARROW_KINDS.DRIBBLE || kind === ARROW_KINDS.CROSS)
      .map(({ id, kind, to }) => ({ x: to.x, z: to.z, source: kind, arrowId: id })),
  ];
}

/**
 * Départ de passe le plus proche d'un point, à moins d'une distance donnée.
 * @param {ReturnType<typeof readTacticalState>} state
 * @param {{x: number, z: number}} point
 * @param {number} radius
 * @param {(origin: object) => boolean} [accept] départs permis pour l'objet touché
 * @returns {{x: number, z: number, source: string}|null}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Règles des flèches — départs d'une passe
 */
function nearestOrigin(state, point, radius, accept = () => true) {
  let nearest = null;
  let best = radius;
  for (const origin of passOrigins(state)) {
    if (!accept(origin)) continue;
    const gap = distance(origin, point);
    if (gap <= best) {
      best = gap;
      nearest = origin;
    }
  }
  return nearest;
}

/**
 * Refus, avec sa raison et son message.
 * @param {string} reason une valeur de ARROW_REASONS
 * @returns {{ok: false, reason: string, message: string}}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Règles des flèches — décision
 */
function refuse(reason) {
  return { ok: false, reason, message: describeReason(reason) };
}

/**
 * Premier toucher d'une flèche : décide de son départ.
 * - Course : le joueur touché ; le ballon ou le gazon sont refusés.
 * - Passe : le ballon touché ; son porteur touché (le départ est alors le ballon) ; l'arrivée d'une
 *   passe déjà tracée, touchée sur le gazon ou par le joueur qui s'y trouve (passe enchaînée).
 *   Tout autre joueur ou point est refusé.
 * Le passeur est le joueur touché, sinon le porteur du ballon au départ (findCarrier), ou personne.
 * @param {object} input
 * @param {string} input.kind une valeur de ARROW_KINDS
 * @param {{type: string, teamId?: string, number?: number}|null} input.target objet touché
 * @param {{x: number, z: number}|null} input.point point du gazon touché, dans le repère du terrain
 * @param {ReturnType<typeof readTacticalState>} state
 * @returns {{ok: true, start: {x: number, z: number}, actor: object, passer: object|null}
 *   |{ok: false, reason: string, message: string}}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Règles des flèches — départ d'une passe ou d'une course
 */
export function resolveArrowStart({ kind, target, point }, state) {
  if (!Object.values(ARROW_KINDS).includes(kind)) {
    return refuse(ARROW_REASONS.UNKNOWN_KIND);
  }
  if (!target) {
    if (!point) {
      return refuse(ARROW_REASONS.MISSED);
    }
    if (!isFinitePoint(point)) {
      return refuse(ARROW_REASONS.INVALID_POINT);
    }
  }
  if (kind === ARROW_KINDS.RUN) {
    if (target?.type !== 'player') {
      return refuse(ARROW_REASONS.RUN_NEEDS_PLAYER);
    }
    const start = targetPosition(target, state);
    return start ? { ok: true, start, actor: { ...target }, passer: null } : refuse(ARROW_REASONS.RUN_NEEDS_PLAYER);
  }
  if (target?.type === 'ball') {
    const start = targetPosition(target, state);
    return requireCarrier(kind, { ok: true, start, actor: { type: 'ball' }, passer: findCarrier(state, start) });
  }
  if (target?.type === 'player') {
    const position = targetPosition(target, state);
    const carrier = findCarrier(state, state.ball);
    // Le rayon de proximité ne transforme pas un second joueur en porteur du même ballon.
    // Les arrivées de passes restent des départs indépendants pour les enchaînements.
    const origin = position ? nearestOrigin(state, position, POSSESSION_RADIUS,
      (candidate) => candidate.source !== 'ball' || sameTarget(target, carrier)) : null;
    return origin
      ? { ok: true, start: { x: origin.x, z: origin.z }, actor: { ...target }, passer: { type: 'player', teamId: target.teamId, number: target.number } }
      : refuse(ARROW_REASONS.PASS_NEEDS_BALL);
  }
  const origin = nearestOrigin(state, point, ORIGIN_SNAP_RADIUS);
  if (!origin) {
    return refuse(ARROW_REASONS.PASS_NEEDS_BALL);
  }
  const start = { x: origin.x, z: origin.z };
  return requireCarrier(kind, { ok: true, start, actor: { type: 'point', ...start }, passer: findCarrier(state, start) });
}

/**
 * Un dribble exige un porteur : sans joueur au ballon, le départ est refusé. Les autres flèches
 * passent telles quelles.
 * @param {string} kind
 * @param {{ok: true, passer: object|null}} decision départ accepté
 * @returns {object} la décision, ou un refus
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Règles des flèches — dribble, centre et tir
 */
function requireCarrier(kind, decision) {
  return kind === ARROW_KINDS.DRIBBLE && !decision.passer ? refuse(ARROW_REASONS.DRIBBLE_NEEDS_CARRIER) : decision;
}

/**
 * Sens d'attaque visé par une flèche : celui de l'équipe du porteur ; sans porteur, vers le but
 * du côté de l'arrivée.
 * @param {{teamId?: string}|null} passer
 * @param {{x: number}} to
 * @returns {1|-1} +1 vers le but situé en +X
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Règles des flèches — dribble, centre et tir
 */
export function attackSign(passer, to) {
  if (passer?.teamId && TEAMS[passer.teamId]) {
    return TEAMS[passer.teamId].attacksPositiveX ? 1 : -1;
  }
  return to.x < 0 ? -1 : 1;
}

/**
 * Vrai si un point est dans la surface de réparation du but situé du côté `sign`.
 * @param {{x: number, z: number}} point
 * @param {1|-1} sign
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Règles des flèches — dribble, centre et tir
 */
export function isInPenaltyArea(point, sign) {
  return Math.abs(point.z) <= PENALTY_AREA_HALF_WIDTH && Math.abs(sign * PITCH_LENGTH / 2 - point.x) <= PENALTY_AREA_DEPTH;
}

/**
 * Règles propres au centre et au tir, sur le terrain réel ; null si la flèche les respecte.
 * @param {{kind: string, from: {x: number, z: number}, to: {x: number, z: number}}} arrow
 * @param {{teamId?: string}|null} passer
 * @returns {string|null} une raison de ARROW_REASONS, ou null
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Règles des flèches — dribble, centre et tir
 */
function finishingRule({ kind, from, to }, passer) {
  if (kind === ARROW_KINDS.CROSS) {
    const sign = attackSign(passer, to);
    if (Math.abs(from.z) <= PENALTY_AREA_HALF_WIDTH) return ARROW_REASONS.CROSS_NOT_WIDE;
    if (sign * (sign * PITCH_LENGTH / 2 - from.x) > FINAL_THIRD_DEPTH) return ARROW_REASONS.CROSS_TOO_FAR;
    if (!isInPenaltyArea(to, sign)) return ARROW_REASONS.CROSS_NOT_IN_BOX;
  }
  if (kind === ARROW_KINDS.SHOT) {
    const goalSide = to.x < 0 ? -1 : 1;
    const goalLine = goalSide * PITCH_LENGTH / 2;
    if (Math.abs(to.z) > GOAL_HALF_WIDTH || Math.abs(goalLine - to.x) > SHOT_END_DEPTH) return ARROW_REASONS.SHOT_NOT_ON_GOAL;
    if (passer?.teamId && attackSign(passer, to) !== goalSide) return ARROW_REASONS.SHOT_OWN_GOAL;
    if (Math.hypot(goalLine - from.x, from.z) > SHOT_MAX_DISTANCE) return ARROW_REASONS.SHOT_TOO_FAR;
  }
  return null;
}

/**
 * Vérifie une flèche complète : type connu, coordonnées finies, départ sur le plateau, arrivée sur
 * le terrain (lignes comprises), longueur d'au moins 2 cm, pas de doublon, et, pour une passe ou un
 * centre dont le passeur est connu, pas de receveur adverse. Un dribble exige un porteur ; un centre
 * et un tir respectent leurs zones (finishingRule).
 * @param {{kind: string, from: {x: number, z: number}, to: {x: number, z: number}}} arrow
 * @param {ReturnType<typeof readTacticalState>} state
 * @param {{passer?: {teamId: string}|null, receiver?: {type: string, teamId?: string}|null}} [roles]
 * @returns {{ok: true}|{ok: false, reason: string, message: string}}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Règles des flèches — vérification d'une flèche complète
 */
export function validateArrow({ kind, from, to }, state, { passer = null, receiver = null } = {}) {
  if (!Object.values(ARROW_KINDS).includes(kind)) {
    return refuse(ARROW_REASONS.UNKNOWN_KIND);
  }
  if (!isFinitePoint(from) || !isFinitePoint(to)) {
    return refuse(ARROW_REASONS.INVALID_POINT);
  }
  if (!isOnBoard(from)) {
    return refuse(ARROW_REASONS.START_OFF_BOARD);
  }
  if (!isOnPitch(to)) {
    return refuse(ARROW_REASONS.OFF_PITCH);
  }
  if (distance(from, to) < MIN_ARROW_LENGTH) {
    return refuse(ARROW_REASONS.TOO_SHORT);
  }
  if (state.arrows.some((arrow) => sameArrowPath(arrow, { kind, from, to }))) {
    return refuse(ARROW_REASONS.DUPLICATE);
  }
  if ((kind === ARROW_KINDS.PASS || kind === ARROW_KINDS.CROSS) && passer?.teamId && receiver?.type === 'player'
    && receiver.teamId !== passer.teamId) {
    return refuse(ARROW_REASONS.PASS_TO_OPPONENT);
  }
  if (kind === ARROW_KINDS.DRIBBLE && !passer) {
    return refuse(ARROW_REASONS.DRIBBLE_NEEDS_CARRIER);
  }
  const reason = finishingRule({ kind, from, to }, passer);
  return reason ? refuse(reason) : { ok: true };
}

/**
 * Second toucher d'une flèche : décide de son arrivée, puis vérifie la flèche entière.
 * - Toucher le joueur ou le ballon de départ, ou le passeur, annule le tracé (cancel).
 * - Un joueur ou le ballon touché : l'arrivée est sa place ; un joueur touché est le receveur.
 * - Sinon, le point du gazon ; pour une passe, il s'accroche à l'arrivée d'une course proche.
 * @param {object} input
 * @param {{kind: string, start: {x: number, z: number}, actor: object, passer: object|null}} input.draft
 *   flèche commencée (resolveArrowStart)
 * @param {{type: string, teamId?: string, number?: number}|null} input.target objet touché
 * @param {{x: number, z: number}|null} input.point point du gazon touché, dans le repère du terrain
 * @param {ReturnType<typeof readTacticalState>} state
 * @returns {{ok: true, end: {x: number, z: number}, receiver: object|null, snappedTo: string|null}
 *   |{ok: false, cancel: true}|{ok: false, reason: string, message: string, end?: {x: number, z: number}}}
 *   un refus porte l'arrivée visée quand elle est connue, pour l'aperçu
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Règles des flèches — arrivée d'une passe ou d'une course
 */
export function resolveArrowEnd({ draft, target, point }, state) {
  let end = null;
  let receiver = null;
  let snappedTo = null;
  if (target) {
    if (sameTarget(target, draft.actor) || sameTarget(target, draft.passer)) {
      return { ok: false, cancel: true };
    }
    end = targetPosition(target, state);
    receiver = target.type === 'player' ? { type: 'player', teamId: target.teamId, number: target.number } : null;
    snappedTo = target.type;
  } else {
    if (!point) {
      return refuse(ARROW_REASONS.MISSED);
    }
    if (!isFinitePoint(point)) {
      return refuse(ARROW_REASONS.INVALID_POINT);
    }
    end = { x: point.x, z: point.z };
    // Tir : un toucher sur le but lui-même, juste derrière la ligne, vise la ligne de but.
    const goalLine = (end.x < 0 ? -1 : 1) * PITCH_LENGTH / 2;
    if (draft.kind === ARROW_KINDS.SHOT && Math.abs(end.z) <= GOAL_HALF_WIDTH && Math.abs(end.x) > PITCH_LENGTH / 2
      && Math.abs(end.x - goalLine) <= SHOT_END_DEPTH) {
      end = { x: goalLine, z: end.z };
    }
    if (draft.kind === ARROW_KINDS.PASS || draft.kind === ARROW_KINDS.CROSS) {
      const runEnd = state.arrows
        .filter(({ kind }) => kind === ARROW_KINDS.RUN)
        .map(({ to }) => to)
        .find((to) => distance(to, end) <= RUN_END_SNAP_RADIUS);
      if (runEnd) {
        end = { x: runEnd.x, z: runEnd.z };
        snappedTo = 'run';
      }
    }
  }
  if (!end) {
    return refuse(ARROW_REASONS.MISSED);
  }
  const verdict = validateArrow({ kind: draft.kind, from: draft.start, to: end }, state, { passer: draft.passer, receiver });
  return verdict.ok ? { ok: true, end, receiver, snappedTo } : { ...verdict, end };
}
