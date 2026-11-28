/**
 * Tests unitaires des calques de lecture du terrain : src/pitch-zones.mjs et
 * src/pitch-zones-layer.mjs. Mesures en mètres réels sur 105 × 68 m (tiers de 35 m, couloirs
 * alignés sur les surfaces, zone 14 devant la surface adverse), passage à la maquette, et couche
 * 3D masquée par défaut, aux couleurs des maillots, dans le repère du terrain.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DEFAULT_FORMATIONS, PITCH_SCALE, REAL_PITCH } from '../../src/config.mjs';
import { TacticsBoard } from '../../src/tactics-board.mjs';
import { ChangeTeamIdentityCommand, CommandHistory } from '../../src/commands.mjs';
import {
  describePitchArea, halfSpaces, LANE_LINES, laneLines, PITCH_LAYERS, THIRD_LINES, thirdLines, toModel, zone14,
} from '../../src/pitch-zones.mjs';
import { createRectanglesGeometry, PitchZonesLayer } from '../../src/pitch-zones-layer.mjs';

test('tiers : trois bandes de 35 m, lignes à ±17,5 m du point central, traits centrés', () => {
  assert.deepEqual(THIRD_LINES, [-17.5, 17.5]);
  const [left, right] = thirdLines(0.3);
  assert.ok(Math.abs(left.x1 + 17.65) < 1e-9 && Math.abs(left.x2 + 17.35) < 1e-9);
  assert.equal(right.z1, -REAL_PITCH.width / 2);
  assert.equal(right.z2, REAL_PITCH.width / 2);
  assert.ok(Math.abs(right.x2 - right.x1 - 0.3) < 1e-9);
});

test('cinq couloirs : limites dans le prolongement des surfaces de but et de réparation', () => {
  assert.deepEqual(LANE_LINES, [-20.16, -9.16, 9.16, 20.16]);
  // Couloirs : latéral 13,84 m, demi-espace 11 m, central 18,32 m, puis symétriques : 68 m en tout.
  const edges = [-34, ...LANE_LINES, 34];
  const widths = edges.slice(1).map((edge, index) => Number((edge - edges[index]).toFixed(2)));
  assert.deepEqual(widths, [13.84, 11, 18.32, 11, 13.84]);
  assert.equal(laneLines(0.3).length, 4);
  for (const line of laneLines(0.3)) assert.deepEqual([line.x1, line.x2], [-52.5, 52.5]);
});

test('demi-espaces : les deux couloirs entre le central et les latéraux, sur toute la longueur', () => {
  const spaces = halfSpaces();
  assert.equal(spaces.length, 2);
  for (const { x1, x2, z1, z2 } of spaces) {
    assert.deepEqual([x1, x2], [-52.5, 52.5]);
    assert.ok(Math.abs(Math.abs(z2 - z1) - 11) < 1e-9);
  }
});

test('zone 14 : case centrale de la 5e bande sur 6, devant la surface que l\'équipe attaque', () => {
  const blue = zone14(true);
  assert.ok(Math.abs(blue.x1 - 17.5) < 1e-9 && Math.abs(blue.x2 - 35) < 1e-9, '17,5 à 35 m après la ligne médiane');
  assert.ok(Math.abs(blue.z2 - 68 / 6) < 1e-9 && Math.abs(blue.z1 + 68 / 6) < 1e-9, '22,67 m de large');
  // Elle s'arrête avant la surface de réparation (à 36 m du centre), sans la chevaucher.
  assert.ok(blue.x2 < 52.5 - 16.5);
  const red = zone14(false);
  assert.deepEqual([red.x1, red.x2], [-blue.x2, -blue.x1]);
});

test('passage à la maquette et description d\'un point : tiers dans le sens des Bleus, couloir', () => {
  const model = toModel({ x1: -52.5, z1: -34, x2: 52.5, z2: 34 });
  assert.ok(Math.abs(model.x2 - model.x1 - 0.6) < 1e-12, '105 m réels : 60 cm de maquette');
  assert.ok(Math.abs(model.z2 - 34 * PITCH_SCALE) < 1e-12);
  const at = (x, z) => describePitchArea({ x: x * PITCH_SCALE, z: z * PITCH_SCALE });
  assert.deepEqual(at(25, 0), { third: 'tiers offensif des Bleus', lane: 'couloir central' });
  assert.deepEqual(at(-30, -15), { third: 'tiers défensif des Bleus', lane: 'demi-espace' });
  assert.deepEqual(at(0, 30), { third: 'tiers central', lane: 'couloir latéral' });
});

test('géométrie : quatre sommets et deux triangles tournés vers le haut par rectangle', () => {
  const geometry = createRectanglesGeometry([{ x1: 0, z1: 0, x2: 1, z2: 2 }, { x1: -1, z1: -1, x2: 0, z2: 0 }], 0.001);
  assert.equal(geometry.getAttribute('position').count, 8);
  assert.equal(geometry.getIndex().count, 12);
  geometry.computeVertexNormals();
  assert.ok(geometry.getAttribute('normal').getY(0) > 0.99, 'normale vers +y');
  assert.ok(Math.abs(geometry.getAttribute('position').getY(5) - 0.001) < 1e-7);
});

test('couche 3D : quatre calques masqués au départ, dans le repère du terrain, zone 14 aux couleurs des maillots', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const pitchGroup = new THREE.Group();
  const layer = new PitchZonesLayer({ pitchGroup, board });
  assert.deepEqual(layer.layers, Object.values(PITCH_LAYERS));
  for (const name of layer.layers) assert.equal(layer.isVisible(name), false, name);
  assert.equal(pitchGroup.getObjectByName('pitch-zones').parent, pitchGroup);
  layer.setVisible(PITCH_LAYERS.ZONE_14, true);
  assert.equal(layer.isVisible(PITCH_LAYERS.ZONE_14), true);
  const blueZone = layer.objectFor(PITCH_LAYERS.ZONE_14).getObjectByName('zone-14-blue');
  assert.equal(blueZone.material.color.getHex(), new THREE.Color(board.getIdentity('blue').color).getHex());
  new CommandHistory().execute(new ChangeTeamIdentityCommand({ board, teamId: 'blue', name: 'Bleus', kit: 'jaune' }));
  assert.equal(blueZone.material.color.getHex(), new THREE.Color(board.getIdentity('blue').color).getHex(), 'suit le maillot');
  assert.throws(() => layer.setVisible('inconnu', true), RangeError);
  layer.dispose();
  assert.equal(pitchGroup.getObjectByName('pitch-zones'), undefined);
});
