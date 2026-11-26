/**
 * Tests unitaires du contenu football de chaque situation livrée dans scenarios/ : ce que
 * vérifierait un entraîneur (nombre de passes, zones, porteur du ballon à chaque image clé,
 * placements), au-delà de la seule validité du format (tests/unit/scenarios.test.mjs).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildScenarioState, fromRealMeters, validateScenario } from '../../src/scenarios.mjs';
import { PITCH_SCALE } from '../../src/config.mjs';

/**
 * Situation de la bibliothèque, lue et vérifiée, avec son état construit.
 * @param {string} id identifiant (nom du fichier sans « .json »)
 * @returns {{data: object, state: ReturnType<typeof buildScenarioState>}}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests unitaires (situations) — lecture de la bibliothèque
 */
function load(id) {
  const data = JSON.parse(readFileSync(new URL(`../../scenarios/${id}.json`, import.meta.url), 'utf8'));
  const verdict = validateScenario(data);
  assert.ok(verdict.ok, verdict.errors.join(' | '));
  return { data, state: buildScenarioState(data) };
}

/**
 * Joueur le plus proche du ballon dans une image clé, et sa distance réelle en mètres.
 * @param {{players: object, ball: {x: number, z: number}}} keyframe
 * @returns {{key: string, meters: number}}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests unitaires (situations) — porteur du ballon
 */
function carrier(keyframe) {
  let best = { key: null, meters: Number.POSITIVE_INFINITY };
  for (const [key, p] of Object.entries(keyframe.players)) {
    const meters = Math.hypot(p.x - keyframe.ball.x, p.z - keyframe.ball.z) / PITCH_SCALE;
    if (meters < best.meters) best = { key, meters };
  }
  return best;
}

test('contre-attaque en trois passes : trois passes bleues, du ballon récupéré au tir', () => {
  const { data, state } = load('contre-attaque-trois-passes');
  const kinds = data.arrows.filter((a) => a.team === 'blue').map((a) => a.kind);
  assert.deepEqual(kinds, ['pass', 'pass', 'dribble', 'cross', 'shot']);
  assert.equal(kinds.filter((k) => k === 'pass' || k === 'cross').length, 3, 'trois passes, le centre compris');
  // Récupération à l'entrée de la surface bleue, tir dans le but rouge.
  assert.ok(data.ball[0] < -25, 'ballon récupéré à moins de 28 m du but bleu');
  const [toX, toZ] = data.arrows.find((a) => a.kind === 'cross').to;
  assert.ok(toX >= 52.5 - 16.5 && Math.abs(toZ) <= 20.16, 'la dernière passe arrive dans la surface');
  // À chaque image avant le tir, un Bleu porte le ballon (à moins de 2 m).
  for (const keyframe of state.keyframes.slice(0, -1)) {
    const { key, meters } = carrier(keyframe);
    assert.ok(key.startsWith('blue:') && meters < 2, `${key} à ${meters.toFixed(1)} m`);
  }
  // Les Rouges attaquaient : leurs latéraux sont hauts, au-delà de la ligne médiane côté bleu.
  assert.ok(data.players['red:2'][0] <= 0 && data.players['red:3'][0] <= 0);
  // La dernière image est le tir : le ballon est sur la ligne de but rouge, entre les poteaux.
  const last = state.keyframes.at(-1).ball;
  assert.deepEqual(last, fromRealMeters([52.5, -2]));
});
