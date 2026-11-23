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
 * - une passe est le trajet du ballon : elle part du ballon, ou de l'arrivée d'une passe déjà tracée
 *   (enchaînement), et va vers un partenaire ou un espace libre du terrain ;
 * - une course est le déplacement d'un joueur : elle part d'un joueur et va vers un point du
 *   terrain.
 *
 * Aucune règle du football n'est inventée : passes longues, transversales, centres, passes en
 * retrait, courses en diagonale ou croisées restent possibles. Le hors-jeu, les contacts et les
 * croisements de trajectoires ne sont pas jugés : l'application ne connaît ni le moment de la
 * passe ni la position de chaque joueur à cet instant.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { TEAMS } from './config.mjs';
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
 * @date 2026-11-15
 * @role Règles des flèches — noms affichés
 */
export function targetLabel(target) {
  return target.type === 'ball' ? 'le ballon' : `le n° ${target.number} des ${TEAMS[target.teamId]?.label ?? target.teamId}`;
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
 * Départs possibles d'une passe : le ballon, puis l'arrivée de chaque passe déjà tracée.
 * @param {ReturnType<typeof readTacticalState>} state
 * @returns {Array<{x: number, z: number, source: 'ball'|'pass', arrowId?: number}>}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Règles des flèches — départs d'une passe
 */
export function passOrigins(state) {
  return [
    { x: state.ball.x, z: state.ball.z, source: 'ball' },
    ...state.arrows.filter(({ kind }) => kind === ARROW_KINDS.PASS).map(({ id, to }) => ({ x: to.x, z: to.z, source: 'pass', arrowId: id })),
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
    return { ok: true, start, actor: { type: 'ball' }, passer: findCarrier(state, start) };
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
  return { ok: true, start, actor: { type: 'point', ...start }, passer: findCarrier(state, start) };
}

/**
 * Vérifie une flèche complète : type connu, coordonnées finies, départ sur le plateau, arrivée sur
 * le terrain (lignes comprises), longueur d'au moins 2 cm, pas de doublon, et, pour une passe dont
 * le passeur est connu, pas de receveur adverse.
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
  if (kind === ARROW_KINDS.PASS && passer?.teamId && receiver?.type === 'player' && receiver.teamId !== passer.teamId) {
    return refuse(ARROW_REASONS.PASS_TO_OPPONENT);
  }
  return { ok: true };
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
    if (draft.kind === ARROW_KINDS.PASS) {
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
