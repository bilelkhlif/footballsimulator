/**
 * Tests unitaires de la personnalisation des joueurs (coupe, couleur des cheveux, teint) :
 * src/player-appearance.mjs, l'apparence dans
 * le tableau tactique, ChangePlayerAppearanceCommand, la persistance (sauvegarde et fichier JSON)
 * et les coupes dans les pions instanciés.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TacticsBoard } from '../../src/tactics-board.mjs';
import { TacticalSequence } from '../../src/tactical-sequence.mjs';
import { ChangeFormationCommand, ChangePlayerAppearanceCommand, CommandHistory } from '../../src/commands.mjs';
import { DEFAULT_FORMATIONS, TEAMS } from '../../src/config.mjs';
import { captureTactic, isValidTactic, restoreTactic } from '../../src/tactic-storage.mjs';
import { createTacticFile, parseTacticFile, serializeTacticFile } from '../../src/tactic-file.mjs';
import {
  DEFAULT_APPEARANCE, HAIR_STYLE_IDS, isValidAppearance, SKIN_TONE_IDS, SKIN_TONES,
} from '../../src/player-appearance.mjs';
import { PlayerFactory } from '../../src/players.mjs';
import { createTeam } from '../../src/team.mjs';
import { createHairGeometries } from '../../src/player-model.mjs';
import { installFakeDocument } from './tactical-fixtures.mjs';

test('quatre coupes, géométries réellement différentes', () => {
  assert.deepEqual(HAIR_STYLE_IDS, ['classic', 'crew', 'curly', 'mohawk']);
  const geometries = createHairGeometries(0.028);
  const sizes = HAIR_STYLE_IDS.map((style) => geometries[style].attributes.position.count);
  assert.equal(new Set(sizes).size, 4, 'quatre maillages distincts');
  const top = (style) => geometries[style].boundingBox.max.y;
  assert.ok(top('mohawk') > top('classic'), 'la crête dépasse le haut du crâne');
  assert.equal(isValidAppearance({ hair: 'curly', color: '#aa3300' }), true);
  assert.equal(isValidAppearance({ hair: 'afro', color: '#aa3300' }), false);
  assert.equal(isValidAppearance({ hair: 'curly', color: 'rouge' }), false);
});

test('apparence par joueur, annulable, qui suit le joueur quand la formation change', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const history = new CommandHistory();
  history.execute(new ChangePlayerAppearanceCommand({ board, teamId: 'blue', number: 9, appearance: { hair: 'mohawk', color: '#8b5a2b' } }));
  history.execute(new ChangePlayerAppearanceCommand({ board, teamId: 'blue', number: 1, appearance: { hair: 'curly', color: '#111111' } }));
  assert.deepEqual(board.getAppearance('blue', 9), { hair: 'mohawk', color: '#8b5a2b', skin: 'tan' });
  assert.deepEqual(board.getAppearance('blue', 10), DEFAULT_APPEARANCE, 'les autres ne changent pas');
  assert.deepEqual(board.getAppearance('red', 9), DEFAULT_APPEARANCE, 'même numéro, autre équipe');
  history.execute(new ChangeFormationCommand({ board, teamId: 'blue', formation: '3-5-2' }));
  assert.deepEqual(board.getAppearance('blue', 9), { hair: 'mohawk', color: '#8b5a2b', skin: 'tan' });
  history.undo();
  history.undo();
  assert.deepEqual(board.getAppearance('blue', 1), DEFAULT_APPEARANCE);
  assert.deepEqual(board.getAppearance('blue', 9), { hair: 'mohawk', color: '#8b5a2b', skin: 'tan' });
  assert.throws(() => board.setAppearance('blue', 9, { hair: 'afro', color: '#000000' }), RangeError);
});

test('sauvegarde, fichier JSON et ancienne tactique sans apparence', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const sequence = new TacticalSequence();
  board.setAppearance('red', 7, { hair: 'crew', color: '#f0d060', skin: 'very-deep' });
  const tactic = captureTactic(board, sequence);
  assert.deepEqual(tactic.board.appearances, { 'red:7': { hair: 'crew', color: '#f0d060', skin: 'very-deep' } });

  const fresh = new TacticsBoard(DEFAULT_FORMATIONS);
  const parsed = parseTacticFile(serializeTacticFile(createTacticFile({ name: 'A', tactic })), fresh.snapshot());
  assert.equal(parsed.ok, true);
  assert.equal(restoreTactic(parsed.tactic, fresh, new TacticalSequence()), true);
  assert.deepEqual(fresh.getAppearance('red', 7), { hair: 'crew', color: '#f0d060', skin: 'very-deep' });

  // Apparence enregistrée avant les teints : teint par défaut.
  const beforeSkin = { ...tactic, board: { ...tactic.board, appearances: { 'red:7': { hair: 'crew', color: '#f0d060' } } } };
  assert.equal(restoreTactic(beforeSkin, fresh, new TacticalSequence()), true);
  assert.deepEqual(fresh.getAppearance('red', 7), { hair: 'crew', color: '#f0d060', skin: 'tan' });

  // Tactique enregistrée avant la personnalisation : tous les joueurs par défaut.
  const { appearances, ...older } = tactic.board;
  assert.ok(appearances);
  assert.equal(restoreTactic({ ...tactic, board: older }, fresh, new TacticalSequence()), true);
  assert.deepEqual(fresh.getAppearance('red', 7), DEFAULT_APPEARANCE);
  assert.equal('appearances' in fresh.snapshot(), false, 'aucune clé sans personnalisation');

  // Apparence corrompue ou joueur inconnu : la tactique est refusée.
  const reference = fresh.snapshot();
  assert.equal(isValidTactic({ ...tactic, board: { ...tactic.board, appearances: { 'red:7': { hair: 'x', color: '#000000' } } } }, reference), false);
  assert.equal(isValidTactic({ ...tactic, board: { ...tactic.board, appearances: { 'red:42': DEFAULT_APPEARANCE } } }, reference), false);
  assert.equal(isValidTactic({ ...tactic, board: { ...tactic.board, appearances: { 'red:7': { ...DEFAULT_APPEARANCE, skin: '#00ff00' } } } }, reference), false, 'pas de teint arbitraire');
});

test('pions : le joueur n\'apparaît que dans le maillage de sa coupe, avec sa couleur', () => {
  const restore = installFakeDocument();
  try {
    const factory = new PlayerFactory();
    const group = createTeam(TEAMS.blue, new TacticsBoard(DEFAULT_FORMATIONS).getFormation('blue'), factory);
    const meshes = factory.createTeamMeshes(TEAMS.blue, group.children);
    const index = group.children.findIndex((player) => player.userData.number === 9);
    assert.equal(meshes.setAppearance(9, { hair: 'curly', color: '#ff0000' }), true);
    meshes.update();
    const hair = meshes.meshes.slice(4, 8);
    const scaleAt = (mesh, at) => {
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(at, matrix);
      return new THREE.Vector3().setFromMatrixScale(matrix).x;
    };
    assert.deepEqual(hair.map((mesh) => scaleAt(mesh, index) > 0), [false, false, true, false]);
    assert.deepEqual(hair.map((mesh) => scaleAt(mesh, index === 0 ? 1 : 0) > 0), [true, false, false, false], 'les autres gardent la coupe classique');
    const color = new THREE.Color();
    hair[2].getColorAt(index, color);
    assert.equal(color.getHex(), 0xff0000);
    assert.equal(meshes.setAppearance(42, DEFAULT_APPEARANCE), false);
  } finally {
    restore();
  }
});

test('teints : du plus clair au plus foncé, peu saturés ; le teint ne touche que la peau du joueur', () => {
  assert.equal(SKIN_TONE_IDS.length >= 7, true);
  const lightness = SKIN_TONES.map(({ color }) => new THREE.Color(color).getHSL({}).l);
  assert.deepEqual([...lightness].sort((a, b) => b - a), lightness, 'du plus clair au plus foncé');
  for (const { color } of SKIN_TONES) {
    const { h, s } = new THREE.Color(color).getHSL({});
    assert.ok(h > 0.03 && h < 0.1 && s < 0.7, `${color} : une vraie couleur de peau`);
  }
  assert.equal(isValidAppearance({ hair: 'classic', color: '#2a1c14', skin: 'deep' }), true);
  assert.equal(isValidAppearance({ hair: 'classic', color: '#2a1c14', skin: 'violet' }), false);

  const restore = installFakeDocument();
  try {
    const factory = new PlayerFactory();
    const group = createTeam(TEAMS.red, new TacticsBoard(DEFAULT_FORMATIONS).getFormation('red'), factory);
    const meshes = factory.createTeamMeshes(TEAMS.red, group.children);
    const index = group.children.findIndex((player) => player.userData.number === 5);
    const other = index === 0 ? 1 : 0;
    meshes.setAppearance(5, { hair: 'crew', color: '#aa0000', skin: 'darkest' });
    const colorAt = (mesh, at) => {
      const color = new THREE.Color();
      mesh.getColorAt(at, color);
      return color.getHexString();
    };
    const skin = meshes.meshes[3];
    assert.equal(colorAt(skin, index), '432a1e');
    assert.equal(colorAt(skin, other), 'c8916c', 'les autres gardent leur teint');
    assert.equal(colorAt(meshes.meshes[5], index), 'aa0000', 'la couleur des cheveux ne change pas');
    assert.equal(meshes.meshes[8].instanceColor, null, 'les chaussures ne prennent pas le teint');
  } finally {
    restore();
  }
});