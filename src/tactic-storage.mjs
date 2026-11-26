/**
 * Sauvegarde automatique de la tactique : formations, places des joueurs et du ballon, flèches
 * et images clés de la séquence sont gardées dans IndexedDB peu après chaque changement, et
 * aussitôt quand la page est masquée (changement d'onglet, application mise en arrière-plan,
 * fermeture), puis rétablies au lancement suivant. Un entraîneur ne perd donc pas son travail si Android ferme l'application.
 *
 * Le tableau tactique reste la seule source de vérité (patron Observer) : la sauvegarde lit ses
 * instantanés (snapshot) et le rétablissement passe par TacticsBoard.restore et
 * TacticalSequence.restore, que la scène et les panneaux suivent déjà. Le rétablissement n'est pas
 * une action de l'utilisateur : il n'entre pas dans l'historique, et « Réinitialiser » ramène
 * toujours aux formations de départ.
 *
 * Une donnée enregistrée n'est jamais crue sur parole : version, formations, joueurs, places,
 * flèches et images clés sont vérifiés avant tout rétablissement. Une donnée invalide, ancienne ou
 * illisible est ignorée, et l'application démarre sur la tactique par défaut. Sans IndexedDB
 * (navigation privée, stockage refusé, quota), l'application fonctionne comme avant, sans sauvegarde.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { FORMATIONS, PHASES } from './formations.mjs';
import { MAX_KEYFRAMES } from './tactical-sequence.mjs';
import {
  ARROW_KINDS, BALL_MARGIN, isOnBoard, isOnPitch, MIN_ARROW_LENGTH, PLAYER_MARGIN,
} from './tactics-board.mjs';

/** Version du format enregistré : à incrémenter si sa forme change, l'ancienne est alors ignorée. */
export const TACTIC_FORMAT_VERSION = 1;

/** Base, magasin et clé IndexedDB de la tactique en cours. */
export const TACTIC_DB_NAME = 'football-simulator';
export const TACTIC_STORE_NAME = 'tactics';
export const TACTIC_KEY = 'current';

/** Délai au-delà duquel le lancement n'attend plus IndexedDB (base bloquée par un autre onglet). */
export const LOAD_TIMEOUT_MS = 1500;

/**
 * Délai entre le dernier changement et son enregistrement, en millisecondes. Une suite rapide de
 * changements (formation animée, plusieurs déplacements) ne donne qu'une écriture ; un
 * rechargement ou une fermeture brutale juste après ne perd au plus que ce dernier instant.
 */
export const SAVE_DELAY_MS = 400;

/**
 * Vrai si la valeur est un objet simple (ni null, ni tableau).
 * @param {unknown} value
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Persistance — sauvegarde automatique de la tactique
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Vrai si les clés de l'objet sont exactement celles attendues, sans clé manquante ni en trop.
 * @param {object} record
 * @param {string[]} expectedKeys
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Persistance — sauvegarde automatique de la tactique
 */
function hasExactKeys(record, expectedKeys) {
  const keys = Object.keys(record);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(record, key));
}

/**
 * Vrai si chaque joueur attendu a une place valide sur le plateau.
 * @param {unknown} players places indexées par « équipe:numéro »
 * @param {string[]} playerKeys clés attendues
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Persistance — sauvegarde automatique de la tactique
 */
function arePlayersValid(players, playerKeys) {
  return isRecord(players) && hasExactKeys(players, playerKeys)
    && playerKeys.every((key) => isOnBoard(players[key], PLAYER_MARGIN));
}

/**
 * Vrai si la flèche a une forme que le tableau tactique accepterait.
 * @param {unknown} arrow
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Persistance — sauvegarde automatique de la tactique
 */
function isArrowValid(arrow) {
  return isRecord(arrow)
    && Number.isInteger(arrow.id) && arrow.id > 0
    && Object.values(ARROW_KINDS).includes(arrow.kind)
    && isOnBoard(arrow.from) && isOnPitch(arrow.to)
    && Math.hypot(arrow.to.x - arrow.from.x, arrow.to.z - arrow.from.z) >= MIN_ARROW_LENGTH;
}

/**
 * Vérifie une tactique enregistrée, par rapport à l'instantané d'un tableau de référence (mêmes
 * équipes, mêmes joueurs). Aucune exception : une donnée douteuse est simplement refusée.
 * @param {unknown} data tactique lue dans IndexedDB
 * @param {{formations: object, players: object}} reference instantané du tableau en cours
 * @returns {boolean} vrai si la tactique peut être rétablie sans risque
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Persistance — sauvegarde automatique de la tactique
 */
export function isValidTactic(data, reference) {
  if (!isRecord(data) || data.version !== TACTIC_FORMAT_VERSION || !isRecord(data.board)) {
    return false;
  }
  const { formations, phases, players, ball, arrows, markings } = data.board;
  const teamIds = Object.keys(reference.formations);
  const playerKeys = Object.keys(reference.players);
  if (!isRecord(formations) || !hasExactKeys(formations, teamIds)
    || !teamIds.every((teamId) => Object.hasOwn(FORMATIONS, formations[teamId]))) {
    return false;
  }
  // Phases de jeu : absentes d'une tactique enregistrée avant leur ajout (chaque équipe reprend
  // alors la base) ; présentes, une par équipe, et connues.
  if (phases !== undefined && (!isRecord(phases) || !hasExactKeys(phases, teamIds)
    || !teamIds.every((teamId) => Object.values(PHASES).includes(phases[teamId])))) {
    return false;
  }
  if (!arePlayersValid(players, playerKeys) || !isOnBoard(ball, BALL_MARGIN)) {
    return false;
  }
  // Marquages : absents d'une tactique plus ancienne ; sinon des paires d'adversaires connus, un
  // seul marquage par défenseur.
  if (markings !== undefined && (!Array.isArray(markings)
    || !markings.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every((key) => playerKeys.includes(key))
      && pair[0].split(':')[0] !== pair[1].split(':')[0])
    || new Set(markings.map(([defender]) => defender)).size !== markings.length)) {
    return false;
  }
  if (!Array.isArray(arrows) || !arrows.every(isArrowValid)
    || new Set(arrows.map(({ id }) => id)).size !== arrows.length) {
    return false;
  }
  return Array.isArray(data.keyframes) && data.keyframes.length <= MAX_KEYFRAMES
    && data.keyframes.every((keyframe) => isRecord(keyframe)
      && arePlayersValid(keyframe.players, playerKeys) && isOnBoard(keyframe.ball, BALL_MARGIN));
}

/**
 * Tactique à enregistrer : l'instantané du tableau et les images clés de la séquence.
 * @param {import('./tactics-board.mjs').TacticsBoard} board
 * @param {import('./tactical-sequence.mjs').TacticalSequence} sequence
 * @returns {{version: number, board: object, keyframes: object[]}}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Persistance — sauvegarde automatique de la tactique
 */
export function captureTactic(board, sequence) {
  return { version: TACTIC_FORMAT_VERSION, board: board.snapshot(), keyframes: sequence.keyframes };
}

/**
 * Rétablit une tactique enregistrée, après vérification. Sans effet si elle est invalide.
 * @param {unknown} data
 * @param {import('./tactics-board.mjs').TacticsBoard} board
 * @param {import('./tactical-sequence.mjs').TacticalSequence} sequence
 * @returns {boolean} vrai si la tactique a été rétablie
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Persistance — sauvegarde automatique de la tactique
 */
export function restoreTactic(data, board, sequence) {
  if (!isValidTactic(data, board.snapshot())) {
    return false;
  }
  board.restore(data.board);
  sequence.restore(data.keyframes);
  return true;
}

/**
 * Transforme une requête IndexedDB en promesse.
 * @param {IDBRequest} request
 * @returns {Promise<any>}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Persistance — sauvegarde automatique de la tactique
 */
function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Magasin IndexedDB de la tactique en cours. Toutes les erreurs sont absorbées : la lecture rend
 * null, l'écriture rend false. La base s'ouvre à la première utilisation.
 * @param {IDBFactory|null|undefined} indexedDB fabrique IndexedDB du navigateur, ou rien
 * @returns {{load: () => Promise<unknown>, save: (data: object) => Promise<boolean>}}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Persistance — sauvegarde automatique de la tactique
 */
export function createTacticStore(indexedDB) {
  let database = null;

  /** Ouvre la base une seule fois ; crée le magasin à la première ouverture. */
  const open = () => {
    if (!indexedDB) {
      return Promise.reject(new Error('IndexedDB indisponible'));
    }
    database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(TACTIC_DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(TACTIC_STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('base IndexedDB bloquée par un autre onglet'));
    }).catch((error) => {
      database = null; // nouvel essai à la prochaine utilisation
      throw error;
    });
    return database;
  };

  return {
    async load() {
      try {
        const db = await open();
        return await promisify(db.transaction(TACTIC_STORE_NAME, 'readonly').objectStore(TACTIC_STORE_NAME).get(TACTIC_KEY)) ?? null;
      } catch (error) {
        console.warn('Tactique enregistrée illisible : démarrage sur la tactique par défaut.', error);
        return null;
      }
    },
    async save(data) {
      try {
        const db = await open();
        const transaction = db.transaction(TACTIC_STORE_NAME, 'readwrite');
        transaction.objectStore(TACTIC_STORE_NAME).put(data, TACTIC_KEY);
        // Validation immédiate : la page peut être déchargée juste après (rechargement, fermeture).
        transaction.commit?.();
        await new Promise((resolve, reject) => {
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
        return true;
      } catch (error) {
        console.warn('Tactique non enregistrée :', error);
        return false;
      }
    },
  };
}

/**
 * Attend une promesse au plus `ms` millisecondes ; rend `fallback` passé ce délai.
 * @param {Promise<any>} promise
 * @param {number} ms
 * @param {any} fallback
 * @returns {Promise<any>}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Persistance — sauvegarde automatique de la tactique
 */
function withTimeout(promise, ms, fallback) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Rétablit la tactique enregistrée, puis l'enregistre SAVE_DELAY_MS après chaque changement du
 * tableau ou de la séquence, et aussitôt quand la page est masquée (visibilitychange « hidden »,
 * dernier événement fiable sur mobile). Un rechargement ne laisse pas toujours à l'écriture lancée
 * au masquage le temps de se terminer : l'enregistrement après chaque changement garantit que la
 * tactique est déjà stockée. Le lancement n'attend jamais IndexedDB plus de LOAD_TIMEOUT_MS.
 * @param {{
 *   board: import('./tactics-board.mjs').TacticsBoard,
 *   sequence: import('./tactical-sequence.mjs').TacticalSequence,
 *   store: ReturnType<typeof createTacticStore>,
 *   target?: {addEventListener: Function, removeEventListener: Function, visibilityState?: string},
 *   timeoutMs?: number,
 *   saveDelayMs?: number,
 *   timers?: {setTimer: Function, clearTimer: Function},
 * }} options target : le document, qui émet visibilitychange ; timers : doublures des tests
 * @returns {Promise<{restored: boolean, save: () => Promise<boolean>, detach: () => void}>}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Persistance — sauvegarde automatique de la tactique
 */
export async function attachTacticAutosave({
  board, sequence, store, target, timeoutMs = LOAD_TIMEOUT_MS, saveDelayMs = SAVE_DELAY_MS,
  timers: { setTimer = setTimeout, clearTimer = clearTimeout } = {},
}) {
  const restored = restoreTactic(await withTimeout(store.load(), timeoutMs, null), board, sequence);
  let dirty = false;
  let timer = null;

  /** Enregistre la tactique si elle a changé depuis la dernière sauvegarde réussie. */
  const save = async () => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    if (!dirty) {
      return false;
    }
    dirty = false;
    const saved = await store.save(captureTactic(board, sequence));
    if (!saved) {
      dirty = true; // nouvel essai au prochain changement ou au prochain masquage
    }
    return saved;
  };
  /** Un changement : enregistrement différé, repoussé par chaque nouveau changement. */
  const onChange = () => {
    dirty = true;
    if (timer !== null) {
      clearTimer(timer);
    }
    timer = setTimer(() => {
      timer = null;
      save();
    }, saveDelayMs);
  };
  const unsubscribers = [board.on('change', onChange), sequence.on('change', onChange)];
  /** visibilitychange : la page passe en arrière-plan, dernier moment sûr sur mobile. */
  const onVisibilityChange = () => {
    if (target.visibilityState === 'hidden') {
      save();
    }
  };
  target?.addEventListener('visibilitychange', onVisibilityChange);

  return {
    restored,
    save,
    detach() {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      target?.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}
