/**
 * Tests unitaires des mesures tactiques (src/tactical-metrics.mjs) et de leur affichage
 * (src/analysis-panel.mjs) : largeur, profondeur, distance entre les lignes et surface occupée, en
 * mètres réels sur un terrain de 105 × 68 m.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  convexHullArea, lineCountsOf, measureShape, measureTeam, toRealMeters,
} from '../../src/tactical-metrics.mjs';
import { formatMetric } from '../../src/analysis-panel.mjs';
import { TacticsBoard } from '../../src/tactics-board.mjs';
import { PHASES } from '../../src/formations.mjs';
import { PITCH_LENGTH, PITCH_SCALE, REAL_PITCH } from '../../src/config.mjs';

test('toRealMeters : la longueur de la maquette vaut 105 m', () => {
  assert.ok(Math.abs(toRealMeters(PITCH_LENGTH) - REAL_PITCH.length) < 1e-9);
});

test('surface de l\'enveloppe convexe : carré, triangle, points intérieurs ignorés, cas dégénérés', () => {
  const square = [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }, { x: 1, z: 1 }];
  assert.equal(convexHullArea(square), 4);
  assert.equal(convexHullArea([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 3 }]), 6);
  assert.equal(convexHullArea([{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 2 }]), 0, 'points alignés');
  assert.equal(convexHullArea([{ x: 0, z: 0 }]), 0);
});

test('lignes lues dans le nom de la disposition : défense, milieu, attaque', () => {
  assert.deepEqual(lineCountsOf('4-3-3'), [4, 3, 3]);
  assert.deepEqual(lineCountsOf('4-2-3-1'), [4, 5, 1], 'les lignes du milieu sont regroupées');
  assert.deepEqual(lineCountsOf('2-1-4-1-2'), [2, 6, 2]);
  assert.deepEqual(lineCountsOf('5-3-2 bas'), [5, 3, 2]);
  assert.deepEqual(lineCountsOf('4-4-2 losange'), [4, 4, 2]);
  assert.equal(lineCountsOf('Base'), null);
  assert.equal(lineCountsOf('4-4-3'), null, '11 joueurs de champ : refusé');
});

test('mesures d\'un bloc connu, en mètres réels, sans le gardien', () => {
  // Bloc de 40 m de large et 30 m de profondeur : 4 défenseurs, 3 milieux, 3 attaquants.
  const at = (xMeters, zMeters, post) => ({ x: xMeters * PITCH_SCALE, z: zMeters * PITCH_SCALE, post });
  const players = [
    at(-50, 0, 'GB'),
    at(-20, -20, 'DG'), at(-20, -7, 'DC'), at(-20, 7, 'DC'), at(-20, 20, 'DD'),
    at(-5, -10, 'MC'), at(-5, 0, 'MDC'), at(-5, 10, 'MC'),
    at(10, -15, 'AG'), at(10, 0, 'AT'), at(10, 15, 'AD'),
  ];
  const metrics = measureShape(players, true, [4, 3, 3]);
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);
  near(metrics.width, 40);
  near(metrics.depth, 30, 'le gardien n\'allonge pas le bloc');
  near(metrics.defenseToMidfield, 15);
  near(metrics.midfieldToAttack, 15);
  // Les milieux sont à l'intérieur : un trapèze de 40 m (défense) et 30 m (attaque), haut de 30 m.
  near(metrics.area, (40 + 30) / 2 * 30);
  // Les Rouges attaquent vers −X : les lignes sont orientées dans leur sens.
  const mirrored = players.map((p) => ({ ...p, x: -p.x }));
  near(measureShape(mirrored, false, [4, 3, 3]).defenseToMidfield, 15);
  // Sans nom de disposition, les postes forment les lignes.
  near(measureShape(players, true).midfieldToAttack, 15);
});

test('4-3-3 : bloc plus compact hors possession qu\'en possession, lignes lues sur le terrain', () => {
  const board = new TacticsBoard({ blue: '4-3-3', red: '4-4-2' });
  const base = measureTeam(board, 'blue');
  board.setPhase('blue', PHASES.POSSESSION);
  const possession = measureTeam(board, 'blue');
  board.setPhase('blue', PHASES.DEFENSE);
  const defense = measureTeam(board, 'blue');
  assert.ok(possession.area > 2000, `en possession, l'équipe s'étale (${possession.area.toFixed(0)} m²)`);
  assert.ok(defense.area < 1000, `hors possession, le bloc est compact (${defense.area.toFixed(0)} m²)`);
  assert.ok(defense.area < base.area && base.area < possession.area);
  assert.ok(possession.depth > 45 && defense.depth < 30);
  // 4-5-1 : les ailiers redescendus comptent dans le milieu ; entre milieu et attaque, plus de 10 m.
  assert.ok(defense.midfieldToAttack > 10, `${defense.midfieldToAttack.toFixed(1)} m`);
  for (const value of Object.values(defense)) assert.ok(Number.isFinite(value));
});

test('les mesures suivent un joueur déplacé à la main', () => {
  const board = new TacticsBoard({ blue: '4-3-3', red: '4-4-2' });
  const before = measureTeam(board, 'blue').width;
  // L'ailier gauche colle la ligne de touche : la largeur augmente.
  const winger = board.getPlayerPosition('blue', 11);
  board.setPlayerPosition('blue', 11, { x: winger.x, z: -0.19 });
  assert.ok(measureTeam(board, 'blue').width > before);
});

test('affichage : arrondi au mètre, avec l\'unité, et un tiret pour une mesure absente', () => {
  assert.equal(formatMetric(52.4, 'm'), '52 m');
  assert.equal(formatMetric(null, 'm'), '—');
  assert.match(formatMetric(1374.2, 'm²'), /^1\s?374 m²$/);
});
