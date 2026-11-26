/**
 * Tests unitaires du fichier JSON d'une tactique : src/tactic-file.mjs. Aller-retour complet avec
 * la séquence, fichiers refusés (JSON illisible, autre format, version plus récente, tactique
 * corrompue), champs inconnus écartés et noms libres pour ne jamais remplacer une tactique.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TacticsBoard } from '../../src/tactics-board.mjs';
import { TacticalSequence } from '../../src/tactical-sequence.mjs';
import {
  AddArrowCommand, AddKeyframeCommand, ChangeFormationCommand, CommandHistory, MovePlayerCommand,
} from '../../src/commands.mjs';
import { DEFAULT_FORMATIONS } from '../../src/config.mjs';
import { captureTactic, restoreTactic } from '../../src/tactic-storage.mjs';
import {
  createTacticFile, parseTacticFile, serializeTacticFile, TACTIC_FILE_FORMAT, TACTIC_FILE_VERSION, tacticFileName, uniqueTacticName,
} from '../../src/tactic-file.mjs';

/**
 * Tactique modifiée : 3-5-2 pour les Bleus, n° 9 déplacé, une course et une image clé.
 * @returns {{board: TacticsBoard, sequence: TacticalSequence}}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Tests unitaires (src/tactic-file.mjs) — montage du test
 */
function createEditedTactic() {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const sequence = new TacticalSequence();
  const history = new CommandHistory();
  history.execute(new ChangeFormationCommand({ board, teamId: 'blue', formation: '3-5-2' }));
  history.execute(new MovePlayerCommand({ board, teamId: 'blue', number: 9, to: { x: 0.12, z: -0.05 } }));
  history.execute(new AddArrowCommand({ board, arrow: { kind: 'run', from: { x: 0.12, z: -0.05 }, to: { x: 0.2, z: 0.02 } } }));
  history.execute(new AddKeyframeCommand({ sequence, board }));
  return { board, sequence };
}

test('export puis import : la tactique et sa séquence reviennent à l\'identique', () => {
  const edited = createEditedTactic();
  const file = createTacticFile({ name: 'Pressing haut', tactic: captureTactic(edited.board, edited.sequence), exportedAt: new Date(0) });
  assert.equal(file.format, TACTIC_FILE_FORMAT);
  assert.equal(file.version, TACTIC_FILE_VERSION);
  assert.equal(file.exportedAt, '1970-01-01T00:00:00.000Z');

  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const sequence = new TacticalSequence();
  const parsed = parseTacticFile(serializeTacticFile(file), board.snapshot());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.name, 'Pressing haut');
  assert.equal(restoreTactic(parsed.tactic, board, sequence), true);
  // JSON n'écrit pas -0 : le gardien des Rouges, à z = -0 dans la scène, revient à z = 0 (même
  // place). La comparaison se fait donc avec l'état d'origine passé lui aussi par JSON.
  const throughJson = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(board.snapshot(), throughJson(edited.board.snapshot()));
  assert.deepEqual(sequence.keyframes, throughJson(edited.sequence.keyframes));
});

test('fichiers refusés sans exception, avec un message', () => {
  const reference = new TacticsBoard(DEFAULT_FORMATIONS).snapshot();
  const edited = createEditedTactic();
  const good = createTacticFile({ name: 'A', tactic: captureTactic(edited.board, edited.sequence) });
  const cases = {
    'pas du JSON': '{ cassé',
    'autre format': JSON.stringify({ format: 'autre', version: 1 }),
    'version plus récente': JSON.stringify({ ...good, version: TACTIC_FILE_VERSION + 1 }),
    'tactique corrompue': JSON.stringify({ ...good, tactic: { ...good.tactic, keyframes: 'cassé' } }),
    'champ manquant': JSON.stringify({ ...good, tactic: { version: 1, keyframes: [] } }),
  };
  for (const [label, text] of Object.entries(cases)) {
    const result = parseTacticFile(text, reference);
    assert.equal(result.ok, false, label);
    assert.ok(result.error.length > 0, label);
  }
});

test('champs inconnus du fichier écartés ; nom vide remplacé', () => {
  const edited = createEditedTactic();
  const tactic = captureTactic(edited.board, edited.sequence);
  const text = JSON.stringify({ ...createTacticFile({ name: 'A', tactic }), name: '   ', tactic: { ...tactic, board: { ...tactic.board, intrus: 1 } } });
  const parsed = parseTacticFile(text, new TacticsBoard(DEFAULT_FORMATIONS).snapshot());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.name, 'Tactique importée');
  assert.equal(Object.hasOwn(parsed.tactic.board, 'intrus'), false);
});

test('noms libres et noms de fichier', () => {
  assert.equal(uniqueTacticName('Bloc bas', ['Pressing']), 'Bloc bas');
  assert.equal(uniqueTacticName('Bloc bas', ['bloc BAS', 'Bloc bas (2)']), 'Bloc bas (3)');
  assert.ok(uniqueTacticName('x'.repeat(40), ['x'.repeat(40)]).length <= 40);
  assert.equal(tacticFileName('Pressing haut : 4-3-3 !'), 'tactique-pressing-haut-4-3-3.json');
  assert.equal(tacticFileName('Équipe réserve'), 'tactique-equipe-reserve.json');
});