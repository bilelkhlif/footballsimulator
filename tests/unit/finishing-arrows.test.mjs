/**
 * Tests unitaires du dribble, du centre et du tir (src/arrow-rules.mjs, version 0.4). Chaque
 * situation est décrite sur le terrain réel de 105 × 68 m, puis ramenée à la maquette : les Bleus
 * attaquent le but situé en +X (x réel = +52,5 m), les Rouges celui situé en −X.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARROW_REASONS, attackSign, BALL_ARROW_KINDS, isInPenaltyArea, passOrigins, resolveArrowEnd, resolveArrowStart, validateArrow,
} from '../../src/arrow-rules.mjs';
import { ARROW_KINDS } from '../../src/tactics-board.mjs';
import { PITCH_SCALE } from '../../src/config.mjs';

const { DRIBBLE, CROSS, SHOT, PASS } = ARROW_KINDS;

/**
 * Point de la maquette à partir de coordonnées réelles, en mètres depuis le point central.
 * @param {number} x le long du terrain (+52,5 m : but attaqué par les Bleus)
 * @param {number} z en largeur (±34 m : lignes de touche)
 * @returns {{x: number, z: number}}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests unitaires (dribble, centre, tir) — repère réel
 */
function real(x, z) {
  return { x: x * PITCH_SCALE, z: z * PITCH_SCALE };
}

/**
 * État tactique minimal : le ballon et quelques joueurs, en mètres réels.
 * @param {{x: number, z: number}} ball position réelle du ballon
 * @param {Array<[string, number, number, number]>} players équipe, numéro, x et z réels
 * @param {Array<object>} [arrows]
 * @returns {object}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests unitaires (dribble, centre, tir) — montage du test
 */
function situation(ball, players, arrows = []) {
  return {
    ball: real(ball.x, ball.z),
    players: players.map(([teamId, number, x, z]) => ({ type: 'player', teamId, number, ...real(x, z) })),
    arrows,
  };
}

/**
 * Trace une flèche du ballon vers un point réel, comme l'interaction : départ, puis arrivée.
 * @param {string} kind
 * @param {object} state
 * @param {{x: number, z: number}} to point réel d'arrivée
 * @param {object|null} [target] joueur touché à l'arrivée
 * @returns {object} décision d'arrivée, ou refus du départ
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests unitaires (dribble, centre, tir) — geste simulé
 */
function draw(kind, state, to, target = null) {
  const start = resolveArrowStart({ kind, target: { type: 'ball' }, point: null }, state);
  if (!start.ok) return start;
  const draft = { kind, start: start.start, actor: start.actor, passer: start.passer };
  return resolveArrowEnd({ draft, target, point: target ? null : real(to.x, to.z) }, state);
}

test('les quatre flèches du ballon partent du ballon ; la course reste à part', () => {
  assert.deepEqual(BALL_ARROW_KINDS, [PASS, DRIBBLE, CROSS, SHOT]);
});

test('dribble : le porteur conduit le ballon ; sans porteur, refusé', () => {
  const carried = situation({ x: 0, z: 0 }, [['blue', 8, -1.5, 0]]);
  assert.equal(draw(DRIBBLE, carried, { x: 15, z: 8 }).ok, true, 'le n° 8 conduit le ballon sur 17 m');
  const loose = situation({ x: 0, z: 0 }, [['blue', 8, -20, 0]]);
  assert.equal(draw(DRIBBLE, loose, { x: 15, z: 8 }).reason, ARROW_REASONS.DRIBBLE_NEEDS_CARRIER);
  assert.equal(draw(PASS, loose, { x: 15, z: 8 }).ok, true, 'une passe, elle, peut partir d\'un ballon libre');
});

test('centre : d\'un couloir du dernier tiers vers la surface', () => {
  // Ailier droit bleu à 15 m de la ligne de but, à 27 m de l'axe : un vrai centre.
  const wide = situation({ x: 37.5, z: 27 }, [['blue', 7, 37, 27.5]]);
  assert.equal(draw(CROSS, wide, { x: 46, z: -3 }).ok, true, 'vers le second poteau, dans la surface');
  assert.equal(draw(CROSS, wide, { x: 30, z: 0 }).reason, ARROW_REASONS.CROSS_NOT_IN_BOX, 'en retrait, hors de la surface');
  // Depuis l'axe : c'est une passe, pas un centre.
  const central = situation({ x: 37.5, z: 10 }, [['blue', 10, 37, 10]]);
  assert.equal(draw(CROSS, central, { x: 46, z: 0 }).reason, ARROW_REASONS.CROSS_NOT_WIDE);
  // Depuis le milieu de terrain, dans le couloir : trop loin pour un centre.
  const far = situation({ x: 5, z: 28 }, [['blue', 3, 5, 28.5]]);
  assert.equal(draw(CROSS, far, { x: 46, z: 0 }).reason, ARROW_REASONS.CROSS_TOO_FAR);
});

test('centre vers un adversaire : refusé comme une passe ; vers un partenaire : accepté', () => {
  const state = situation({ x: 37.5, z: 27 }, [['blue', 7, 37, 27.5], ['blue', 9, 47, 1], ['red', 5, 48, -2]]);
  assert.equal(draw(CROSS, state, null, { type: 'player', teamId: 'red', number: 5 }).reason, ARROW_REASONS.PASS_TO_OPPONENT);
  const toNine = draw(CROSS, state, null, { type: 'player', teamId: 'blue', number: 9 });
  assert.equal(toNine.ok, true);
  assert.deepEqual(toNine.receiver, { type: 'player', teamId: 'blue', number: 9 });
});

test('tir : entre les poteaux, à 40 m au plus, jamais vers son propre but', () => {
  const edgeOfBox = situation({ x: 35, z: 2 }, [['blue', 9, 34.5, 2]]);
  assert.equal(draw(SHOT, edgeOfBox, { x: 52.5, z: -2.5 }).ok, true, 'tir à ras de terre, côté opposé');
  assert.equal(draw(SHOT, edgeOfBox, { x: 52.5, z: 5 }).reason, ARROW_REASONS.SHOT_NOT_ON_GOAL, 'à côté du poteau');
  assert.equal(draw(SHOT, edgeOfBox, { x: 40, z: 0 }).reason, ARROW_REASONS.SHOT_NOT_ON_GOAL, 'arrêté au point de penalty');
  assert.equal(draw(SHOT, edgeOfBox, { x: -52.5, z: 0 }).reason, ARROW_REASONS.SHOT_OWN_GOAL);
  const fromHalfway = situation({ x: 5, z: 0 }, [['blue', 6, 4.5, 0]]);
  assert.equal(draw(SHOT, fromHalfway, { x: 52.5, z: 0 }).reason, ARROW_REASONS.SHOT_TOO_FAR, '47,5 m');
});

test('tir : un toucher sur le but lui-même, derrière la ligne, vise la ligne de but', () => {
  const state = situation({ x: 40, z: 0 }, [['blue', 9, 39.5, 0]]);
  const decision = draw(SHOT, state, { x: 53.5, z: 1 });
  assert.equal(decision.ok, true);
  assert.ok(Math.abs(decision.end.x - 52.5 * PITCH_SCALE) < 1e-12, 'arrivée ramenée sur la ligne de but');
});

test('les Rouges tirent vers le but situé en −X', () => {
  const state = situation({ x: -38, z: 0 }, [['red', 9, -37.5, 0]]);
  assert.equal(draw(SHOT, state, { x: -52.5, z: 1 }).ok, true);
  assert.equal(attackSign({ teamId: 'red' }, real(10, 0)), -1);
  assert.equal(attackSign(null, real(-10, 0)), -1, 'sans porteur : le but du côté de l\'arrivée');
});

test('surface de réparation : 40,32 m de large et 16,5 m de profondeur', () => {
  assert.equal(isInPenaltyArea(real(36.1, 20), 1), true);
  assert.equal(isInPenaltyArea(real(35.9, 0), 1), false, 'à 16,6 m de la ligne');
  assert.equal(isInPenaltyArea(real(50, 20.3), 1), false, 'au-delà de la largeur');
  assert.equal(isInPenaltyArea(real(-50, 0), 1), false, 'surface de l\'autre but');
});

test('enchaînement : une passe peut partir de l\'arrivée d\'un dribble ou d\'un centre, pas d\'un tir', () => {
  const arrows = [
    { id: 1, kind: DRIBBLE, from: real(0, 0), to: real(15, 8) },
    { id: 2, kind: CROSS, from: real(38, 27), to: real(46, -3) },
    { id: 3, kind: SHOT, from: real(40, 0), to: real(52.5, 1) },
  ];
  const sources = passOrigins({ ball: real(0, 0), arrows }).map(({ source }) => source);
  assert.deepEqual(sources, ['ball', DRIBBLE, CROSS]);
});

test('validateArrow : un dribble sans porteur est refusé même si son tracé est valide', () => {
  const state = { ball: real(0, 0), players: [], arrows: [] };
  assert.equal(validateArrow({ kind: DRIBBLE, from: real(0, 0), to: real(10, 0) }, state).reason, ARROW_REASONS.DRIBBLE_NEEDS_CARRIER);
  assert.equal(validateArrow({ kind: DRIBBLE, from: real(0, 0), to: real(10, 0) }, state, { passer: { teamId: 'blue' } }).ok, true);
});
