/**
 * Bibliothèque de situations de jeu : des actions toutes prêtes (contre-attaque, relance, pressing,
 * coup de pied arrêté), décrites en JSON, vérifiées, puis chargées sur le tableau par une commande
 * annulable (LoadScenarioCommand).
 *
 * Format d'une situation (version 1), en mètres réels sur le terrain de 105 × 68 m : x le long du
 * terrain depuis le point central, vers le but attaqué par les Bleus ; z en largeur, vers la droite
 * des Bleus (lignes de touche à ±34 m).
 *
 *   { "version": 1, "id": "contre-attaque-trois-passes", "title": "…", "theme": "Transition",
 *     "description": "…",
 *     "formations": { "blue": "4-3-3", "red": "4-4-2" }, "phases": { "blue": "defense", … },
 *     "players": { "blue:6": [-30, 0], … },      joueurs cités ; les autres gardent leur place
 *     "ball": [-30, 1],
 *     "arrows": [{ "kind": "pass", "team": "blue", "from": [-30, 1], "to": [-15, 12] }, …],
 *     "markings": [["red:4", "blue:9"]],
 *     "keyframes": [{ "players": { "blue:10": [-15, 12] }, "ball": [-15, 12] }, …] }
 *
 * Chaque image clé ne cite que ce qui bouge depuis la précédente ; la première image de la séquence
 * est la situation de départ. Depuis la phase 6, une image peut porter une note de l'entraîneur
 * (« note », et « startNote » pour l'image de départ), affichée pendant la lecture. Les flèches respectent les règles des flèches (src/arrow-rules.mjs) :
 * un centre part d'un couloir du dernier tiers, un tir vise le but.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { PITCH_SCALE } from './config.mjs';
import { FORMATIONS, PHASES } from './formations.mjs';
import { MAX_KEYFRAMES, MAX_NOTE_LENGTH, normalizeKeyframeNote } from './tactical-sequence.mjs';
import { ARROW_KINDS, BALL_MARGIN, isOnBoard, PLAYER_MARGIN, TacticsBoard } from './tactics-board.mjs';
import { validateArrow } from './arrow-rules.mjs';

/** Version du format des situations. */
export const SCENARIO_FORMAT_VERSION = 1;

/** Dossier et index de la bibliothèque, relatifs à la page. */
export const SCENARIO_INDEX_URL = 'scenarios/index.json';

/**
 * Point de la maquette à partir de coordonnées réelles [x, z], en mètres.
 * @param {[number, number]} point
 * @returns {{x: number, z: number}}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — bibliothèque de situations
 */
export function fromRealMeters([x, z]) {
  return { x: x * PITCH_SCALE, z: z * PITCH_SCALE };
}

/**
 * Vrai si la valeur est un point réel [x, z] de nombres finis.
 * @param {unknown} point
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — bibliothèque de situations
 */
function isRealPoint(point) {
  return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
}

/**
 * Vérifie une situation : forme, formations, phases, joueurs connus et sur le plateau, flèches
 * conformes aux règles, marquages entre adversaires, images clés. Ne lève jamais d'erreur.
 * @param {unknown} data
 * @returns {{ok: boolean, errors: string[]}}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — bibliothèque de situations
 */
export function validateScenario(data) {
  const errors = [];
  const fail = (message) => errors.push(message);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ok: false, errors: ['La situation n’est pas un objet JSON.'] };
  if (data.version !== SCENARIO_FORMAT_VERSION) fail(`Version ${data.version} inconnue (attendue : ${SCENARIO_FORMAT_VERSION}).`);
  if (typeof data.id !== 'string' || !/^[a-z0-9-]{3,60}$/.test(data.id)) fail('Identifiant invalide : minuscules, chiffres et tirets.');
  for (const key of ['title', 'theme', 'description']) {
    if (typeof data[key] !== 'string' || !data[key].trim()) fail(`Champ « ${key} » manquant.`);
  }
  const teamIds = ['blue', 'red'];
  if (!teamIds.every((teamId) => Object.hasOwn(FORMATIONS, data.formations?.[teamId]))) fail('Formations inconnues ou absentes.');
  if (data.phases !== undefined && !teamIds.every((teamId) => [undefined, ...Object.values(PHASES)].includes(data.phases?.[teamId]))) {
    fail('Phase de jeu inconnue.');
  }
  const playerKeys = teamIds.flatMap((teamId) => Array.from({ length: 11 }, (_, i) => `${teamId}:${i + 1}`));
  /** Vérifie une table de joueurs : clés connues, points réels sur le plateau. */
  const checkPlayers = (players, where) => {
    if (players === undefined) return;
    if (typeof players !== 'object' || players === null || Array.isArray(players)) {
      fail(`${where} : table de joueurs invalide.`);
      return;
    }
    for (const [key, point] of Object.entries(players)) {
      if (!playerKeys.includes(key)) fail(`${where} : joueur inconnu ${key}.`);
      else if (!isRealPoint(point) || !isOnBoard(fromRealMeters(point), PLAYER_MARGIN)) fail(`${where} : ${key} hors du plateau.`);
    }
  };
  /** Vérifie la place du ballon. */
  const checkBall = (ball, where) => {
    if (ball !== undefined && (!isRealPoint(ball) || !isOnBoard(fromRealMeters(ball), BALL_MARGIN))) fail(`${where} : ballon hors du plateau.`);
  };
  /** Vérifie une note d'image clé (phase 6) : facultative, un texte déjà propre et assez court. */
  const checkNote = (note, where) => {
    if (note !== undefined && (typeof note !== 'string' || !note || normalizeKeyframeNote(note) !== note)) {
      fail(`${where} : note invalide (texte de 1 à ${MAX_NOTE_LENGTH} caractères).`);
    }
  };
  checkPlayers(data.players, 'Départ');
  checkBall(data.ball, 'Départ');
  if (data.arrows !== undefined && !Array.isArray(data.arrows)) fail('Flèches : liste attendue.');
  for (const [index, arrow] of (Array.isArray(data.arrows) ? data.arrows : []).entries()) {
    if (!Object.values(ARROW_KINDS).includes(arrow?.kind) || !isRealPoint(arrow?.from) || !isRealPoint(arrow?.to)) {
      fail(`Flèche ${index + 1} : type ou extrémités invalides.`);
      continue;
    }
    // L'équipe qui joue le ballon (« team ») oriente le centre et le tir ; un dribble l'exige.
    if (arrow.team !== undefined && !teamIds.includes(arrow.team)) {
      fail(`Flèche ${index + 1} : équipe inconnue ${arrow.team}.`);
      continue;
    }
    const passer = arrow.team ? { teamId: arrow.team } : null;
    const verdict = validateArrow({ kind: arrow.kind, from: fromRealMeters(arrow.from), to: fromRealMeters(arrow.to) },
      { ball: { x: 0, z: 0 }, players: [], arrows: [] }, { passer });
    if (!verdict.ok) fail(`Flèche ${index + 1} (${arrow.kind}) : ${verdict.message}`);
  }
  if (data.markings !== undefined) {
    const defenders = new Set();
    for (const pair of Array.isArray(data.markings) ? data.markings : [null]) {
      const valid = Array.isArray(pair) && pair.length === 2 && pair.every((key) => playerKeys.includes(key))
        && pair[0].split(':')[0] !== pair[1].split(':')[0] && !defenders.has(pair[0]);
      if (!valid) fail(`Marquage invalide : ${JSON.stringify(pair)}.`);
      else defenders.add(pair[0]);
    }
  }
  if (data.keyframes !== undefined) {
    if (!Array.isArray(data.keyframes) || data.keyframes.length + 1 > MAX_KEYFRAMES) {
      fail(`Images clés : au plus ${MAX_KEYFRAMES - 1} après le départ.`);
    } else {
      data.keyframes.forEach((keyframe, index) => {
        checkPlayers(keyframe?.players, `Image ${index + 2}`);
        checkBall(keyframe?.ball, `Image ${index + 2}`);
        checkNote(keyframe?.note, `Image ${index + 2}`);
      });
    }
  }
  checkNote(data.startNote, 'Départ');
  return { ok: errors.length === 0, errors };
}

/**
 * État du tableau et images clés décrits par une situation valide : les joueurs non cités prennent
 * la place de leur formation, dans leur phase de jeu.
 * @param {object} data situation validée
 * @returns {{board: ReturnType<TacticsBoard['snapshot']>, keyframes: Array<{players: object, ball: object}>}}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — bibliothèque de situations
 */
export function buildScenarioState(data) {
  const board = new TacticsBoard({ blue: data.formations.blue, red: data.formations.red });
  for (const [teamId, phase] of Object.entries(data.phases ?? {})) board.setPhase(teamId, phase);
  for (const [key, point] of Object.entries(data.players ?? {})) {
    const [teamId, number] = key.split(':');
    board.setPlayerPosition(teamId, Number(number), fromRealMeters(point));
  }
  if (data.ball) board.setBallPosition(fromRealMeters(data.ball));
  for (const arrow of data.arrows ?? []) {
    board.addArrow({ kind: arrow.kind, from: fromRealMeters(arrow.from), to: fromRealMeters(arrow.to) });
  }
  for (const [defender, attacker] of data.markings ?? []) {
    const [dTeam, dNumber] = defender.split(':');
    const [aTeam, aNumber] = attacker.split(':');
    board.setMarking({ teamId: dTeam, number: Number(dNumber) }, { teamId: aTeam, number: Number(aNumber) });
  }
  const start = board.snapshot();
  const keyframes = [{ players: start.players, ball: start.ball, ...(data.startNote ? { note: data.startNote } : {}) }];
  for (const step of data.keyframes ?? []) {
    const previous = keyframes.at(-1);
    const players = { ...previous.players };
    for (const [key, point] of Object.entries(step.players ?? {})) players[key] = fromRealMeters(point);
    // La note (phase 6) est propre à chaque image : elle ne se reporte pas sur la suivante.
    keyframes.push({ players, ball: step.ball ? fromRealMeters(step.ball) : previous.ball, ...(step.note ? { note: step.note } : {}) });
  }
  return { board: start, keyframes: data.keyframes?.length ? keyframes : [] };
}

/**
 * Charge la bibliothèque : l'index, puis chaque situation, vérifiée. Une situation invalide est
 * écartée avec ses erreurs ; les autres restent disponibles.
 * @param {(url: string) => Promise<{ok: boolean, json: () => Promise<unknown>}>} fetchJson fetch du navigateur
 * @param {string} [indexUrl]
 * @returns {Promise<{scenarios: object[], rejected: Array<{file: string, errors: string[]}>}>}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — bibliothèque de situations
 */
export async function loadScenarioLibrary(fetchJson, indexUrl = SCENARIO_INDEX_URL) {
  const response = await fetchJson(indexUrl);
  if (!response.ok) throw new Error(`Index des situations introuvable (${indexUrl}).`);
  const index = await response.json();
  const scenarios = [];
  const rejected = [];
  for (const file of Array.isArray(index?.scenarios) ? index.scenarios : []) {
    if (typeof file !== 'string' || !/^[a-z0-9-]+\.json$/.test(file)) {
      rejected.push({ file: String(file), errors: ['Nom de fichier refusé.'] });
      continue;
    }
    const url = new URL(file, new URL(indexUrl, globalThis.location?.href ?? 'http://localhost/')).href;
    try {
      const data = await (await fetchJson(url)).json();
      const verdict = validateScenario(data);
      if (verdict.ok) scenarios.push(data);
      else rejected.push({ file, errors: verdict.errors });
    } catch (error) {
      rejected.push({ file, errors: [error.message] });
    }
  }
  return { scenarios, rejected };
}
