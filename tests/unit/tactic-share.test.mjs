/**
 * Tests unitaires du lien de partage d'une tactique : src/tactic-share.mjs. Aller-retour complet
 * par CompressionStream, adresse construite sans paramètres, sous-chemin gardé, liens refusés
 * (version inconnue, base64url invalide, contenu abîmé, bombe de décompression, tactique
 * corrompue) et longueur d'un lien de tactique pleine.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TacticsBoard } from '../../src/tactics-board.mjs';
import { TacticalSequence, MAX_KEYFRAMES } from '../../src/tactical-sequence.mjs';
import {
  AddArrowCommand, AddKeyframeCommand, ChangeFormationCommand, CommandHistory, MovePlayerCommand,
} from '../../src/commands.mjs';
import { DEFAULT_FORMATIONS } from '../../src/config.mjs';
import { captureTactic } from '../../src/tactic-storage.mjs';
import { TACTIC_FILE_FORMAT, TACTIC_FILE_VERSION } from '../../src/tactic-file.mjs';
import {
  createShareUrl, decodeSharedTactic, encodeSharedTactic, fromBase64Url, MAX_SHARE_PAYLOAD_LENGTH, readSharePayload,
  SHARE_COMPRESSION, SHARE_HASH_KEY, SHARE_LINK_VERSION, toBase64Url,
} from '../../src/tactic-share.mjs';

/**
 * Tactique modifiée : 3-5-2 pour les Bleus, n° 9 déplacé, une course et `keyframes` images clés.
 * @param {number} [keyframes]
 * @returns {{board: TacticsBoard, sequence: TacticalSequence}}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests unitaires (src/tactic-share.mjs) — montage du test
 */
function createEditedTactic(keyframes = 1) {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const sequence = new TacticalSequence();
  const history = new CommandHistory();
  history.execute(new ChangeFormationCommand({ board, teamId: 'blue', formation: '3-5-2' }));
  history.execute(new AddArrowCommand({ board, arrow: { kind: 'run', from: { x: 0.12, z: -0.05 }, to: { x: 0.2, z: 0.02 } } }));
  for (let index = 0; index < keyframes; index += 1) {
    history.execute(new MovePlayerCommand({ board, teamId: 'blue', number: 9, to: { x: 0.01 * index + 0.0123456789, z: -0.05 } }));
    history.execute(new AddKeyframeCommand({ sequence, board }));
  }
  return { board, sequence };
}

/**
 * Compresse un texte comme le ferait un lien, pour fabriquer des liens piégés.
 * @param {string} text
 * @returns {Promise<string>} contenu base64url, sans la version
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests unitaires (src/tactic-share.mjs) — fabrication de liens
 */
async function deflateToBase64Url(text) {
  const stream = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream(SHARE_COMPRESSION));
  return toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

test('aller-retour : le lien rend exactement la tactique et sa séquence, au chiffre près', async () => {
  const { board, sequence } = createEditedTactic(3);
  const tactic = captureTactic(board, sequence);
  const payload = await encodeSharedTactic({ name: '  Pressing   haut ', tactic });
  assert.match(payload, new RegExp(`^${SHARE_LINK_VERSION}\\.[A-Za-z0-9_-]+$`));
  const decoded = await decodeSharedTactic(payload, new TacticsBoard(DEFAULT_FORMATIONS).snapshot());
  assert.equal(decoded.ok, true);
  assert.equal(decoded.name, 'Pressing haut');
  // JSON écrit -0 comme 0, comme pour un fichier exporté : la comparaison passe par JSON.
  assert.deepEqual(decoded.tactic, JSON.parse(JSON.stringify(tactic)));
});

test('adresse : sous-chemin gardé, paramètres et ancien fragment retirés ; lecture du fragment', () => {
  const link = createShareUrl('https://example.test/footballsimulator/index.html?debug&iwer#ancien', '1.abc_-');
  assert.equal(link, `https://example.test/footballsimulator/index.html#${SHARE_HASH_KEY}=1.abc_-`);
  assert.equal(readSharePayload(new URL(link).hash), '1.abc_-');
  assert.equal(readSharePayload('tactique=1.xyz'), '1.xyz');
  assert.equal(readSharePayload('#autre=1'), null);
  assert.equal(readSharePayload(''), null);
  assert.equal(readSharePayload(undefined), null);
});

test('base64url : aller-retour de tous les octets ; caractère étranger ou longueur impossible refusés', () => {
  const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
  const text = toBase64Url(bytes);
  assert.match(text, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(fromBase64Url(text), bytes);
  assert.equal(fromBase64Url('ab+c'), null);
  assert.equal(fromBase64Url('abcde'), null);
  assert.equal(fromBase64Url(42), null);
});

test('liens refusés : version inconnue ou plus récente, contenu abîmé, trop long, sans message pour l\'utilisateur perdu', async () => {
  const reference = new TacticsBoard(DEFAULT_FORMATIONS).snapshot();
  const { board, sequence } = createEditedTactic();
  const payload = await encodeSharedTactic({ name: 'Bloc bas', tactic: captureTactic(board, sequence) });
  const cases = {
    plusRecent: `${SHARE_LINK_VERSION + 1}.${payload.split('.')[1]}`,
    sansVersion: payload.split('.')[1],
    tronque: payload.slice(0, Math.floor(payload.length / 2)),
    caractere: `${payload}!`,
    vide: '1.',
    tropLong: `1.${'A'.repeat(MAX_SHARE_PAYLOAD_LENGTH)}`,
  };
  for (const [label, value] of Object.entries(cases)) {
    const result = await decodeSharedTactic(value, reference);
    assert.equal(result.ok, false, label);
    assert.ok(result.error.length > 10, label);
  }
  assert.match((await decodeSharedTactic(cases.plusRecent, reference)).error, /plus récente/);
});

test('bombe de décompression : un petit lien qui se déplie au-delà de la taille d\'un fichier de tactique est refusé', async () => {
  const huge = JSON.stringify({ format: TACTIC_FILE_FORMAT, version: TACTIC_FILE_VERSION, name: 'x', tactic: { pad: ' '.repeat(2 * 1024 * 1024) } });
  const payload = `${SHARE_LINK_VERSION}.${await deflateToBase64Url(huge)}`;
  assert.ok(payload.length < MAX_SHARE_PAYLOAD_LENGTH, 'le lien piégé est court');
  const result = await decodeSharedTactic(payload, new TacticsBoard(DEFAULT_FORMATIONS).snapshot());
  assert.equal(result.ok, false);
});

test('tactique corrompue ou d\'un autre format dans un lien bien formé : refusée par les vérifications d\'un fichier', async () => {
  const reference = new TacticsBoard(DEFAULT_FORMATIONS).snapshot();
  const { board, sequence } = createEditedTactic();
  const tactic = captureTactic(board, sequence);
  tactic.board.players['blue:9'] = { x: 99, z: 0 };
  const corrupted = `${SHARE_LINK_VERSION}.${await deflateToBase64Url(JSON.stringify({ format: TACTIC_FILE_FORMAT, version: 1, name: 'x', tactic }))}`;
  assert.match((await decodeSharedTactic(corrupted, reference)).error, /^Lien de partage refusé\. Tactique incomplète/);
  const other = `${SHARE_LINK_VERSION}.${await deflateToBase64Url(JSON.stringify({ hello: 'world' }))}`;
  assert.equal((await decodeSharedTactic(other, reference)).ok, false);
  const notUtf8 = `${SHARE_LINK_VERSION}.${await (async () => {
    const stream = new Blob([Uint8Array.of(0xff, 0xfe, 0xfd)]).stream().pipeThrough(new CompressionStream(SHARE_COMPRESSION));
    return toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
  })()}`;
  assert.equal((await decodeSharedTactic(notUtf8, reference)).ok, false);
});

test('une tactique pleine (12 images clés) tient dans un lien de quelques milliers de caractères', async () => {
  const { board, sequence } = createEditedTactic(MAX_KEYFRAMES);
  const payload = await encodeSharedTactic({ name: 'Séquence complète', tactic: captureTactic(board, sequence) });
  assert.ok(payload.length < 12000, `${payload.length} caractères`);
  assert.equal((await decodeSharedTactic(payload, new TacticsBoard(DEFAULT_FORMATIONS).snapshot())).ok, true);
});
