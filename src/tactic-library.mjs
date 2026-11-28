/**
 * Tactiques enregistrées (phase 5) : l'entraîneur donne un nom à la tactique en cours et la garde
 * sur l'appareil, pour la rouvrir plus tard, même après un rechargement ou la fermeture de
 * l'application.
 *
 * Les tactiques sont rangées dans la même base IndexedDB que la sauvegarde automatique
 * (src/tactic-storage.mjs), sous une clé à part (LIBRARY_KEY) : la tactique en cours n'est jamais
 * touchée. Chaque tactique enregistrée garde l'instantané complet produit par captureTactic
 * (formations, phases, places, ballon, flèches, marquages, noms et maillots, images clés) ; elle
 * est vérifiée par isValidTactic au moment de l'ouvrir, contre le tableau en cours.
 *
 * Une donnée enregistrée n'est jamais crue sur parole : une bibliothèque d'un autre format est
 * ignorée, une entrée mal formée est écartée sans faire tomber les autres. Une écriture ne part
 * jamais d'une lecture échouée : la bibliothèque existante ne peut donc pas être écrasée par une
 * panne passagère du stockage. Un nom déjà pris est refusé : rien n'est remplacé sans le vouloir.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { TACTIC_FORMAT_VERSION } from './tactic-storage.mjs';

/** Clé de la bibliothèque dans le magasin IndexedDB de la tactique en cours. */
export const LIBRARY_KEY = 'library';

/** Version du format de la bibliothèque : à incrémenter si sa forme change. */
export const LIBRARY_FORMAT_VERSION = 1;

/** Nombre maximal de tactiques enregistrées sur l'appareil. */
export const MAX_SAVED_TACTICS = 50;

/** Longueur maximale du nom d'une tactique, en caractères. */
export const MAX_TACTIC_NAME_LENGTH = 40;

/** Raisons d'un enregistrement refusé, pour le message affiché. */
export const SAVE_ERRORS = Object.freeze({
  EMPTY_NAME: 'empty-name',
  DUPLICATE: 'duplicate',
  FULL: 'full',
  STORAGE: 'storage',
  NOT_FOUND: 'not-found',
});

/**
 * Vrai si la valeur est un objet simple (ni null, ni tableau).
 * @param {unknown} value
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Persistance — tactiques enregistrées
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Nom propre d'une tactique : espaces de début et de fin retirés, espaces répétés réduits à un,
 * longueur bornée. Rend une chaîne vide si rien ne reste.
 * @param {unknown} name
 * @returns {string}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Persistance — tactiques enregistrées
 */
export function normalizeTacticName(name) {
  if (typeof name !== 'string') {
    return '';
  }
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_TACTIC_NAME_LENGTH).trim();
}

/**
 * Clé de comparaison de deux noms : « Pressing haut » et « pressing HAUT » sont le même nom.
 * @param {string} name nom déjà normalisé
 * @returns {string}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Persistance — tactiques enregistrées
 */
function nameKey(name) {
  return name.toLocaleLowerCase('fr');
}

/**
 * Vrai si l'entrée a la forme d'une tactique enregistrée. Le contenu de la tactique elle-même est
 * vérifié à l'ouverture (isValidTactic), contre le tableau en cours.
 * @param {unknown} entry
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Persistance — tactiques enregistrées
 */
function isEntryValid(entry) {
  return isRecord(entry)
    && typeof entry.id === 'string' && entry.id.length > 0
    && typeof entry.name === 'string' && entry.name.length > 0 && normalizeTacticName(entry.name) === entry.name
    && Number.isFinite(entry.savedAt)
    && isRecord(entry.tactic) && entry.tactic.version === TACTIC_FORMAT_VERSION;
}

/**
 * Entrées valides d'une bibliothèque lue dans le stockage : rien si elle est absente ou d'un autre
 * format ; les entrées mal formées ou en double (même identifiant, même nom) sont écartées.
 * @param {unknown} data
 * @returns {Array<{id: string, name: string, savedAt: number, tactic: object}>}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Persistance — tactiques enregistrées
 */
export function readLibraryEntries(data) {
  if (!isRecord(data) || data.version !== LIBRARY_FORMAT_VERSION || !Array.isArray(data.tactics)) {
    return [];
  }
  const ids = new Set();
  const names = new Set();
  return data.tactics.filter((entry) => {
    if (!isEntryValid(entry) || ids.has(entry.id) || names.has(nameKey(entry.name))) {
      return false;
    }
    ids.add(entry.id);
    names.add(nameKey(entry.name));
    return true;
  });
}

/**
 * Identifiant unique d'une tactique enregistrée.
 * @returns {string}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Persistance — tactiques enregistrées
 */
function createTacticId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Bibliothèque des tactiques enregistrées, au-dessus du magasin de la sauvegarde automatique.
 * Les opérations passent l'une après l'autre : deux enregistrements rapprochés ne peuvent pas
 * s'écraser.
 * @param {ReturnType<import('./tactic-storage.mjs').createTacticStore>} store magasin IndexedDB
 * @param {{now?: () => number, createId?: () => string}} [options] doublures des tests
 * @returns {{
 *   list: () => Promise<{ok: boolean, tactics: Array<{id: string, name: string, savedAt: number}>}>,
 *   save: (name: string, tactic: object) => Promise<{ok: true, entry: {id: string, name: string, savedAt: number}}|{ok: false, reason: string, name?: string}>,
 *   get: (id: string) => Promise<{name: string, tactic: object}|null>,
 *   rename: (id: string, name: string) => Promise<{ok: true, entry: {id: string, name: string, savedAt: number}}|{ok: false, reason: string, name?: string}>,
 * }}
 * Depuis la phase 6, une tactique enregistrée peut être renommée (rename).
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Persistance — tactiques enregistrées
 */
export function createTacticLibrary(store, { now = () => Date.now(), createId = createTacticId } = {}) {
  let queue = Promise.resolve();

  /** Lance une opération après la précédente, réussie ou non. */
  const serial = (task) => {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  };
  /** Lit les entrées ; rejette si le stockage est illisible (aucune écriture ne doit suivre). */
  const readEntries = async () => readLibraryEntries(await store.load(LIBRARY_KEY, { strict: true }));
  /** Résumé affichable d'une entrée, sans la tactique. */
  const summarize = ({ id, name, savedAt }) => ({ id, name, savedAt });
  /** Écrit la bibliothèque complète ; rend faux si le stockage refuse l'écriture. */
  const writeEntries = (entries) => store.save({ version: LIBRARY_FORMAT_VERSION, tactics: entries }, LIBRARY_KEY);
  /** Lit les entrées pour les modifier ; rend null si le stockage est illisible (rien n'est écrit). */
  const readForUpdate = async (action) => {
    try {
      return await readEntries();
    } catch (error) {
      console.warn(`Tactiques enregistrées illisibles : ${action} abandonné.`, error);
      return null;
    }
  };

  return {
    list() {
      return serial(async () => {
        try {
          const entries = await readEntries();
          return { ok: true, tactics: entries.sort((a, b) => b.savedAt - a.savedAt).map(summarize) };
        } catch (error) {
          console.warn('Tactiques enregistrées illisibles :', error);
          return { ok: false, tactics: [] };
        }
      });
    },

    save(name, tactic) {
      return serial(async () => {
        const cleanName = normalizeTacticName(name);
        if (!cleanName) {
          return { ok: false, reason: SAVE_ERRORS.EMPTY_NAME };
        }
        let entries;
        try {
          entries = await readEntries();
        } catch (error) {
          console.warn('Tactiques enregistrées illisibles : enregistrement abandonné.', error);
          return { ok: false, reason: SAVE_ERRORS.STORAGE };
        }
        if (entries.some((entry) => nameKey(entry.name) === nameKey(cleanName))) {
          return { ok: false, reason: SAVE_ERRORS.DUPLICATE, name: cleanName };
        }
        if (entries.length >= MAX_SAVED_TACTICS) {
          return { ok: false, reason: SAVE_ERRORS.FULL };
        }
        const entry = { id: createId(), name: cleanName, savedAt: now(), tactic };
        const saved = await writeEntries([...entries, entry]);
        return saved ? { ok: true, entry: summarize(entry) } : { ok: false, reason: SAVE_ERRORS.STORAGE };
      });
    },

    // Renommer (phase 6) : même règle de nom qu'à l'enregistrement ; la tactique, son identifiant et
    // sa date ne changent pas. Seule la casse d'un même nom peut changer sans conflit avec lui-même.
    rename(id, name) {
      return serial(async () => {
        const cleanName = normalizeTacticName(name);
        if (!cleanName) {
          return { ok: false, reason: SAVE_ERRORS.EMPTY_NAME };
        }
        const entries = await readForUpdate('renommage');
        if (!entries) {
          return { ok: false, reason: SAVE_ERRORS.STORAGE };
        }
        const entry = entries.find((candidate) => candidate.id === id);
        if (!entry) {
          return { ok: false, reason: SAVE_ERRORS.NOT_FOUND };
        }
        if (entries.some((other) => other.id !== id && nameKey(other.name) === nameKey(cleanName))) {
          return { ok: false, reason: SAVE_ERRORS.DUPLICATE, name: cleanName };
        }
        if (entry.name === cleanName) {
          return { ok: true, entry: summarize(entry) };
        }
        const renamed = { ...entry, name: cleanName };
        const saved = await writeEntries(entries.map((candidate) => (candidate.id === id ? renamed : candidate)));
        return saved ? { ok: true, entry: summarize(renamed) } : { ok: false, reason: SAVE_ERRORS.STORAGE };
      });
    },

    get(id) {
      return serial(async () => {
        try {
          const entry = (await readEntries()).find((candidate) => candidate.id === id);
          return entry ? { name: entry.name, tactic: entry.tactic } : null;
        } catch (error) {
          console.warn('Tactique enregistrée illisible :', error);
          return null;
        }
      });
    },
  };
}