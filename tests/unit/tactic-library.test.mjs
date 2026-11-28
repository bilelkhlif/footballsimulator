/**
 * Tests unitaires des tactiques enregistrées : src/tactic-library.mjs et LoadSavedTacticCommand.
 * Enregistrement sous un nom, liste, aller-retour complet, refus d'un nom déjà pris, d'un nom vide
 * et d'une bibliothèque pleine, données invalides écartées, et aucune écriture après une lecture
 * échouée.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TacticsBoard } from '../../src/tactics-board.mjs';
import { TacticalSequence } from '../../src/tactical-sequence.mjs';
import {
  AddArrowCommand, AddKeyframeCommand, ChangeFormationCommand, CommandHistory, LoadSavedTacticCommand, MovePlayerCommand,
} from '../../src/commands.mjs';
import { DEFAULT_FORMATIONS } from '../../src/config.mjs';
import { captureTactic, isValidTactic, TACTIC_KEY } from '../../src/tactic-storage.mjs';
import {
  createTacticLibrary, LIBRARY_FORMAT_VERSION, LIBRARY_KEY, MAX_SAVED_TACTICS, normalizeTacticName, readLibraryEntries, SAVE_ERRORS,
} from '../../src/tactic-library.mjs';

/**
 * Magasin en mémoire, avec la même interface que createTacticStore (load, save, par clé).
 * @param {{failRead?: boolean}} [options] failRead : la lecture stricte échoue
 * @returns {{load: Function, save: Function, data: Map<string, unknown>, writes: number}}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Tests unitaires (src/tactic-library.mjs) — doublure du magasin
 */
function createMemoryStore({ failRead = false } = {}) {
  const data = new Map();
  const store = {
    data,
    writes: 0,
    async load(key = TACTIC_KEY, { strict = false } = {}) {
      if (failRead) {
        if (strict) throw new Error('lecture impossible');
        return null;
      }
      return data.has(key) ? structuredClone(data.get(key)) : null;
    },
    async save(value, key = TACTIC_KEY) {
      store.writes += 1;
      data.set(key, structuredClone(value));
      return true;
    },
  };
  return store;
}

/**
 * Tactique modifiée : 3-5-2 pour les Bleus, n° 9 déplacé, une course et une image clé.
 * @returns {{board: TacticsBoard, sequence: TacticalSequence}}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Tests unitaires (src/tactic-library.mjs) — montage du test
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

test('enregistrer puis rouvrir : la tactique revient complète, annulable, sans toucher à la tactique en cours', async () => {
  const store = createMemoryStore();
  const library = createTacticLibrary(store, { now: () => 1000, createId: () => 'a' });
  const edited = createEditedTactic();
  const result = await library.save('  Pressing   haut ', captureTactic(edited.board, edited.sequence));
  assert.deepEqual(result, { ok: true, entry: { id: 'a', name: 'Pressing haut', savedAt: 1000 } });
  assert.equal(store.data.has(TACTIC_KEY), false, 'la sauvegarde automatique garde sa propre clé');

  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const sequence = new TacticalSequence();
  const before = board.snapshot();
  const saved = await library.get('a');
  assert.ok(isValidTactic(saved.tactic, board.snapshot()));
  const history = new CommandHistory();
  history.execute(new LoadSavedTacticCommand({ board, sequence, name: saved.name, tactic: saved.tactic }));
  assert.deepEqual(board.snapshot(), edited.board.snapshot());
  assert.deepEqual(sequence.keyframes, edited.sequence.keyframes);
  history.undo();
  assert.deepEqual(board.snapshot(), before);
  assert.equal(sequence.keyframes.length, 0);
});

test('liste : la plus récente d\'abord, sans le contenu des tactiques', async () => {
  let time = 0;
  let id = 0;
  const library = createTacticLibrary(createMemoryStore(), { now: () => (time += 10), createId: () => `t${(id += 1)}` });
  const { board, sequence } = createEditedTactic();
  await library.save('Bloc bas', captureTactic(board, sequence));
  await library.save('Contre-attaque', captureTactic(board, sequence));
  assert.deepEqual(await library.list(), {
    ok: true,
    tactics: [{ id: 't2', name: 'Contre-attaque', savedAt: 20 }, { id: 't1', name: 'Bloc bas', savedAt: 10 }],
  });
});

test('refus : nom vide, nom déjà pris (sans tenir compte de la casse), bibliothèque pleine', async () => {
  const store = createMemoryStore();
  let id = 0;
  const library = createTacticLibrary(store, { createId: () => `t${(id += 1)}` });
  const { board, sequence } = createEditedTactic();
  const tactic = captureTactic(board, sequence);
  assert.equal((await library.save('   ', tactic)).reason, SAVE_ERRORS.EMPTY_NAME);
  await library.save('Pressing haut', tactic);
  assert.deepEqual(await library.save('PRESSING HAUT', tactic), { ok: false, reason: SAVE_ERRORS.DUPLICATE, name: 'PRESSING HAUT' });
  assert.equal((await library.list()).tactics.length, 1, 'la première tactique n\'est pas remplacée');
  for (let i = 1; i < MAX_SAVED_TACTICS; i += 1) {
    assert.equal((await library.save(`Tactique ${i}`, tactic)).ok, true);
  }
  assert.equal((await library.save('Une de trop', tactic)).reason, SAVE_ERRORS.FULL);
});

test('stockage illisible : aucune écriture, la bibliothèque existante ne peut pas être écrasée', async () => {
  const store = createMemoryStore({ failRead: true });
  const library = createTacticLibrary(store);
  const { board, sequence } = createEditedTactic();
  assert.deepEqual(await library.list(), { ok: false, tactics: [] });
  assert.equal((await library.save('Bloc bas', captureTactic(board, sequence))).reason, SAVE_ERRORS.STORAGE);
  assert.equal(store.writes, 0);
  assert.equal(await library.get('a'), null);
});

test('données invalides : autre format ignoré, entrées mal formées ou en double écartées', () => {
  const tactic = { version: 1, board: {}, keyframes: [] };
  assert.deepEqual(readLibraryEntries(null), []);
  assert.deepEqual(readLibraryEntries({ version: LIBRARY_FORMAT_VERSION + 1, tactics: [] }), []);
  assert.deepEqual(readLibraryEntries({ version: LIBRARY_FORMAT_VERSION, tactics: 'cassé' }), []);
  const good = { id: 'a', name: 'Bloc bas', savedAt: 1, tactic };
  const entries = readLibraryEntries({
    version: LIBRARY_FORMAT_VERSION,
    tactics: [good, { ...good, id: 'b', name: 'bloc BAS' }, { ...good, id: 'a', name: 'Autre' }, { id: 'c', name: '', savedAt: 1, tactic },
      { id: 'd', name: 'Sans tactique', savedAt: 1 }, 42],
  });
  assert.deepEqual(entries, [good]);
  assert.equal(LIBRARY_KEY !== TACTIC_KEY, true);
  assert.equal(normalizeTacticName(` ${'x'.repeat(60)} `).length, 40);
});
test('renommer : nouveau nom nettoyé, même tactique, même date ; seule la casse du même nom peut changer', async () => {
  const store = createMemoryStore();
  let id = 0;
  const library = createTacticLibrary(store, { now: () => 500, createId: () => `t${(id += 1)}` });
  const { board, sequence } = createEditedTactic();
  const tactic = captureTactic(board, sequence);
  await library.save('Bloc bas', tactic);
  await library.save('Pressing haut', tactic);
  assert.deepEqual(await library.rename('t1', '  Bloc   médian '), { ok: true, entry: { id: 't1', name: 'Bloc médian', savedAt: 500 } });
  assert.deepEqual((await library.get('t1')).tactic, tactic, 'la tactique elle-même ne change pas');
  assert.deepEqual(await library.rename('t1', 'BLOC MÉDIAN'), { ok: true, entry: { id: 't1', name: 'BLOC MÉDIAN', savedAt: 500 } });
  const writes = store.writes;
  assert.deepEqual(await library.rename('t1', 'BLOC MÉDIAN'), { ok: true, entry: { id: 't1', name: 'BLOC MÉDIAN', savedAt: 500 } });
  assert.equal(store.writes, writes, 'un nom inchangé n\'écrit rien');
  assert.deepEqual((await library.list()).tactics.map(({ name }) => name).sort(), ['BLOC MÉDIAN', 'Pressing haut']);
});

test('renommer : refus d\'un nom vide, d\'un nom déjà pris, d\'une tactique absente et d\'un stockage illisible', async () => {
  const store = createMemoryStore();
  let id = 0;
  const library = createTacticLibrary(store, { createId: () => `t${(id += 1)}` });
  const { board, sequence } = createEditedTactic();
  await library.save('Bloc bas', captureTactic(board, sequence));
  await library.save('Pressing haut', captureTactic(board, sequence));
  const writes = store.writes;
  assert.equal((await library.rename('t1', '   ')).reason, SAVE_ERRORS.EMPTY_NAME);
  assert.deepEqual(await library.rename('t1', 'pressing HAUT'), { ok: false, reason: SAVE_ERRORS.DUPLICATE, name: 'pressing HAUT' });
  assert.equal((await library.rename('inconnue', 'Autre')).reason, SAVE_ERRORS.NOT_FOUND);
  assert.equal(store.writes, writes, 'aucun refus n\'écrit dans le stockage');
  const broken = createTacticLibrary(createMemoryStore({ failRead: true }));
  assert.equal((await broken.rename('t1', 'Autre')).reason, SAVE_ERRORS.STORAGE);
});
