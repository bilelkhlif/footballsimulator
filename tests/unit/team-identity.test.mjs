/**
 * Tests unitaires de l'identité des équipes : couleurs et daltonisme (src/team-colors.mjs), nom et
 * maillot dans le tableau tactique (setIdentity, ChangeTeamIdentityCommand, instantanés,
 * sauvegarde), noms dans les textes (src/team-identity.mjs), et maillots des pions
 * (TeamMeshes.setKitColors, src/team-kits-view.mjs).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  checkKitContrast, goalkeeperKit, KIT_PALETTE, MIN_KIT_DELTA_E, MIN_PITCH_DELTA_E, simulateVision, toLab, toLinearRgb, VISIONS, worstDeltaE,
} from '../../src/team-colors.mjs';
import { TacticsBoard } from '../../src/tactics-board.mjs';
import { ChangeTeamIdentityCommand, CommandHistory, MovePlayerCommand } from '../../src/commands.mjs';
import { followTeamNames, teamFor, teamName, teamOf } from '../../src/team-identity.mjs';
import { followTeamKits, labelInk } from '../../src/team-kits-view.mjs';
import { captureTactic, isValidTactic } from '../../src/tactic-storage.mjs';
import { TacticalSequence } from '../../src/tactical-sequence.mjs';
import { PlayerFactory } from '../../src/players.mjs';
import { createTeam } from '../../src/team.mjs';
import { DEFAULT_FORMATIONS, SCENE_COLORS, TEAMS } from '../../src/config.mjs';
import { installFakeDocument } from './tactical-fixtures.mjs';

test('couleurs : un gris reste gris pour tous ; le blanc a une clarté de 100', () => {
  const grey = toLinearRgb(0x808080);
  for (const vision of VISIONS) {
    const [r, g, b] = simulateVision(grey, vision);
    assert.ok(Math.abs(r - g) < 0.01 && Math.abs(g - b) < 0.01, vision);
  }
  const [l, a, b] = toLab(toLinearRgb('#ffffff'));
  assert.ok(Math.abs(l - 100) < 0.01 && Math.abs(a) < 0.01 && Math.abs(b) < 0.01);
});

test('contraste : bleu contre rouge accepté ; bleu contre violet refusé, avec la vision en cause', () => {
  assert.deepEqual(checkKitContrast('bleu', 'rouge'), { ok: true });
  const refused = checkKitContrast('bleu', 'violet');
  assert.equal(refused.ok, false);
  assert.equal(refused.against, 'opponent');
  assert.ok(refused.deltaE < MIN_KIT_DELTA_E);
  assert.ok(VISIONS.includes(refused.vision));
  assert.match(refused.message, /^Maillots trop proches pour une personne en /);
});

test('contraste : un maillot vert se fond dans le gazon (deutéranopie) ; le rouge reste permis', () => {
  const green = checkKitContrast('vert', 'bleu');
  assert.equal(green.ok, false);
  assert.equal(green.against, 'pitch');
  assert.equal(green.vision, 'deutéranopie');
  assert.ok(worstDeltaE(KIT_PALETTE.rouge.hex, SCENE_COLORS.grassLight).deltaE >= MIN_PITCH_DELTA_E);
});

test('gardiens : pour chaque paire de maillots permise, deux gardiens distincts des équipes, du gazon et entre eux', () => {
  const kits = Object.keys(KIT_PALETTE);
  let pairs = 0;
  for (const a of kits) {
    for (const b of kits) {
      if (a === b || !checkKitContrast(a, b).ok || !checkKitContrast(b, a).ok) continue;
      pairs += 1;
      const keeperA = goalkeeperKit(a, b);
      const keeperB = goalkeeperKit(b, a, [keeperA]);
      assert.ok(![a, b, keeperA].includes(keeperB) && ![a, b].includes(keeperA), `${a}/${b}`);
    }
  }
  assert.ok(pairs > 40, `${pairs} paires permises`);
});

test('tableau : nom et maillot validés ; gardien distinct ; refus expliqués', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  assert.deepEqual(
    [board.getIdentity('blue').name, board.getIdentity('blue').kit, board.getIdentity('red').kit],
    ['Bleus', 'bleu', 'rouge'],
  );
  assert.notEqual(board.getIdentity('blue').goalkeeperKit, board.getIdentity('red').goalkeeperKit);
  const events = [];
  board.on('identitychange', ({ teamId }) => events.push(teamId));
  assert.equal(board.setIdentity('blue', { name: '  CS   Sfaxien ', kit: 'noir' }), true);
  assert.deepEqual([board.getIdentity('blue').name, board.getIdentity('blue').kit], ['CS Sfaxien', 'noir']);
  assert.deepEqual(events, ['blue']);
  assert.equal(board.setIdentity('blue', { name: 'CS Sfaxien', kit: 'noir' }), false, 'rien ne change');
  assert.throws(() => board.setIdentity('red', { name: 'cs sfaxien', kit: 'rouge' }), /noms différents/);
  assert.throws(() => board.setIdentity('red', { name: 'Espérance', kit: 'bordeaux' }), /trop proches/, 'bordeaux contre noir');
  assert.throws(() => board.setIdentity('red', { name: '', kit: 'rouge' }), /Nom d’équipe invalide/);
  assert.throws(() => board.setIdentity('red', { name: 'Espérance', kit: 'mauve' }), /Maillot inconnu/);
});

test('ChangeTeamIdentityCommand : annulable ; refus sans effet sur le tableau ni l\'historique', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const history = new CommandHistory();
  history.execute(new ChangeTeamIdentityCommand({ board, teamId: 'red', name: 'Espérance', kit: 'jaune' }));
  assert.equal(board.getIdentity('red').name, 'Espérance');
  history.undo();
  assert.deepEqual([board.getIdentity('red').name, board.getIdentity('red').kit], ['Rouges', 'rouge']);
  assert.throws(() => history.execute(new ChangeTeamIdentityCommand({ board, teamId: 'red', name: 'X', kit: 'violet' })), /trop proches/);
  assert.equal(history.canUndo, false);
});

test('instantanés, réinitialisation et sauvegarde des identités', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  board.setIdentity('red', { name: 'Espérance', kit: 'jaune' });
  const snapshot = board.snapshot();
  const other = new TacticsBoard(DEFAULT_FORMATIONS);
  other.restore(snapshot);
  assert.equal(other.getIdentity('red').name, 'Espérance');
  const legacy = structuredClone(snapshot);
  delete legacy.identities;
  other.restore(legacy);
  assert.equal(other.getIdentity('red').name, 'Rouges', 'tactique plus ancienne : identités de départ');
  assert.equal(board.reset(), true);
  assert.equal(board.getIdentity('red').name, 'Rouges');

  board.setIdentity('red', { name: 'Espérance', kit: 'jaune' });
  const data = captureTactic(board, new TacticalSequence());
  const reference = new TacticsBoard(DEFAULT_FORMATIONS).snapshot();
  assert.equal(isValidTactic(data, reference), true);
  const variant = (red) => ({ ...data, board: { ...data.board, identities: { ...data.board.identities, red } } });
  assert.equal(isValidTactic(variant({ name: 'Espérance', kit: 'violet' }), reference), false, 'maillots trop proches');
  assert.equal(isValidTactic(variant({ name: 'Bleus', kit: 'jaune' }), reference), false, 'même nom');
  assert.equal(isValidTactic(variant({ name: ' ', kit: 'jaune' }), reference), false, 'nom vide');
});

test('textes : noms de départ au pluriel, nom choisi avec la bonne préposition', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const stop = followTeamNames(board);
  try {
    assert.equal(teamOf('blue'), 'des Bleus');
    assert.equal(teamFor('blue'), 'pour les Bleus');
    board.setIdentity('blue', { name: 'Sfax', kit: 'noir' });
    board.setIdentity('red', { name: 'Espérance', kit: 'jaune' });
    assert.equal(teamName('blue'), 'Sfax');
    assert.equal(teamOf('blue'), 'de Sfax');
    assert.equal(teamOf('red'), 'd’Espérance');
    assert.equal(teamFor('red'), 'pour Espérance');
    assert.equal(new MovePlayerCommand({ board, teamId: 'red', number: 9, to: { x: 0, z: 0 } }).label, 'Déplacer le n° 9 d’Espérance');
  } finally {
    stop();
  }
  assert.equal(teamName('blue'), 'Bleus', 'sans suivi : noms de départ');
});

test('maillots des pions : gardien de couleur distincte, numéros lisibles, interface suivie', () => {
  const restore = installFakeDocument();
  try {
    const board = new TacticsBoard(DEFAULT_FORMATIONS);
    const factory = new PlayerFactory();
    const group = createTeam(TEAMS.blue, board.getFormation('blue'), factory);
    const meshes = factory.createTeamMeshes(TEAMS.blue, group.children);
    const properties = {};
    const root = { style: { setProperty: (name, value) => { properties[name] = value; } } };
    const stop = followTeamKits({ board, teamMeshes: { blue: meshes }, playerFactory: factory, root });
    const [base, marker, body] = meshes.meshes;
    const colorOf = (number) => {
      const color = new THREE.Color();
      body.getColorAt(group.children.findIndex((p) => p.userData.number === number), color);
      return color.getHex();
    };
    assert.equal(colorOf(9), KIT_PALETTE.bleu.hex);
    assert.equal(colorOf(1), board.getIdentity('blue').goalkeeperColor);
    assert.notEqual(colorOf(1), colorOf(9));
    assert.equal(marker.instanceColor, null, 'la flèche d\'orientation garde sa couleur');
    assert.ok(base.instanceColor);
    board.setIdentity('blue', { name: 'Bleus', kit: 'blanc' });
    assert.equal(colorOf(9), KIT_PALETTE.blanc.hex);
    assert.equal(properties['--kit-blue'], KIT_PALETTE.blanc.ui);
    stop();
  } finally {
    restore();
  }
  assert.equal(labelInk(KIT_PALETTE.blanc.hex), '#2b2b2b', 'chiffre foncé sur un maillot blanc');
  assert.equal(labelInk(KIT_PALETTE.bleu.hex), '#2f55d4');
});
