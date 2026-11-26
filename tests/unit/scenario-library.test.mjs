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

test('relance courte à trois avec pivot : gardien et centraux en base à trois, pivot entre les attaquants, troisième homme', () => {
  const { data, state } = load('relance-courte-trois-pivot');
  const [gk, left, right, pivot] = ['blue:1', 'blue:5', 'blue:4', 'blue:6'].map((key) => data.players[key]);
  // Base à trois : gardien et centraux dans la largeur de la surface (moins de 20,16 m de l'axe),
  // les centraux écartés d'au moins 30 m pour étirer les deux attaquants.
  for (const [x, z] of [gk, left, right]) assert.ok(x < -36 && Math.abs(z) <= 20.16);
  assert.ok(right[1] - left[1] >= 30);
  // Pivot entre les deux attaquants rouges, devant les centraux.
  const strikers = [data.players['red:9'], data.players['red:10']].sort((a, b) => a[1] - b[1]);
  assert.ok(pivot[1] > strikers[0][1] && pivot[1] < strikers[1][1], 'pivot dans l\'intervalle des deux attaquants');
  assert.ok(pivot[0] > left[0] && pivot[0] > right[0]);
  // Gardien → central → pivot → relayeur : le relayeur reçoit du pivot (troisième homme).
  const passes = data.arrows.filter((a) => a.kind === 'pass');
  assert.deepEqual(passes.slice(0, 3).map((a) => a.to), [right, pivot, data.players['blue:8']]);
  for (const keyframe of state.keyframes) {
    const { key, meters } = carrier(keyframe);
    assert.ok(key.startsWith('blue:') && meters < 2.5, `${key} à ${meters.toFixed(1)} m`);
  }
  // Pressing réel : chaque attaquant rouge à moins de 15 m d'un relanceur bleu au départ.
  for (const [x, z] of strikers) {
    assert.ok([gk, left, right].some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 15));
  }
});

test('pressing haut en 4-4-2 : bloc compact et haut, marquages, course courbe, récupération côté ballon', () => {
  const { data, state } = load('pressing-haut-4-4-2');
  const blueOutfield = Object.entries(data.players).filter(([key]) => key.startsWith('blue:') && key !== 'blue:1').map(([, p]) => p);
  const depths = blueOutfield.map(([x]) => x);
  assert.ok(Math.max(...depths) - Math.min(...depths) <= 35, 'bloc de 35 m au plus');
  for (const key of ['blue:2', 'blue:3', 'blue:4', 'blue:5']) assert.ok(data.players[key][0] > 0, `${key} dans la moitié rouge`);
  // Ailiers sur les latéraux, milieux sur leurs vis-à-vis : quatre marquages, tous bleus sur rouges.
  assert.equal(data.markings.length, 4);
  assert.ok(data.markings.every(([d, a]) => d.startsWith('blue:') && a.startsWith('red:')));
  // Course courbe du n° 9 : elle finit sur la ligne de passe entre le central qui reçoit et son
  // gardien, à moins de 3 m : la remise au gardien est fermée.
  const run = data.arrows.find((a) => a.kind === 'run' && a.from[0] === data.players['blue:9'][0]);
  const [receiver, keeper] = [data.arrows[0].to, data.players['red:1']];
  const [lx, lz] = [keeper[0] - receiver[0], keeper[1] - receiver[1]];
  const t = ((run.to[0] - receiver[0]) * lx + (run.to[1] - receiver[1]) * lz) / (lx * lx + lz * lz);
  const gap = Math.hypot(receiver[0] + t * lx - run.to[0], receiver[1] + t * lz - run.to[1]);
  assert.ok(t > 0 && t < 1 && gap < 3, `à ${gap.toFixed(1)} m de la ligne de remise`);
  // À la récupération : trois Bleus au moins à moins de 15 m du ballon, et un Bleu au ballon.
  const last = state.keyframes.at(-1);
  const near = Object.entries(last.players).filter(([key, p]) => key.startsWith('blue:')
    && Math.hypot(p.x - last.ball.x, p.z - last.ball.z) / PITCH_SCALE < 15);
  assert.ok(near.length >= 3, `${near.length} Bleus près du ballon`);
  assert.ok(carrier(last).key.startsWith('blue:'));
});

test('dédoublement et centre en retrait : le latéral passe à l\'extérieur, centre en arrière vers le point de penalty', () => {
  const { data, state } = load('dedoublement-centre-en-retrait');
  const [dribble, overlap, , , cross, lateRun, shot] = data.arrows;
  // Dédoublement : l'ailier rentre, le latéral finit plus près de la touche que lui.
  assert.ok(Math.abs(dribble.to[1]) < Math.abs(dribble.from[1]), 'l\'ailier rentre vers l\'axe');
  assert.ok(Math.abs(overlap.to[1]) > Math.abs(dribble.to[1]), 'le latéral dédouble par l\'extérieur');
  // Le latéral rouge est attiré vers l'axe à la première image.
  assert.ok(Math.abs(state.keyframes[1].players['red:3'].z) < Math.abs(state.keyframes[0].players['red:3'].z));
  // Centre en retrait : du bord de la ligne de but vers l'arrière, entre la surface de but et la limite de la surface.
  assert.equal(cross.kind, 'cross');
  assert.ok(52.5 - cross.from[0] <= 5, 'centre au ras de la ligne de but');
  assert.ok(cross.to[0] < cross.from[0], 'ballon joué en arrière');
  const fromGoalLine = 52.5 - cross.to[0];
  assert.ok(fromGoalLine > 5.5 && fromGoalLine <= 16.5 && Math.abs(cross.to[1]) <= 9.16, 'zone du point de penalty');
  // Le relayeur arrive lancé (plus de 10 m de course) et tire.
  assert.ok(Math.hypot(lateRun.to[0] - lateRun.from[0], lateRun.to[1] - lateRun.from[1]) > 10);
  assert.deepEqual(lateRun.to, cross.to);
  assert.equal(shot.kind, 'shot');
});

test('corner offensif contre une défense en zone : trois cibles, trois courses, zone sans marquage, couverture', () => {
  const { data } = load('corner-offensif-defense-en-zone');
  const [ballX, ballZ] = data.ball;
  assert.ok(Math.abs(52.5 - ballX) < 1 && Math.abs(34 - ballZ) < 1, 'ballon au point de corner droit');
  const crosses = data.arrows.filter((a) => a.kind === 'cross').map((a) => a.to);
  const runs = data.arrows.filter((a) => a.kind === 'run').map((a) => a.to);
  const [nearPost, farPost, spot] = crosses;
  // Premier poteau : côté du corner (z > 0), dans la surface de but ; second poteau : côté opposé.
  assert.ok(nearPost[1] > 0 && 52.5 - nearPost[0] <= 5.5 && nearPost[1] <= 9.16, 'premier poteau');
  assert.ok(farPost[1] < 0 && 52.5 - farPost[0] <= 5.5 && farPost[1] >= -9.16, 'second poteau');
  assert.ok(Math.abs(52.5 - spot[0] - 11) <= 1 && Math.abs(spot[1]) <= 1, 'point de penalty, à 11 m');
  assert.deepEqual(runs, crosses, 'une course lancée vers chaque cible');
  // Défense en zone : aucun marquage ; trois Rouges alignés dans la surface de but, un au premier
  // poteau, deux au point de penalty.
  assert.equal(data.markings, undefined);
  const red = Object.entries(data.players).filter(([key]) => key.startsWith('red:') && key !== 'red:1').map(([, p]) => p);
  const sixYard = red.filter(([x, z]) => 52.5 - x <= 5.5 && Math.abs(z) <= 9.16);
  assert.ok(sixYard.length >= 4, `${sixYard.length} Rouges dans la surface de but (ligne de trois et premier poteau)`);
  assert.ok(red.filter(([x, z]) => Math.abs(52.5 - x - 11) <= 1.5 && Math.abs(z) <= 5).length >= 2, 'deux Rouges au point de penalty');
  // Couverture de la contre-attaque : trois Bleus restent à moins de 10 m de la ligne médiane.
  const rest = Object.entries(data.players).filter(([key, [x]]) => key.startsWith('blue:') && key !== 'blue:1' && x <= 10);
  assert.equal(rest.length, 3);
});
