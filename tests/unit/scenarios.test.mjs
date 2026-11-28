/**
 * Tests unitaires de la bibliothèque de situations (src/scenarios.mjs) : vérification du format,
 * construction de l'état du tableau et des images clés, chargement annulable (LoadScenarioCommand),
 * chargement de la bibliothèque, et validité de chaque situation livrée dans scenarios/.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildScenarioState, fromRealMeters, loadScenarioLibrary, SCENARIO_FORMAT_VERSION, validateScenario,
} from '../../src/scenarios.mjs';
import { TacticsBoard } from '../../src/tactics-board.mjs';
import { TacticalSequence } from '../../src/tactical-sequence.mjs';
import { CommandHistory, LoadScenarioCommand } from '../../src/commands.mjs';
import { computeTeamTargets } from '../../src/formation-transition.mjs';
import { FORMATIONS } from '../../src/formations.mjs';
import { DEFAULT_FORMATIONS } from '../../src/config.mjs';

/**
 * Situation minimale et valide : passe du n° 6 bleu vers le n° 8, en deux images.
 * @returns {object}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Tests unitaires (situations) — montage du test
 */
function minimalScenario() {
  return {
    version: SCENARIO_FORMAT_VERSION,
    id: 'passe-courte',
    title: 'Passe courte',
    theme: 'Construction',
    description: 'Le n° 6 trouve le n° 8 entre les lignes.',
    formations: { blue: '4-3-3', red: '4-4-2' },
    phases: { blue: 'possession' },
    players: { 'blue:6': [-10, 0] },
    ball: [-10, 1],
    arrows: [{ kind: 'pass', team: 'blue', from: [-10, 1], to: [5, -10] }],
    markings: [['red:6', 'blue:8']],
    keyframes: [{ players: { 'blue:8': [5, -10] }, ball: [5, -10] }],
  };
}

test('une situation minimale est valide', () => {
  assert.deepEqual(validateScenario(minimalScenario()), { ok: true, errors: [] });
});

test('défauts détectés, chacun avec un message', () => {
  /** Copie de la situation minimale, modifiée par `edit`. */
  const variant = (edit) => {
    const data = structuredClone(minimalScenario());
    edit(data);
    return data;
  };
  const cases = {
    'version inconnue': [(d) => { d.version = 2; }, /Version 2 inconnue/],
    'identifiant invalide': [(d) => { d.id = 'Passe Courte'; }, /Identifiant invalide/],
    'titre manquant': [(d) => { d.title = ' '; }, /title/],
    'formation inconnue': [(d) => { d.formations.red = '2-3-5'; }, /Formations inconnues/],
    'phase inconnue': [(d) => { d.phases.blue = 'pressing'; }, /Phase de jeu inconnue/],
    'joueur inconnu': [(d) => { d.players['blue:12'] = [0, 0]; }, /joueur inconnu blue:12/],
    'joueur hors du plateau': [(d) => { d.players['blue:6'] = [70, 0]; }, /blue:6 hors du plateau/],
    'ballon hors du plateau': [(d) => { d.ball = [0, 50]; }, /ballon hors du plateau/],
    'tir à côté du but': [(d) => { d.arrows.push({ kind: 'shot', team: 'blue', from: [40, 0], to: [52.5, 6] }); }, /Flèche 2 \(shot\) : Un tir vise le but/],
    'dribble sans équipe': [(d) => { d.arrows.push({ kind: 'dribble', from: [0, 0], to: [10, 0] }); }, /Un dribble part d’un porteur/],
    'équipe inconnue': [(d) => { d.arrows[0].team = 'green'; }, /équipe inconnue green/],
    'marquage entre partenaires': [(d) => { d.markings.push(['red:5', 'red:9']); }, /Marquage invalide/],
    'deux marquages pour un défenseur': [(d) => { d.markings.push(['red:6', 'blue:10']); }, /Marquage invalide/],
    'trop d\'images clés': [(d) => { d.keyframes = Array(12).fill({ ball: [0, 0] }); }, /au plus 11/],
    'image clé hors du plateau': [(d) => { d.keyframes[0].players['blue:8'] = [0, 60]; }, /Image 2 : blue:8 hors du plateau/],
  };
  for (const [name, [edit, pattern]] of Object.entries(cases)) {
    const verdict = validateScenario(variant(edit));
    assert.equal(verdict.ok, false, name);
    assert.ok(verdict.errors.some((message) => pattern.test(message)), `${name} : ${verdict.errors.join(' | ')}`);
  }
  assert.equal(validateScenario(null).ok, false);
  assert.equal(validateScenario([]).ok, false);
});

test('état construit : joueurs cités à leur place réelle, les autres à celle de leur formation et de leur phase', () => {
  const { board, keyframes } = buildScenarioState(minimalScenario());
  assert.deepEqual(board.players['blue:6'], fromRealMeters([-10, 0]));
  const target = computeTeamTargets(FORMATIONS['4-3-3'], true, 'possession').get(9);
  assert.deepEqual(board.players['blue:9'], { x: target.x, z: target.z }, 'le n° 9 garde sa place en possession');
  assert.deepEqual(board.phases, { blue: 'possession', red: 'base' });
  assert.equal(board.arrows.length, 1);
  assert.deepEqual(board.markings, [['red:6', 'blue:8']]);
  assert.equal(keyframes.length, 2, 'départ, puis une image');
  assert.deepEqual(keyframes[1].players['blue:8'], fromRealMeters([5, -10]));
  assert.deepEqual(keyframes[1].players['blue:6'], keyframes[0].players['blue:6'], 'ce qui n\'est pas cité ne bouge pas');
  assert.deepEqual(keyframes[1].ball, fromRealMeters([5, -10]));
});

test('chargement annulable : tableau et séquence remplacés ; noms des équipes gardés ; annulation exacte', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  board.setIdentity('blue', { name: 'Sfax', kit: 'noir' });
  const sequence = new TacticalSequence();
  const history = new CommandHistory();
  const before = board.snapshot();
  const command = new LoadScenarioCommand({ board, sequence, title: 'Passe courte', state: buildScenarioState(minimalScenario()) });
  assert.equal(command.label, 'Charger la situation « Passe courte »');
  history.execute(command);
  assert.equal(board.getPhase('blue'), 'possession');
  assert.equal(board.getIdentity('blue').name, 'Sfax', 'le nom de l\'entraîneur reste');
  assert.equal(sequence.length, 2);
  history.undo();
  assert.deepEqual(board.snapshot(), before);
  assert.equal(sequence.length, 0);
});

test('bibliothèque : situations valides gardées, fichiers invalides écartés avec leurs erreurs', async () => {
  const files = {
    'https://exemple.test/scenarios/index.json': { scenarios: ['bonne.json', 'mauvaise.json', '../secret.json'] },
    'https://exemple.test/scenarios/bonne.json': minimalScenario(),
    'https://exemple.test/scenarios/mauvaise.json': { ...minimalScenario(), formations: { blue: '9-9-9', red: '4-4-2' } },
  };
  const fakeFetch = async (url) => ({ ok: url in files, json: async () => structuredClone(files[url]) });
  const { scenarios, rejected } = await loadScenarioLibrary(fakeFetch, 'https://exemple.test/scenarios/index.json');
  assert.deepEqual(scenarios.map(({ id }) => id), ['passe-courte']);
  assert.deepEqual(rejected.map(({ file }) => file), ['mauvaise.json', '../secret.json']);
  await assert.rejects(loadScenarioLibrary(fakeFetch, 'https://exemple.test/absent.json'), /Index des situations introuvable/);
});

test('scenarios/ : chaque situation livrée est valide, se construit et a un identifiant unique', () => {
  const index = JSON.parse(readFileSync(new URL('../../scenarios/index.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(index.scenarios));
  const ids = new Set();
  for (const file of index.scenarios) {
    const data = JSON.parse(readFileSync(new URL(`../../scenarios/${file}`, import.meta.url), 'utf8'));
    const verdict = validateScenario(data);
    assert.ok(verdict.ok, `${file} : ${verdict.errors.join(' | ')}`);
    assert.equal(`${data.id}.json`, file, 'le fichier porte l\'identifiant de la situation');
    assert.ok(!ids.has(data.id));
    ids.add(data.id);
    buildScenarioState(data);
  }
});

test('notes de l\'entraîneur dans une situation : propres à chaque image, vérifiées, gardées au chargement', () => {
  const data = { ...minimalScenario(), startNote: 'Le 6 reçoit dos au jeu', keyframes: [{ players: { 'blue:8': [5, -10] }, ball: [5, -10], note: 'Le 8 se retourne' }, { ball: [10, -8] }] };
  assert.ok(validateScenario(data).ok, validateScenario(data).errors.join(' | '));
  const state = buildScenarioState(data);
  assert.deepEqual(state.keyframes.map((keyframe) => keyframe.note ?? null), ['Le 6 reçoit dos au jeu', 'Le 8 se retourne', null]);
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const sequence = new TacticalSequence();
  new CommandHistory().execute(new LoadScenarioCommand({ board, sequence, title: data.title, state }));
  assert.equal(sequence.noteAt(1), 'Le 8 se retourne');
  for (const bad of [{ startNote: '' }, { startNote: '  x ' }, { keyframes: [{ note: 'x'.repeat(200) }] }, { keyframes: [{ note: 3 }] }]) {
    assert.equal(validateScenario({ ...minimalScenario(), ...bad }).ok, false, JSON.stringify(bad).slice(0, 40));
  }
});
