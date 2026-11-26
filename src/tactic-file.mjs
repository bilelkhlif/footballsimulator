/**
 * Fichier JSON d'une tactique (phase 5) : export et import d'une tactique avec sa séquence, pour la
 * passer d'un appareil à l'autre ou la garder hors de l'application.
 *
 * Format du fichier (`.json`, UTF-8) :
 *
 *   {
 *     "format": "football-simulator/tactique",
 *     "version": 1,
 *     "name": "Pressing haut",
 *     "exportedAt": "2026-11-26T04:35:00.000Z",
 *     "tactic": { "version": 1, "board": { … }, "keyframes": [ … ] }
 *   }
 *
 * `tactic` est exactement la tactique de la sauvegarde automatique et des tactiques enregistrées
 * (captureTactic, src/tactic-storage.mjs) : formations, phases, places des joueurs et du ballon,
 * flèches, marquages, noms et maillots des équipes, apparence des joueurs personnalisés (coupe et
 * couleur des cheveux) et images clés de la séquence.
 *
 * Un fichier importé n'est jamais cru sur parole : JSON lisible, format et version reconnus, puis
 * tactique vérifiée par isValidTactic contre le tableau en cours, avant toute modification du
 * tableau ou du stockage. La tactique gardée est reconstruite champ par champ : un champ inconnu du
 * fichier n'entre ni dans le tableau ni dans le stockage. Ce module ne touche ni au document ni au
 * stockage : le panneau (src/saved-tactics-panel.mjs) s'en charge.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { isValidTactic, TACTIC_FORMAT_VERSION } from './tactic-storage.mjs';
import { MAX_TACTIC_NAME_LENGTH, normalizeTacticName } from './tactic-library.mjs';

/** Identifiant du format, écrit dans chaque fichier exporté. */
export const TACTIC_FILE_FORMAT = 'football-simulator/tactique';

/** Version du format de fichier : à incrémenter si sa forme change. */
export const TACTIC_FILE_VERSION = 1;

/** Taille maximale d'un fichier importé, en octets : une tactique pleine pèse quelques dizaines de Ko. */
export const MAX_TACTIC_FILE_BYTES = 512 * 1024;

/** Nom donné à une tactique importée dont le fichier n'a pas de nom utilisable. */
export const DEFAULT_IMPORTED_NAME = 'Tactique importée';

/**
 * Vrai si la valeur est un objet simple (ni null, ni tableau).
 * @param {unknown} value
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Persistance — fichier JSON d'une tactique
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Copie d'un point du terrain, sans autre champ que x et z.
 * @param {{x: number, z: number}} point
 * @returns {{x: number, z: number}}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Persistance — fichier JSON d'une tactique
 */
function copyPoint({ x, z }) {
  return { x, z };
}

/**
 * Copie des places indexées par « équipe:numéro ».
 * @param {Record<string, {x: number, z: number}>} players
 * @returns {Record<string, {x: number, z: number}>}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Persistance — fichier JSON d'une tactique
 */
function copyPlayers(players) {
  return Object.fromEntries(Object.entries(players).map(([key, point]) => [key, copyPoint(point)]));
}

/**
 * Reconstruit une tactique déjà vérifiée (isValidTactic) avec ses seuls champs connus. Les champs
 * facultatifs absents (phases, marquages, identités, apparences d'un fichier plus ancien) restent absents : le
 * tableau leur donne alors leur valeur de départ.
 * @param {{version: number, board: object, keyframes: object[]}} tactic
 * @returns {{version: number, board: object, keyframes: object[]}}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Persistance — fichier JSON d'une tactique
 */
function rebuildTactic({ board, keyframes }) {
  const clean = {
    formations: { ...board.formations },
    players: copyPlayers(board.players),
    ball: copyPoint(board.ball),
    arrows: board.arrows.map(({ id, kind, from, to }) => ({ id, kind, from: copyPoint(from), to: copyPoint(to) })),
  };
  if (board.phases !== undefined) {
    clean.phases = { ...board.phases };
  }
  if (board.markings !== undefined) {
    clean.markings = board.markings.map(([defender, attacker]) => [defender, attacker]);
  }
  if (board.appearances !== undefined) {
    clean.appearances = Object.fromEntries(Object.entries(board.appearances)
      .map(([key, { hair, color, skin }]) => [key, skin === undefined ? { hair, color } : { hair, color, skin }]));
  }
  if (board.identities !== undefined) {
    clean.identities = Object.fromEntries(Object.entries(board.identities).map(([teamId, { name, kit }]) => [teamId, { name, kit }]));
  }
  return {
    version: TACTIC_FORMAT_VERSION,
    board: clean,
    keyframes: keyframes.map(({ players, ball }) => ({ players: copyPlayers(players), ball: copyPoint(ball) })),
  };
}

/**
 * Contenu d'un fichier exporté.
 * @param {{name: string, tactic: object, exportedAt?: Date}} options tactic : captureTactic, ou une
 *   tactique enregistrée
 * @returns {{format: string, version: number, name: string, exportedAt: string, tactic: object}}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Persistance — fichier JSON d'une tactique
 */
export function createTacticFile({ name, tactic, exportedAt = new Date() }) {
  return {
    format: TACTIC_FILE_FORMAT,
    version: TACTIC_FILE_VERSION,
    name: normalizeTacticName(name) || DEFAULT_IMPORTED_NAME,
    exportedAt: exportedAt.toISOString(),
    tactic,
  };
}

/**
 * Texte JSON d'un fichier exporté, indenté pour rester lisible.
 * @param {ReturnType<typeof createTacticFile>} file
 * @returns {string}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Persistance — fichier JSON d'une tactique
 */
export function serializeTacticFile(file) {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * Nom du fichier téléchargé : « tactique-pressing-haut.json », sans accents ni caractères
 * qu'un système de fichiers refuserait.
 * @param {string} name nom de la tactique
 * @returns {string}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Persistance — fichier JSON d'une tactique
 */
export function tacticFileName(name) {
  const slug = normalizeTacticName(name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `tactique-${slug || 'sans-nom'}.json`;
}

/**
 * Lit et vérifie le texte d'un fichier importé, contre le tableau en cours. Aucune exception : un
 * fichier refusé rend un message pour l'utilisateur.
 * @param {string} text contenu du fichier
 * @param {{formations: object, players: object}} reference instantané du tableau en cours
 * @returns {{ok: true, name: string, tactic: object}|{ok: false, error: string}}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Persistance — fichier JSON d'une tactique
 */
export function parseTacticFile(text, reference) {
  if (typeof text !== 'string' || text.length > MAX_TACTIC_FILE_BYTES) {
    return { ok: false, error: 'Fichier trop volumineux pour une tactique.' };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Ce fichier n’est pas un JSON lisible.' };
  }
  if (!isRecord(data) || data.format !== TACTIC_FILE_FORMAT) {
    return { ok: false, error: 'Ce fichier JSON n’est pas une tactique de Football Simulator.' };
  }
  if (!Number.isInteger(data.version) || data.version < 1) {
    return { ok: false, error: 'Version du fichier de tactique illisible.' };
  }
  if (data.version > TACTIC_FILE_VERSION) {
    return { ok: false, error: 'Tactique créée par une version plus récente de l’application : mettez-la à jour.' };
  }
  if (!isValidTactic(data.tactic, reference)) {
    return { ok: false, error: 'Tactique incomplète ou corrompue : rien n’a été modifié.' };
  }
  return { ok: true, name: normalizeTacticName(data.name) || DEFAULT_IMPORTED_NAME, tactic: rebuildTactic(data.tactic) };
}

/**
 * Nom libre pour une tactique importée : le nom du fichier s'il n'est pas pris, sinon
 * « Nom (2) », « Nom (3) »…, sans tenir compte de la casse et sans dépasser la longueur maximale.
 * Une tactique déjà enregistrée n'est donc jamais remplacée par un import.
 * @param {string} name nom lu dans le fichier
 * @param {string[]} takenNames noms des tactiques déjà enregistrées
 * @returns {string}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Persistance — fichier JSON d'une tactique
 */
export function uniqueTacticName(name, takenNames) {
  const base = normalizeTacticName(name) || DEFAULT_IMPORTED_NAME;
  const taken = new Set(takenNames.map((other) => other.toLocaleLowerCase('fr')));
  if (!taken.has(base.toLocaleLowerCase('fr'))) {
    return base;
  }
  for (let index = 2; ; index += 1) {
    const suffix = ` (${index})`;
    const candidate = `${base.slice(0, MAX_TACTIC_NAME_LENGTH - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(candidate.toLocaleLowerCase('fr'))) {
      return candidate;
    }
  }
}