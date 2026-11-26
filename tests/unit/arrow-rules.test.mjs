/**
 * Tests unitaires de src/arrow-rules.mjs : les règles des flèches tactiques, sans moteur de rendu.
 * Les états tactiques sont écrits à la main, en données simples ; chaque refus est vérifié avec sa
 * raison, et chaque action légitime du football (passe longue, en retrait, centre, course croisée,
 * position de hors-jeu apparente) doit rester possible.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARROW_REASONS, describeReason, findCarrier, passOrigins, POSSESSION_RADIUS, readTacticalState,
  resolveArrowEnd, resolveArrowStart, validateArrow,
} from '../../src/arrow-rules.mjs';
import { ARROW_KINDS, PITCH_HALF_EXTENTS, TacticsBoard } from '../../src/tactics-board.mjs';
import { DEFAULT_FORMATIONS } from '../../src/config.mjs';

const PASS = ARROW_KINDS.PASS;
const RUN = ARROW_KINDS.RUN;

/**
 * Joueur décrit en données simples.
 * @param {string} teamId
 * @param {number} number
 * @param {number} x
 * @param {number} z
 * @returns {{type: 'player', teamId: string, number: number, x: number, z: number}}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests unitaires (src/arrow-rules.mjs) — montage du test
 */
function player(teamId, number, x, z) {
  return { type: 'player', teamId, number, x, z };
}

/**
 * Cible d'un toucher sur un joueur, comme la décrit l'interaction.
 * @param {string} teamId
 * @param {number} number
 * @returns {{type: 'player', teamId: string, number: number}}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests unitaires (src/arrow-rules.mjs) — montage du test
 */
function on(teamId, number) {
  return { type: 'player', teamId, number };
}

/**
 * État de référence : le n° 9 bleu porte le ballon, au centre ; le n° 7 bleu est libre à droite ;
 * le n° 4 rouge défend ; le n° 2 bleu est sur la bande de gazon, hors des lignes.
 * @param {Array<object>} [arrows]
 * @returns {ReturnType<typeof readTacticalState>}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests unitaires (src/arrow-rules.mjs) — montage du test
 */
function createState(arrows = []) {
  return {
    ball: { x: 0, z: 0 },
    players: [
      player('blue', 9, -0.015, 0),
      player('blue', 7, 0.1, 0.12),
      player('blue', 11, 0.2, -0.15),
      player('red', 4, 0.08, -0.05),
      player('red', 10, 0.03, 0.03),
      player('red', 5, 0.15, 0),
      player('blue', 2, 0.25, 0.205),
    ],
    arrows,
  };
}

/**
 * Trace une flèche complète par les deux touchers, et renvoie la décision de l'arrivée.
 * @param {ReturnType<typeof createState>} state
 * @param {string} kind
 * @param {{target?: object|null, point?: object|null}} start
 * @param {{target?: object|null, point?: object|null}} end
 * @returns {object}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests unitaires (src/arrow-rules.mjs) — outil de vérification
 */
function draw(state, kind, start, end) {
  const draft = resolveArrowStart({ kind, target: start.target ?? null, point: start.point ?? null }, state);
  assert.equal(draft.ok, true, `départ refusé : ${draft.message}`);
  return resolveArrowEnd({ draft: { kind, ...draft }, target: end.target ?? null, point: end.point ?? null }, state);
}

test('porteur du ballon : le joueur le plus proche, à moins du rayon de possession ; personne au-delà', () => {
  const state = createState();
  assert.deepEqual(findCarrier(state, state.ball), on('blue', 9));
  assert.equal(findCarrier(state, { x: -0.2, z: 0.15 }), null);
  assert.ok(POSSESSION_RADIUS > 0.014, 'plus grand que la zone de sélection d\'un pion : le ballon peut être posé à ses pieds');
});

test('départ d\'une passe : le ballon, ou son porteur ; le passeur est connu', () => {
  const state = createState();
  const fromBall = resolveArrowStart({ kind: PASS, target: { type: 'ball' }, point: null }, state);
  assert.deepEqual([fromBall.ok, fromBall.start, fromBall.passer], [true, { x: 0, z: 0 }, on('blue', 9)]);

  const fromCarrier = resolveArrowStart({ kind: PASS, target: on('blue', 9), point: null }, state);
  assert.deepEqual([fromCarrier.ok, fromCarrier.start, fromCarrier.passer], [true, { x: 0, z: 0 }, on('blue', 9)],
    'toucher le porteur fait partir la passe du ballon, pas de ses pieds');
});

test('départ d\'une passe refusé : un joueur sans le ballon, ou le gazon loin du ballon', () => {
  const state = createState();
  for (const target of [on('blue', 7), on('red', 4)]) {
    const refused = resolveArrowStart({ kind: PASS, target, point: null }, state);
    assert.deepEqual([refused.ok, refused.reason], [false, ARROW_REASONS.PASS_NEEDS_BALL]);
    assert.equal(refused.message, 'Une passe part du ballon : touchez le ballon ou son porteur.');
  }
  const grass = resolveArrowStart({ kind: PASS, target: null, point: { x: -0.1, z: 0.1 } }, state);
  assert.equal(grass.reason, ARROW_REASONS.PASS_NEEDS_BALL);
});

test('deux joueurs proches du ballon : seul le porteur retenu commence la passe, les enchaînements restent permis', () => {
  const state = createState();
  state.players.find(({ teamId, number }) => teamId === 'red' && number === 10).x = 0.02;
  state.players.find(({ teamId, number }) => teamId === 'red' && number === 10).z = 0;
  assert.deepEqual(findCarrier(state, state.ball), on('blue', 9));
  assert.equal(resolveArrowStart({ kind: PASS, target: on('red', 10), point: null }, state).reason, ARROW_REASONS.PASS_NEEDS_BALL);
  assert.equal(resolveArrowStart({ kind: PASS, target: on('blue', 9), point: null }, state).ok, true);
  // Un autre départ permis reste utilisable même si le ballon est plus près du joueur touché.
  state.arrows.push({ id: 1, kind: PASS, from: { x: -0.12, z: 0 }, to: { x: 0.043, z: 0 } });
  const chained = resolveArrowStart({ kind: PASS, target: on('red', 10), point: null }, state);
  assert.deepEqual([chained.ok, chained.start], [true, { x: 0.043, z: 0 }]);
});

test('départ d\'une course : seulement un joueur ; le ballon, le gazon ou un rayon perdu sont refusés', () => {
  const state = createState();
  const run = resolveArrowStart({ kind: RUN, target: on('blue', 7), point: null }, state);
  assert.deepEqual([run.ok, run.start, run.actor], [true, { x: 0.1, z: 0.12 }, on('blue', 7)]);

  assert.equal(resolveArrowStart({ kind: RUN, target: { type: 'ball' }, point: null }, state).reason, ARROW_REASONS.RUN_NEEDS_PLAYER);
  assert.equal(resolveArrowStart({ kind: RUN, target: null, point: { x: 0, z: 0.1 } }, state).reason, ARROW_REASONS.RUN_NEEDS_PLAYER);
  assert.equal(resolveArrowStart({ kind: RUN, target: null, point: null }, state).reason, ARROW_REASONS.MISSED);
  assert.equal(resolveArrowStart({ kind: RUN, target: null, point: { x: Number.NaN, z: 0 } }, state).reason, ARROW_REASONS.INVALID_POINT);
  assert.equal(resolveArrowStart({ kind: 'tacle', target: on('blue', 7), point: null }, state).reason, ARROW_REASONS.UNKNOWN_KIND);
});

test('arrivée d\'une passe : un partenaire (receveur explicite) ou un espace libre ; jamais un adversaire du passeur', () => {
  const state = createState();
  const toMate = draw(state, PASS, { target: { type: 'ball' } }, { target: on('blue', 7) });
  assert.deepEqual([toMate.ok, toMate.end, toMate.receiver], [true, { x: 0.1, z: 0.12 }, on('blue', 7)]);

  const toSpace = draw(state, PASS, { target: { type: 'ball' } }, { point: { x: 0.22, z: 0.05 } });
  assert.deepEqual([toSpace.ok, toSpace.receiver], [true, null]);

  const toOpponent = draw(state, PASS, { target: { type: 'ball' } }, { target: on('red', 4) });
  assert.deepEqual([toOpponent.ok, toOpponent.reason], [false, ARROW_REASONS.PASS_TO_OPPONENT]);
  assert.deepEqual(toOpponent.end, { x: 0.08, z: -0.05 }, 'l\'aperçu connaît l\'arrivée refusée');
});

test('ballon libre (aucun porteur) : passeur inconnu, aucun receveur n\'est refusé pour son équipe', () => {
  const state = createState();
  state.ball = { x: -0.2, z: 0.15 };
  const pass = draw(state, PASS, { target: { type: 'ball' } }, { target: on('red', 4) });
  assert.equal(pass.ok, true);
});

test('arrivée hors des lignes refusée ; sur la ligne, acceptée ; bande de gazon refusée', () => {
  const state = createState();
  const start = { target: { type: 'ball' } };
  assert.equal(draw(state, PASS, start, { point: { x: PITCH_HALF_EXTENTS.x + 0.01, z: 0 } }).reason, ARROW_REASONS.OFF_PITCH);
  assert.equal(draw(state, PASS, start, { point: { x: 0, z: PITCH_HALF_EXTENTS.z + 0.008 } }).reason, ARROW_REASONS.OFF_PITCH);
  assert.equal(draw(state, PASS, start, { point: { x: PITCH_HALF_EXTENTS.x, z: -PITCH_HALF_EXTENTS.z } }).ok, true, 'coin du terrain');
  assert.equal(draw(state, RUN, { target: on('blue', 7) }, { point: { x: 0.1, z: PITCH_HALF_EXTENTS.z + 0.02 } }).reason, ARROW_REASONS.OFF_PITCH);
  assert.equal(draw(state, PASS, start, { target: on('blue', 2) }).reason, ARROW_REASONS.OFF_PITCH,
    'receveur debout hors des lignes : le ballon sortirait');
});

test('flèche trop courte, coordonnées invalides ou rayon perdu : refusés', () => {
  const state = createState();
  assert.equal(draw(state, PASS, { target: { type: 'ball' } }, { point: { x: 0.012, z: 0 } }).reason, ARROW_REASONS.TOO_SHORT);
  assert.equal(draw(state, PASS, { target: { type: 'ball' } }, { point: { x: Number.POSITIVE_INFINITY, z: 0 } }).reason, ARROW_REASONS.INVALID_POINT);
  assert.equal(draw(state, RUN, { target: on('blue', 7) }, { point: null }).reason, ARROW_REASONS.MISSED);
  assert.equal(validateArrow({ kind: PASS, from: { x: Number.NaN, z: 0 }, to: { x: 0.1, z: 0 } }, state).reason, ARROW_REASONS.INVALID_POINT);
  assert.equal(validateArrow({ kind: RUN, from: { x: 0.5, z: 0 }, to: { x: 0.1, z: 0 } }, state).reason, ARROW_REASONS.START_OFF_BOARD);
});

test('toucher de nouveau le départ, ou le passeur, annule le tracé au lieu de créer une autre action', () => {
  const state = createState();
  assert.deepEqual(draw(state, PASS, { target: { type: 'ball' } }, { target: { type: 'ball' } }), { ok: false, cancel: true });
  assert.deepEqual(draw(state, PASS, { target: { type: 'ball' } }, { target: on('blue', 9) }), { ok: false, cancel: true },
    'pas de passe du porteur à lui-même');
  assert.deepEqual(draw(state, RUN, { target: on('red', 5) }, { target: on('red', 5) }), { ok: false, cancel: true });
});

test('doublon refusé ; même tracé d\'un autre type, accepté', () => {
  const state = createState([{ id: 1, kind: PASS, from: { x: 0, z: 0 }, to: { x: 0.1, z: 0.12 } }]);
  assert.equal(draw(state, PASS, { target: { type: 'ball' } }, { target: on('blue', 7) }).reason, ARROW_REASONS.DUPLICATE);
  assert.equal(validateArrow({ kind: RUN, from: { x: 0, z: 0 }, to: { x: 0.1, z: 0.12 } }, state).ok, true);
});

test('passe enchaînée : elle part de l\'arrivée d\'une passe déjà tracée, par le receveur ou par le gazon', () => {
  const state = createState([{ id: 1, kind: PASS, from: { x: 0, z: 0 }, to: { x: 0.1, z: 0.12 } }]);
  assert.deepEqual(passOrigins(state).map(({ source }) => source), ['ball', 'pass']);
  const byReceiver = resolveArrowStart({ kind: PASS, target: on('blue', 7), point: null }, state);
  assert.deepEqual([byReceiver.ok, byReceiver.start, byReceiver.passer], [true, { x: 0.1, z: 0.12 }, on('blue', 7)]);
  const second = resolveArrowEnd({ draft: { kind: PASS, ...byReceiver }, target: on('blue', 11), point: null }, state);
  assert.equal(second.ok, true, 'une-deux, combinaison : possible');

  const bySpace = resolveArrowStart({ kind: PASS, target: null, point: { x: 0.105, z: 0.115 } }, state);
  assert.deepEqual([bySpace.ok, bySpace.start], [true, { x: 0.1, z: 0.12 }]);
});

test('passe vers une fin de course : accrochage géométrique, sans déduire l\'équipe du coureur', () => {
  const state = createState([{ id: 1, kind: RUN, from: { x: 0.2, z: -0.15 }, to: { x: 0.27, z: -0.02 } }]);
  const pass = draw(state, PASS, { target: { type: 'ball' } }, { point: { x: 0.265, z: -0.025 } });
  assert.deepEqual([pass.ok, pass.end, pass.snappedTo], [true, { x: 0.27, z: -0.02 }, 'run']);
});

test('actions légitimes toujours possibles : passe longue, en retrait, centre, courses croisées, hors-jeu apparent', () => {
  const state = createState();
  // Transversale d'un bout à l'autre du terrain, en diagonale.
  state.ball = { x: -0.28, z: 0.18 };
  state.players.push(player('blue', 3, -0.29, 0.17));
  assert.equal(draw(state, PASS, { target: { type: 'ball' } }, { point: { x: 0.28, z: -0.18 } }).ok, true, 'passe longue');
  // Passe en retrait vers son propre but (les Bleus attaquent vers +x).
  state.ball = { x: 0, z: 0 };
  assert.equal(draw(state, PASS, { target: { type: 'ball' } }, { point: { x: -0.25, z: 0 } }).ok, true, 'passe en retrait');
  // Centre depuis l'aile, dans la surface de réparation adverse.
  state.ball = { x: 0.26, z: -0.18 };
  assert.equal(draw(state, PASS, { target: { type: 'ball' } }, { point: { x: 0.27, z: 0.01 } }).ok, true, 'centre');
  // Courses en diagonale, qui se croisent, jusque derrière le dernier défenseur (hors-jeu apparent).
  const crossing = createState([{ id: 1, kind: RUN, from: { x: 0.1, z: 0.12 }, to: { x: 0.25, z: -0.1 } }]);
  assert.equal(draw(crossing, RUN, { target: on('blue', 11) }, { point: { x: 0.28, z: 0.1 } }).ok, true, 'courses croisées');
  // Course jusqu'à la place d'un adversaire (pressing) : pas de règle de contact inventée.
  assert.equal(draw(crossing, RUN, { target: on('blue', 7) }, { target: on('red', 5) }).ok, true, 'pressing');
});

test('état lu dans le vrai tableau : 22 joueurs, le ballon au centre, aucune flèche', () => {
  const state = readTacticalState(new TacticsBoard(DEFAULT_FORMATIONS));
  assert.equal(state.players.length, 22);
  assert.deepEqual(state.ball, { x: 0, z: 0 });
  assert.deepEqual(state.arrows, []);
  assert.ok(state.players.every((p) => p.type === 'player' && Number.isInteger(p.number)));
});

test('messages de refus : courts, en français, un par raison', () => {
  for (const reason of Object.values(ARROW_REASONS)) {
    const message = describeReason(reason);
    assert.ok(message.length > 0 && message.length <= 75, `${reason} : « ${message} »`);
    assert.doesNotMatch(message, /undefined|null/);
  }
});
