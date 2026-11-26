/**
 * Tests unitaires de la sauvegarde automatique de la tactique : src/tactic-storage.mjs.
 * Vérification des données enregistrées, aller-retour par un faux IndexedDB, rétablissement au
 * lancement, enregistrement quand la page est masquée, et absence de toute panne quand le stockage
 * manque, échoue ou contient une donnée invalide.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TacticsBoard } from '../../src/tactics-board.mjs';
import { TacticalSequence, MAX_KEYFRAMES } from '../../src/tactical-sequence.mjs';
import { AddKeyframeCommand, AddArrowCommand, ChangeFormationCommand, CommandHistory, MovePlayerCommand } from '../../src/commands.mjs';
import { DEFAULT_FORMATIONS } from '../../src/config.mjs';
import {
  attachTacticAutosave, captureTactic, createTacticStore, isValidTactic, restoreTactic, TACTIC_FORMAT_VERSION,
} from '../../src/tactic-storage.mjs';

/**
 * Tactique modifiée : formation des Bleus changée, n° 9 déplacé, une course et une image clé.
 * @returns {{board: TacticsBoard, sequence: TacticalSequence}}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests unitaires (src/tactic-storage.mjs) — montage du test
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

/**
 * Faux IndexedDB en mémoire, asynchrone comme le vrai : une base, des magasins, get et put.
 * Les valeurs sont copiées (structuredClone), comme l'algorithme de clonage d'IndexedDB.
 * @param {{failOpen?: boolean}} [options]
 * @returns {{factory: object, data: Map}}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests unitaires (src/tactic-storage.mjs) — doublure d'IndexedDB
 */
function createFakeIndexedDb({ failOpen = false } = {}) {
  const stores = new Map();
  const later = (callback) => setTimeout(callback, 0);
  const db = {
    createObjectStore: (name) => stores.set(name, new Map()),
    transaction(name) {
      const store = stores.get(name);
      const transaction = {
        objectStore: () => ({
          get(key) {
            const request = {};
            later(() => {
              request.result = structuredClone(store.get(key));
              request.onsuccess?.();
            });
            return request;
          },
          put(value, key) {
            store.set(key, structuredClone(value));
            later(() => transaction.oncomplete?.());
          },
        }),
      };
      return transaction;
    },
  };
  const factory = {
    open() {
      const request = {};
      later(() => {
        if (failOpen) {
          request.error = new Error('stockage refusé');
          request.onerror?.();
          return;
        }
        request.result = db;
        if (!stores.size) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
  return { factory, stores };
}

/**
 * Faux document : visibilitychange et visibilityState pilotés par le test.
 * @returns {EventTarget & {visibilityState: string, hide: () => void}}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests unitaires (src/tactic-storage.mjs) — doublure du document
 */
function createFakeDocument() {
  const target = new EventTarget();
  target.visibilityState = 'visible';
  target.hide = () => {
    target.visibilityState = 'hidden';
    target.dispatchEvent(new Event('visibilitychange'));
  };
  return target;
}

test('captureTactic garde formations, places, flèches et images clés, dans un format versionné', () => {
  const { board, sequence } = createEditedTactic();
  const data = captureTactic(board, sequence);
  assert.equal(data.version, TACTIC_FORMAT_VERSION);
  assert.equal(data.board.formations.blue, '3-5-2');
  assert.deepEqual(data.board.players['blue:9'], { x: 0.12, z: -0.05 });
  assert.equal(data.board.arrows.length, 1);
  assert.equal(data.keyframes.length, 1);
  assert.ok(isValidTactic(data, new TacticsBoard(DEFAULT_FORMATIONS).snapshot()));
});

test('restoreTactic rétablit la tactique sur un tableau neuf, sans passer par l\'historique', () => {
  const { board, sequence } = createEditedTactic();
  const data = structuredClone(captureTactic(board, sequence));
  const fresh = new TacticsBoard(DEFAULT_FORMATIONS);
  const freshSequence = new TacticalSequence();
  const events = [];
  fresh.on('change', ({ type }) => events.push(type));
  assert.equal(restoreTactic(data, fresh, freshSequence), true);
  assert.deepEqual(fresh.snapshot(), board.snapshot());
  assert.deepEqual(freshSequence.keyframes, sequence.keyframes);
  assert.deepEqual(events, ['restore']);
  // « Réinitialiser » ramène toujours aux formations de départ, pas à la tactique rétablie.
  assert.equal(fresh.reset(), true);
  assert.equal(fresh.getFormation('blue').name, DEFAULT_FORMATIONS.blue);
});

test('une donnée invalide, ancienne ou étrangère est refusée et laisse le tableau intact', () => {
  const { board, sequence } = createEditedTactic();
  const valid = captureTactic(board, sequence);
  const reference = new TacticsBoard(DEFAULT_FORMATIONS).snapshot();
  /** Copie de la tactique valide, modifiée par `edit`. */
  const variant = (edit) => {
    const data = structuredClone(valid);
    edit(data);
    return data;
  };
  const invalid = {
    null: null,
    'chaîne': 'tactique',
    'version inconnue': variant((data) => { data.version = TACTIC_FORMAT_VERSION + 1; }),
    'formation inconnue': variant((data) => { data.board.formations.blue = '2-3-5'; }),
    'équipe en trop': variant((data) => { data.board.formations.green = '4-4-2'; }),
    'joueur manquant': variant((data) => { delete data.board.players['red:1']; }),
    'joueur inconnu': variant((data) => { data.board.players['blue:99'] = { x: 0, z: 0 }; }),
    'joueur hors du plateau': variant((data) => { data.board.players['blue:9'] = { x: 5, z: 0 }; }),
    'coordonnée non numérique': variant((data) => { data.board.players['blue:9'] = { x: 'NaN', z: 0 }; }),
    'ballon hors du plateau': variant((data) => { data.board.ball = { x: 0, z: 9 }; }),
    'flèche de type inconnu': variant((data) => { data.board.arrows[0].kind = 'shot'; }),
    'flèche hors du terrain': variant((data) => { data.board.arrows[0].to = { x: 2, z: 0 }; }),
    'flèche trop courte': variant((data) => { data.board.arrows[0].to = { ...data.board.arrows[0].from }; }),
    'identifiants de flèche en double': variant((data) => { data.board.arrows.push({ ...data.board.arrows[0], to: { x: 0, z: 0 } }); }),
    'phase inconnue': variant((data) => { data.board.phases.blue = 'pressing'; }),
    "phase d'une équipe manquante": variant((data) => { delete data.board.phases.red; }),
    'images clés absentes': variant((data) => { delete data.keyframes; }),
    'trop d\'images clés': variant((data) => { data.keyframes = Array(MAX_KEYFRAMES + 1).fill(data.keyframes[0]); }),
    'image clé incomplète': variant((data) => { delete data.keyframes[0].players['blue:1']; }),
  };
  for (const [name, data] of Object.entries(invalid)) {
    assert.equal(isValidTactic(data, reference), false, name);
    const fresh = new TacticsBoard(DEFAULT_FORMATIONS);
    const before = fresh.snapshot();
    assert.equal(restoreTactic(data, fresh, new TacticalSequence()), false, name);
    assert.deepEqual(fresh.snapshot(), before, name);
  }
});

test('aller-retour par IndexedDB : enregistrée à un lancement, la tactique est rétablie au suivant', async () => {
  const { factory } = createFakeIndexedDb();
  const first = createEditedTactic();
  const store = createTacticStore(factory);
  assert.equal(await store.save(captureTactic(first.board, first.sequence)), true);

  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const sequence = new TacticalSequence();
  const autosave = await attachTacticAutosave({ board, sequence, store: createTacticStore(factory), target: createFakeDocument() });
  assert.equal(autosave.restored, true);
  assert.deepEqual(board.snapshot(), first.board.snapshot());
  assert.equal(sequence.length, 1);
});

test('premier lancement : rien d\'enregistré, la tactique par défaut reste en place', async () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const before = board.snapshot();
  const autosave = await attachTacticAutosave({
    board, sequence: new TacticalSequence(), store: createTacticStore(createFakeIndexedDb().factory), target: createFakeDocument(),
  });
  assert.equal(autosave.restored, false);
  assert.deepEqual(board.snapshot(), before);
});

test('la page masquée enregistre la tactique, seulement si elle a changé', async () => {
  const saved = [];
  const store = { load: async () => null, save: async (data) => { saved.push(data); return true; } };
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const sequence = new TacticalSequence();
  const target = createFakeDocument();
  const autosave = await attachTacticAutosave({ board, sequence, store, target });

  target.hide();
  assert.equal(saved.length, 0, 'rien de changé : aucune écriture');

  board.setBallPosition({ x: 0.05, z: 0.02 });
  target.visibilityState = 'visible';
  target.dispatchEvent(new Event('visibilitychange'));
  assert.equal(saved.length, 0, 'page de nouveau visible : aucune écriture');

  target.hide();
  await Promise.resolve();
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].board.ball, { x: 0.05, z: 0.02 });

  target.hide();
  await Promise.resolve();
  assert.equal(saved.length, 1, 'déjà enregistrée : pas de nouvelle écriture');

  sequence.add({ players: board.snapshot().players, ball: board.getBallPosition() });
  autosave.detach();
  target.hide();
  await Promise.resolve();
  assert.equal(saved.length, 1, 'après detach, plus aucune écriture');
});

test('chaque changement est enregistré peu après, une seule fois pour une suite rapide de changements', async () => {
  const saved = [];
  const pending = new Map();
  let nextId = 1;
  const timers = {
    setTimer: (callback, delay) => { pending.set(nextId, { callback, delay }); return nextId++; },
    clearTimer: (id) => pending.delete(id),
  };
  /** Déclenche les minuteries en attente, comme si leur délai était écoulé. */
  const elapse = async () => {
    const due = [...pending.values()];
    pending.clear();
    due.forEach(({ callback }) => callback());
    await Promise.resolve();
  };
  const store = { load: async () => null, save: async (data) => { saved.push(data); return true; } };
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const sequence = new TacticalSequence();
  const autosave = await attachTacticAutosave({ board, sequence, store, target: createFakeDocument(), saveDelayMs: 400, timers });

  board.setBallPosition({ x: 0.05, z: 0 });
  board.setBallPosition({ x: 0.06, z: 0 });
  board.setPlayerPosition('blue', 9, { x: 0.1, z: 0 });
  assert.equal(saved.length, 0, 'rien avant le délai');
  assert.equal(pending.size, 1, 'une seule minuterie, repoussée à chaque changement');
  assert.equal([...pending.values()][0].delay, 400);
  await elapse();
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].board.ball, { x: 0.06, z: 0 });
  assert.deepEqual(saved[0].board.players['blue:9'], { x: 0.1, z: 0 });

  sequence.add({ players: board.snapshot().players, ball: board.getBallPosition() });
  await elapse();
  assert.equal(saved.length, 2, 'une image clé ajoutée est aussi enregistrée');
  assert.equal(saved[1].keyframes.length, 1);

  board.setBallPosition({ x: 0, z: 0 });
  autosave.detach();
  assert.equal(pending.size, 0, "detach annule l'enregistrement en attente");
});

test('une écriture refusée (quota) est retentée au prochain masquage', async () => {
  let accept = false;
  let writes = 0;
  const store = { load: async () => null, save: async () => { writes += 1; return accept; } };
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const autosave = await attachTacticAutosave({ board, sequence: new TacticalSequence(), store, target: createFakeDocument() });
  board.setBallPosition({ x: 0.05, z: 0 });
  assert.equal(await autosave.save(), false);
  accept = true;
  assert.equal(await autosave.save(), true);
  assert.equal(await autosave.save(), false, 'plus rien à enregistrer');
  assert.equal(writes, 2);
});

test('sans IndexedDB, ou si son ouverture échoue, l\'application démarre et ne plante pas', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const factory of [null, undefined, createFakeIndexedDb({ failOpen: true }).factory]) {
      const store = createTacticStore(factory);
      assert.equal(await store.load(), null);
      assert.equal(await store.save({ version: TACTIC_FORMAT_VERSION }), false);
      const board = new TacticsBoard(DEFAULT_FORMATIONS);
      const autosave = await attachTacticAutosave({ board, sequence: new TacticalSequence(), store, target: createFakeDocument() });
      assert.equal(autosave.restored, false);
    }
  } finally {
    console.warn = warn;
  }
});

test('un IndexedDB qui ne répond pas ne bloque pas le lancement au-delà du délai', async () => {
  const store = { load: () => new Promise(() => {}), save: async () => true };
  const startedAt = Date.now();
  const autosave = await attachTacticAutosave({
    board: new TacticsBoard(DEFAULT_FORMATIONS), sequence: new TacticalSequence(), store, target: createFakeDocument(), timeoutMs: 20,
  });
  assert.equal(autosave.restored, false);
  assert.ok(Date.now() - startedAt < 1000);
});
