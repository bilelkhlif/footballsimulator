/**
 * Tests unitaires des zones surlignées (phase 6) : état dans TacticsBoard (zones rangées, refus,
 * limites), commandes annulables, enregistrement avec la tactique (rétrocompatible), outil « Zone »
 * de l'interaction (deux coins, aperçu jugé, terrain ancré et tourné), couche 3D instanciée et
 * description en mètres réels.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DEFAULT_FORMATIONS, PITCH_SCALE } from '../../src/config.mjs';
import {
  MAX_ZONES, MIN_ZONE_SIZE, normalizeZone, PITCH_HALF_EXTENTS, TacticsBoard, zoneProblem,
} from '../../src/tactics-board.mjs';
import { TacticalSequence } from '../../src/tactical-sequence.mjs';
import { AddZoneCommand, CommandHistory, RemoveZoneCommand, ResetBoardCommand } from '../../src/commands.mjs';
import { captureTactic, isValidTactic } from '../../src/tactic-storage.mjs';
import { createTacticFile, parseTacticFile, serializeTacticFile } from '../../src/tactic-file.mjs';
import { clampToPitch, INTERACTION_MODES, INTERACTION_STATES } from '../../src/tactical-interaction.mjs';
import { resolveShortcut } from '../../src/keyboard-shortcuts.mjs';
import { ZoneLayer } from '../../src/zone-layer.mjs';
import { describeZone } from '../../src/zone-panel.mjs';
import { aimRay, createTacticalFixture, pitchPointToWorld } from './tactical-fixtures.mjs';

/** Un mètre réel, en mètres de maquette. */
const M = PITCH_SCALE;

/**
 * Touchers et survols de test, depuis un point de vue au-dessus du terrain.
 * @param {ReturnType<typeof createTacticalFixture>} fixture
 * @returns {{tap: (x: number, z: number) => object, hover: (x: number, z: number) => void}}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests unitaires (zones surlignées) — outil de vérification
 */
function createGestures(fixture) {
  const raycaster = new THREE.Raycaster();
  const eye = pitchPointToWorld(fixture.pitchGroup, 0.02, 0.03, 0.9);
  return {
    tap: (x, z) => fixture.interaction.handleTap(aimRay(raycaster, eye, pitchPointToWorld(fixture.pitchGroup, x, z))),
    hover: (x, z) => fixture.interaction.hover(aimRay(raycaster, eye, pitchPointToWorld(fixture.pitchGroup, x, z))),
  };
}

test('tableau : zone rangée quel que soit l\'ordre des coins ; refus hors du terrain, trop petite, en double, au-delà de 8', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const zone = board.addZone({ from: { x: 30 * M, z: 10 * M }, to: { x: 12 * M, z: -5 * M } });
  assert.equal(zone.id, 1);
  assert.ok(zone.from.x < zone.to.x && zone.from.z < zone.to.z);
  assert.deepEqual(board.getZones(), [zone]);
  assert.throws(() => board.addZone({ from: { x: 0, z: 0 }, to: { x: 60 * M, z: 5 * M } }), /sur le terrain/);
  assert.throws(() => board.addZone({ from: { x: 0, z: 0 }, to: { x: 1.5 * M, z: 10 * M } }), /trop petite/);
  assert.throws(() => board.addZone({ from: zone.to, to: zone.from }), /déjà surlignée/);
  for (let index = 1; index < MAX_ZONES; index += 1) {
    board.addZone({ from: { x: -50 * M + index * 5 * M, z: 0 }, to: { x: -47 * M + index * 5 * M, z: 3 * M } });
  }
  assert.throws(() => board.addZone({ from: { x: 0, z: 0 }, to: { x: 5 * M, z: 5 * M } }), new RegExp(`${MAX_ZONES} zones au plus`));
  assert.equal(board.removeZone(1), true);
  assert.equal(board.removeZone(1), false);
  assert.equal(zoneProblem({ from: { x: Number.NaN, z: 0 }, to: { x: 0, z: 0 } }) !== null, true);
  assert.deepEqual(normalizeZone({ from: { x: 2, z: 1 }, to: { x: 1, z: 2 } }), { from: { x: 1, z: 1 }, to: { x: 2, z: 2 } });
  assert.ok(Math.abs(MIN_ZONE_SIZE - 2 * M) < 1e-12);
});

test('commandes : surligner et retirer sont annulables, avec le même identifiant ; Réinitialiser efface les zones', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const history = new CommandHistory();
  const add = new AddZoneCommand({ board, zone: { from: { x: 17.5 * M, z: -11 * M }, to: { x: 35 * M, z: 11 * M } } });
  history.execute(add);
  assert.equal(history.undoLabel, 'Surligner une zone');
  history.undo();
  assert.equal(board.getZones().length, 0);
  history.redo();
  assert.equal(board.getZones()[0].id, add.zoneId);
  assert.equal(history.execute(new RemoveZoneCommand({ board, id: 99 })), false, 'zone absente : rien à garder');
  history.execute(new RemoveZoneCommand({ board, id: add.zoneId }));
  assert.equal(board.getZones().length, 0);
  history.undo();
  assert.equal(board.getZones()[0].id, add.zoneId);
  assert.equal(board.isInInitialState(), false, 'une zone change l\'état de départ');
  history.execute(new ResetBoardCommand({ board }));
  assert.equal(board.getZones().length, 0);
  history.undo();
  assert.equal(board.getZones().length, 1, 'Annuler la réinitialisation rend la zone');
});

test('enregistrement : zones gardées et vérifiées ; sans zone, aucune clé ; une tactique ancienne reste valable', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const sequence = new TacticalSequence();
  assert.equal(Object.hasOwn(board.snapshot(), 'zones'), false, 'instantané d\'avant la phase 6 inchangé');
  board.addZone({ from: { x: -10 * M, z: -20 * M }, to: { x: 10 * M, z: -9 * M } });
  const tactic = captureTactic(board, sequence);
  assert.ok(isValidTactic(tactic, board.snapshot()));
  const parsed = parseTacticFile(serializeTacticFile(createTacticFile({ name: 'Zones', tactic })), board.snapshot());
  assert.equal(parsed.ok, true);
  const other = new TacticsBoard(DEFAULT_FORMATIONS);
  other.restore(parsed.tactic.board);
  assert.deepEqual(other.getZones(), board.getZones());
  const corrupted = [
    [{ id: 1, from: { x: 0, z: 0 }, to: { x: 0.001, z: 0.001 } }],
    [{ id: 1, from: { x: 0.1, z: 0 }, to: { x: 0, z: 0.1 } }],
    [{ id: 0, from: { x: 0, z: 0 }, to: { x: 0.1, z: 0.1 } }],
    [{ id: 1, from: { x: 0, z: 0 }, to: { x: 0.1, z: 0.1 }, label: 'x' }],
    Array.from({ length: MAX_ZONES + 1 }, (_, id) => ({ id: id + 1, from: { x: 0, z: 0 }, to: { x: 0.1, z: 0.1 } })),
    'zones',
  ];
  for (const zones of corrupted) {
    const bad = structuredClone(tactic);
    bad.board.zones = zones;
    assert.equal(isValidTactic(bad, board.snapshot()), false, JSON.stringify(zones).slice(0, 50));
  }
});

test('outil « Zone » : deux coins, coin hors des lignes ramené dessus, aperçu jugé, même coin abandonne', () => {
  const fixture = createTacticalFixture();
  const gestures = createGestures(fixture);
  fixture.interaction.setMode(INTERACTION_MODES.ZONE);
  assert.equal(fixture.interaction.state, INTERACTION_STATES.ARROW_START);
  assert.equal(gestures.tap(0.05, 0.05).action, 'arrow-start');
  assert.equal(fixture.interaction.wantsHover, true);
  gestures.hover(0.052, 0.051);
  assert.equal(fixture.interaction.hoverVerdict.valid, false, 'trop petite : aperçu refusé');
  gestures.hover(0.15, 0.12);
  assert.equal(fixture.interaction.hoverVerdict.valid, true);
  assert.equal(gestures.tap(0.0505, 0.0502).action, 'cancel', 'le même coin abandonne');
  assert.equal(fixture.history.canUndo, false);
  gestures.tap(0.2, 0.1);
  // Second coin sur la bande de gazon, derrière la ligne de touche : ramené sur la ligne.
  const done = gestures.tap(0.28, PITCH_HALF_EXTENTS.z + 0.004);
  assert.equal(done.action, 'zone');
  const [zone] = fixture.board.getZones();
  assert.ok(Math.abs(zone.to.z - PITCH_HALF_EXTENTS.z) < 1e-9);
  assert.match(done.message, /^Zone de \d+ × \d+ m surlignée\.$/);
  assert.equal(fixture.interaction.state, INTERACTION_STATES.ARROW_START, 'prêt pour la zone suivante');
  fixture.history.undo();
  assert.equal(fixture.board.getZones().length, 0);
  assert.deepEqual(clampToPitch({ x: 1, z: -1 }), { x: PITCH_HALF_EXTENTS.x, z: -PITCH_HALF_EXTENTS.z });
});

test('terrain ancré et tourné : les coins de la zone sont exacts dans le repère du terrain', () => {
  const fixture = createTacticalFixture({ position: { x: 0.4, y: 0.72, z: -0.3 }, rotation: new THREE.Euler(0, 1.1, 0) });
  const gestures = createGestures(fixture);
  fixture.interaction.setMode(INTERACTION_MODES.ZONE);
  gestures.tap(-0.1, -0.05);
  gestures.tap(0.06, 0.08);
  const [zone] = fixture.board.getZones();
  assert.ok(Math.abs(zone.from.x + 0.1) < 1e-6 && Math.abs(zone.from.z + 0.05) < 1e-6);
  assert.ok(Math.abs(zone.to.x - 0.06) < 1e-6 && Math.abs(zone.to.z - 0.08) < 1e-6);
});

test('couche 3D : deux maillages instanciés suivent les zones ; l\'aperçu suit le tracé', () => {
  const fixture = createTacticalFixture();
  const layer = new ZoneLayer({ pitchGroup: fixture.pitchGroup, board: fixture.board, interaction: fixture.interaction });
  assert.equal(layer.count, 0);
  assert.equal(fixture.pitchGroup.getObjectByName('zone-fills').visible, false, 'aucun appel de dessin sans zone');
  fixture.board.addZone({ from: { x: 0, z: 0 }, to: { x: 0.1, z: 0.05 } });
  assert.equal(layer.count, 1);
  assert.equal(fixture.pitchGroup.getObjectByName('zone-edges').count, 4);
  const matrix = new THREE.Matrix4();
  fixture.pitchGroup.getObjectByName('zone-fills').getMatrixAt(0, matrix);
  const position = new THREE.Vector3().setFromMatrixPosition(matrix);
  assert.ok(Math.abs(position.x - 0.05) < 1e-9 && Math.abs(position.z - 0.025) < 1e-9, 'centrée sur la zone');
  const gestures = createGestures(fixture);
  fixture.interaction.setMode(INTERACTION_MODES.ZONE);
  gestures.tap(-0.1, -0.1);
  gestures.hover(-0.02, -0.04);
  layer.update();
  assert.equal(layer.previewVisible, true);
  fixture.interaction.cancel();
  layer.update();
  assert.equal(layer.previewVisible, false);
  layer.dispose();
  assert.equal(fixture.pitchGroup.getObjectByName('zones'), undefined);
});

test('description et raccourci : mètres réels, tiers et couloir ; Z choisit l\'outil, Ctrl+Z annule toujours', () => {
  assert.equal(describeZone({ from: { x: 17.5 * M, z: 9.16 * M }, to: { x: 35 * M, z: 20.16 * M } }), '18 × 11 m · tiers offensif des Bleus, demi-espace');
  assert.deepEqual(resolveShortcut({ key: 'z' }), { type: 'mode', mode: 'zone' });
  assert.deepEqual(resolveShortcut({ key: 'z', ctrlKey: true }), { type: 'undo' });
});
