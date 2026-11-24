/**
 * Source « démonstration » du visualiseur : des exports statiques (football_analysis.static_export)
 * lus par des adresses relatives, sans serveur d'analyse, sans Python et sans GPU. Elle offre au
 * visualiseur la même interface que le serveur local (local-source.mjs) : liste, manifeste,
 * fenêtres horodatées de trente secondes au plus et adresse de la vidéo.
 *
 * Fiabilité : le catalogue, chaque manifeste et chaque segment sont contrôlés (format, version,
 * adresses relatives sans sortie du dossier, instants croissants) ; l'empreinte SHA-256 de chaque
 * segment et des trajectoires est vérifiée quand le navigateur l'autorise (contexte sécurisé). Un
 * export incomplet ou abîmé produit une erreur lisible au lieu d'annotations fausses.
 *
 * Mémoire bornée : seuls quelques segments décodés restent en cache (CHUNK_CACHE_SIZE) ; le
 * visualiseur ne garde que la fenêtre courante (paged-tracking-store.mjs).
 *
 * Schémas : schemas/static-manifest.schema.json, static-chunk, static-tracks et demo-catalog.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/** Formats et version lus (mêmes valeurs que static_export.py). */
export const STATIC_FORMAT = 'football-tracking-static';
export const CHUNK_FORMAT = 'football-tracking-chunk';
export const TRACKS_FORMAT = 'football-tracking-tracks';
export const CATALOG_FORMAT = 'football-demo-catalog';
export const STATIC_VERSION = 1;

/** Durée maximale d'une fenêtre, comme l'API locale. */
export const MAX_WINDOW_SECONDS = 30;

/** Nombre de segments décodés gardés en mémoire. */
export const CHUNK_CACHE_SIZE = 6;

/**
 * Erreur d'un export de démonstration absent, incomplet ou abîmé ; message destiné à l'utilisateur.
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Visualiseur de match — source « démonstration »
 */
export class StaticDataError extends Error {}

/**
 * Vrai pour un nombre fini, au moins égal au minimum donné.
 * @param {unknown} value
 * @param {number} [minimum]
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Visualiseur de match — contrôle des exports
 */
function isNumber(value, minimum = -Infinity) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
}

/**
 * Vrai pour une adresse relative simple, qui reste dans le dossier de l'export.
 * @param {unknown} value
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Visualiseur de match — contrôle des exports
 */
export function isRelativeFile(value) {
  return typeof value === 'string' && value.length > 0 && !/^(?:[A-Za-z]:|\/|\\|\.\/|file:)/.test(value)
    && !value.includes('\\') && !value.includes('://') && !value.split('/').includes('..');
}

/**
 * Défauts du catalogue des démonstrations (demo/index.json).
 * @param {any} catalog
 * @returns {string[]}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Visualiseur de match — contrôle des exports
 */
export function catalogProblems(catalog) {
  if (catalog?.format !== CATALOG_FORMAT || catalog?.version !== STATIC_VERSION || !Array.isArray(catalog.matches)) {
    return [`catalogue : format ${CATALOG_FORMAT} version ${STATIC_VERSION} attendu`];
  }
  const problems = [];
  const seen = new Set();
  catalog.matches.forEach((entry, index) => {
    if (typeof entry?.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.id) || seen.has(entry.id)) {
      problems.push(`catalogue.matches[${index}].id invalide ou dupliqué`);
    }
    seen.add(entry?.id);
    if (!isRelativeFile(entry?.path) || !entry.path.endsWith('/')) {
      problems.push(`catalogue.matches[${index}].path doit être un dossier relatif`);
    }
    if (!['analysis', 'synthetic'].includes(entry?.kind)) {
      problems.push(`catalogue.matches[${index}].kind invalide`);
    }
  });
  return problems;
}

/**
 * Défauts d'un manifeste d'export statique (mêmes règles que static-manifest.schema.json).
 * @param {any} manifest
 * @returns {string[]}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Visualiseur de match — contrôle des exports
 */
export function manifestProblems(manifest) {
  if (manifest?.format !== STATIC_FORMAT || manifest?.version !== STATIC_VERSION) {
    return [`manifeste : format ${STATIC_FORMAT} version ${STATIC_VERSION} attendu`];
  }
  const problems = [];
  if (manifest.complete !== true) {
    problems.push('manifeste : export d\'une analyse incomplète');
  }
  if (!['analysis', 'synthetic'].includes(manifest.provenance?.kind)) {
    problems.push('manifeste.provenance.kind invalide');
  }
  const { source, storage, video } = manifest;
  if (!isNumber(source?.width, 1) || !isNumber(source?.height, 1) || !isNumber(source?.fps, Number.MIN_VALUE)) {
    problems.push('manifeste.source : largeur, hauteur et cadence requises');
  }
  if (storage?.kind !== 'static' || !Array.isArray(storage.chunks) || storage.chunks.length === 0) {
    return [...problems, 'manifeste.storage : segments statiques attendus'];
  }
  let previousEnd = -Infinity;
  let frames = 0;
  storage.chunks.forEach((entry, index) => {
    const where = `manifeste.storage.chunks[${index}]`;
    if (!Number.isInteger(entry?.seq) || !isRelativeFile(entry?.file) || !/^[0-9a-f]{64}$/.test(entry?.sha256 ?? '')
        || !Number.isInteger(entry?.bytes) || entry.bytes < 1 || !Number.isInteger(entry?.frames) || entry.frames < 1) {
      problems.push(`${where} invalide`);
      return;
    }
    if (!isNumber(entry.start, 0) || !isNumber(entry.end, 0) || entry.end < entry.start || entry.start <= previousEnd) {
      problems.push(`${where} : intervalle non croissant`);
    }
    previousEnd = entry.end;
    frames += entry.frames;
  });
  if (storage.frameCount !== frames) {
    problems.push('manifeste.storage.frameCount ne correspond pas aux segments');
  }
  if (!isRelativeFile(storage.tracks?.file) || !Number.isInteger(storage.tracks?.count)) {
    problems.push('manifeste.storage.tracks invalide');
  }
  if (!isRelativeFile(video?.file) || !['video/mp4', 'video/webm'].includes(video?.type)) {
    problems.push('manifeste.video invalide');
  }
  return problems;
}

/**
 * Défauts d'un segment par rapport à son entrée du manifeste.
 * @param {any} chunk
 * @param {{seq: number, start: number, end: number, frames: number}} entry
 * @returns {string[]}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Visualiseur de match — contrôle des exports
 */
export function chunkProblems(chunk, entry) {
  if (chunk?.format !== CHUNK_FORMAT || chunk?.version !== STATIC_VERSION || chunk?.seq !== entry.seq
      || !Array.isArray(chunk?.frames)) {
    return [`segment ${entry.seq} : en-tête invalide`];
  }
  const { frames } = chunk;
  if (frames.length !== entry.frames || frames[0]?.time !== entry.start || frames.at(-1)?.time !== entry.end) {
    return [`segment ${entry.seq} : contenu différent du manifeste`];
  }
  const problems = [];
  let previous = -Infinity;
  frames.forEach((frame, index) => {
    if (!isNumber(frame?.time, 0) || frame.time <= previous || !Array.isArray(frame.objects)
        || !['ok', 'failed'].includes(frame.calibration?.status)) {
      problems.push(`segment ${entry.seq}, image ${index} invalide`);
      return;
    }
    previous = frame.time;
    for (const object of frame.objects) {
      if (!Number.isInteger(object?.id) || !Array.isArray(object.box) || object.box.length !== 4
          || (object.pitch !== null && frame.calibration.status !== 'ok')) {
        problems.push(`segment ${entry.seq}, image ${index} : personne invalide`);
        break;
      }
    }
  });
  return problems;
}

/**
 * Empreinte SHA-256 hexadécimale d'un contenu, ou null si Web Crypto est indisponible (contexte non sécurisé).
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string|null>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Visualiseur de match — contrôle des exports
 */
async function sha256(buffer) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return null;
  }
  const digest = new Uint8Array(await subtle.digest('SHA-256', buffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Exports statiques listés par un catalogue, lus sans serveur d'analyse.
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Visualiseur de match — source « démonstration »
 */
export class StaticAnalysisSource {
  /**
   * @param {string|URL} catalogUrl adresse du catalogue (par exemple demo/index.json, relative à la page)
   * @param {{fetcher?: typeof fetch, cacheSize?: number}} [options]
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « démonstration »
   */
  constructor(catalogUrl, { fetcher = (...args) => fetch(...args), cacheSize = CHUNK_CACHE_SIZE } = {}) {
    this.kind = 'demo';
    this.catalogUrl = new URL(catalogUrl, globalThis.document?.baseURI);
    this.fetcher = fetcher;
    this.cacheSize = cacheSize;
    this.catalog = null;
    this.bundles = new Map();
    this.resolvedBundles = new Map();
    this.chunks = new Map();
  }

  /**
   * Télécharge un fichier de l'export ; vérifie son empreinte si elle est connue, puis le décode.
   * @param {URL} url
   * @param {{sha256?: string, signal?: AbortSignal, label: string}} options
   * @returns {Promise<any>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « démonstration »
   */
  async #readJson(url, { sha256: expected = null, signal, label }) {
    let response;
    try {
      response = await this.fetcher(url.href, { signal });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw error;
      }
      throw new StaticDataError(`Démonstration injoignable (${label}) : vérifiez la connexion, puis rechargez la page.`);
    }
    if (!response.ok) {
      throw new StaticDataError(`Fichier de démonstration manquant (${label}, ${response.status}) : export incomplet.`);
    }
    const buffer = await response.arrayBuffer();
    if (expected) {
      const actual = await sha256(buffer);
      if (actual !== null && actual !== expected) {
        throw new StaticDataError(`Fichier de démonstration abîmé (${label}) : empreinte différente du manifeste.`);
      }
    }
    try {
      return JSON.parse(new TextDecoder().decode(buffer));
    } catch {
      throw new StaticDataError(`Fichier de démonstration illisible (${label}) : JSON invalide.`);
    }
  }

  /**
   * Adresse d'un fichier de l'export, refusée si elle sort du dossier de l'export.
   * @param {URL} base
   * @param {string} file
   * @returns {URL}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « démonstration »
   */
  #inside(base, file) {
    const url = new URL(file, base);
    if (!isRelativeFile(file) || !url.href.startsWith(base.href)) {
      throw new StaticDataError(`Adresse hors de l'export refusée : ${file}`);
    }
    return url;
  }

  /**
   * Lit et contrôle le catalogue une seule fois.
   * @returns {Promise<object[]>} entrées du catalogue
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « démonstration »
   */
  async #entries() {
    if (!this.catalog) {
      this.catalog = this.#readJson(this.catalogUrl, { label: 'catalogue' }).then((catalog) => {
        const problems = catalogProblems(catalog);
        if (problems.length) {
          throw new StaticDataError(`Catalogue de démonstration invalide : ${problems[0]}`);
        }
        return catalog.matches;
      });
      this.catalog.catch(() => { this.catalog = null; });
    }
    return this.catalog;
  }

  /**
   * Manifeste contrôlé d'un export, et adresse de son dossier.
   * @param {string} id
   * @returns {Promise<{manifest: object, base: URL, tracks: Promise<Map<number, object>>|null}>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « démonstration »
   */
  async #bundle(id) {
    if (!this.bundles.has(id)) {
      const pending = this.#entries().then(async (entries) => {
        const entry = entries.find((candidate) => candidate.id === id);
        if (!entry) {
          throw new StaticDataError(`Démonstration inconnue : ${id}`);
        }
        const base = this.#inside(new URL('./', this.catalogUrl), entry.path);
        const manifest = await this.#readJson(new URL('manifest.json', base), { label: 'manifeste' });
        const problems = manifestProblems(manifest);
        if (problems.length) {
          throw new StaticDataError(`Export de démonstration invalide : ${problems[0]}`);
        }
        const bundle = { manifest, base, entry, tracks: null };
        this.resolvedBundles.set(id, bundle);
        return bundle;
      });
      this.bundles.set(id, pending);
      pending.catch(() => this.bundles.delete(id));
    }
    return this.bundles.get(id);
  }

  /**
   * Toujours disponible : rien à démarrer.
   * @returns {Promise<{ok: true, kind: 'demo'}>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « démonstration »
   */
  async getHealth() {
    return { ok: true, kind: 'demo' };
  }

  /**
   * Démonstrations du catalogue, présentées comme des analyses terminées.
   * @returns {Promise<object[]>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « démonstration »
   */
  async listAnalyses() {
    return (await this.#entries()).map((entry) => ({
      id: entry.id, name: entry.title, status: 'done', kind: entry.kind, description: entry.description ?? '',
      duration: entry.duration ?? null, resumable: false,
    }));
  }

  /**
   * État d'une démonstration : toujours terminée.
   * @param {string} id
   * @returns {Promise<object>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « démonstration »
   */
  async getAnalysis(id) {
    const { manifest } = await this.#bundle(id);
    return { id, name: manifest.title, status: 'done', resumable: false };
  }

  /**
   * Manifeste au format attendu par PagedTrackingStore (celui de l'API locale), plus la provenance.
   * @param {string} id
   * @returns {Promise<object>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « démonstration »
   */
  async getTrackingManifest(id) {
    const { manifest } = await this.#bundle(id);
    const { storage } = manifest;
    return {
      // Les images suivent le contrat football-tracking ; le format de l'export reste consultable.
      ...manifest, format: 'football-tracking', version: 1, exportFormat: manifest.format, exportVersion: manifest.version,
      tracks: [], complete: true, teamsReady: true,
      storage: { ...storage, kind: 'static', readyChunks: storage.chunks.length, committedChunks: storage.chunks.length, revision: 1 },
    };
  }

  /**
   * Pas de document complet en mode démo : la lecture se fait par fenêtres.
   * @returns {Promise<never>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « démonstration »
   */
  async getTracking() {
    throw new StaticDataError('Lecture par fenêtres seulement pour une démonstration.');
  }

  /**
   * Résumés des trajectoires, lus et vérifiés une fois par démonstration.
   * @param {string} id
   * @param {AbortSignal} [signal]
   * @returns {Promise<Map<number, object>>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « démonstration »
   */
  async #tracks(id, signal) {
    const bundle = await this.#bundle(id);
    if (!bundle.tracks) {
      const { file, sha256: digest, count } = bundle.manifest.storage.tracks;
      bundle.tracks = this.#readJson(this.#inside(bundle.base, file), { sha256: digest, signal, label: 'trajectoires' })
        .then((data) => {
          if (data?.format !== TRACKS_FORMAT || !Array.isArray(data.tracks) || data.tracks.length !== count) {
            throw new StaticDataError('Trajectoires de démonstration invalides.');
          }
          return new Map(data.tracks.map((track) => [track.id, track]));
        });
      bundle.tracks.catch(() => { bundle.tracks = null; });
    }
    return bundle.tracks;
  }

  /**
   * Images d'un segment, depuis le cache borné ou le fichier (vérifié).
   * @param {string} id
   * @param {object} bundle
   * @param {object} entry entrée du segment dans le manifeste
   * @param {AbortSignal} [signal]
   * @returns {Promise<object[]>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « démonstration »
   */
  async #chunk(id, bundle, entry, signal) {
    const key = `${id}/${entry.seq}`;
    let pending = this.chunks.get(key);
    if (pending) {
      this.chunks.delete(key);
    } else {
      pending = this.#readJson(this.#inside(bundle.base, entry.file), { sha256: entry.sha256, signal, label: `segment ${entry.seq}` })
        .then((chunk) => {
          const problems = chunkProblems(chunk, entry);
          if (problems.length) {
            throw new StaticDataError(`Segment de démonstration invalide : ${problems[0]}`);
          }
          return chunk.frames;
        });
      pending.catch(() => this.chunks.delete(key));
    }
    this.chunks.set(key, pending);
    while (this.chunks.size > this.cacheSize) {
      this.chunks.delete(this.chunks.keys().next().value);
    }
    return pending;
  }

  /**
   * Fenêtre de lecture, comme l'API locale : images de [from, to], plus l'image voisine de chaque
   * côté pour l'interpolation, et les résumés des trajectoires présentes et de la sélection.
   * @param {string} id
   * @param {number} from
   * @param {number} to
   * @param {{selectedId?: number|null, signal?: AbortSignal}} [options]
   * @returns {Promise<{frames: object[], tracks: object[], from: number, to: number}>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « démonstration »
   */
  async getTrackingWindow(id, from, to, { selectedId = null, signal } = {}) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
      throw new StaticDataError('Intervalle de lecture invalide.');
    }
    if (to - from > MAX_WINDOW_SECONDS) {
      throw new StaticDataError('La fenêtre de lecture dépasse trente secondes.');
    }
    const start = Math.max(0, from);
    const end = Math.max(0, to);
    const bundle = await this.#bundle(id);
    const { chunks } = bundle.manifest.storage;
    const inside = chunks.filter((entry) => entry.end >= start && entry.start <= end);
    const wanted = new Set(inside);
    // Segment voisin seulement si l'image voisine n'est pas déjà dans un segment de la fenêtre.
    if (!inside.length || inside[0].start >= start) {
      wanted.add(chunks.filter((entry) => entry.end < start).at(-1));
    }
    if (!inside.length || inside.at(-1).end <= end) {
      wanted.add(chunks.find((entry) => entry.start > end));
    }
    wanted.delete(undefined);
    const ordered = chunks.filter((entry) => wanted.has(entry));
    const [tracks, ...loaded] = await Promise.all([this.#tracks(id, signal),
      ...ordered.map((entry) => this.#chunk(id, bundle, entry, signal))]);
    const frames = [];
    let predecessor = null;
    let successor = null;
    for (const frame of loaded.flat()) {
      if (frame.time < start) {
        predecessor = frame;
      } else if (frame.time > end) {
        successor ??= frame;
      } else {
        frames.push(frame);
      }
    }
    if (predecessor) {
      frames.unshift(predecessor);
    }
    if (successor) {
      frames.push(successor);
    }
    const ids = new Set(frames.flatMap((frame) => frame.objects.map((object) => object.id)));
    if (selectedId !== null) {
      ids.add(selectedId);
    }
    return {
      frames, from: start, to: end,
      tracks: [...ids].sort((a, b) => a - b).map((trackId) => tracks.get(trackId)).filter(Boolean),
    };
  }

  /**
   * Adresse de la vidéo de la démonstration (manifeste déjà lu par getTrackingManifest).
   * @param {string} id
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « démonstration »
   */
  videoUrl(id) {
    const bundle = this.#resolved(id);
    return this.#inside(bundle.base, bundle.manifest.video.file).href;
  }

  /**
   * Adresse de l'affiche de la démonstration, si l'export en joint une.
   * @param {string} id
   * @returns {string|null}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « démonstration »
   */
  posterUrl(id) {
    const bundle = this.#resolved(id);
    const poster = bundle.manifest.files?.['poster.jpg'];
    return poster ? this.#inside(bundle.base, poster.file).href : null;
  }

  /**
   * Même origine : pas de mode CORS pour la vidéo.
   * @returns {null}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « démonstration »
   */
  videoCrossOrigin() {
    return null;
  }

  /**
   * Export déjà lu (synchrone) ; lève une erreur s'il ne l'a pas encore été.
   * @param {string} id
   * @returns {object}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « démonstration »
   */
  #resolved(id) {
    const bundle = this.resolvedBundles.get(id);
    if (!bundle) {
      throw new StaticDataError('Manifeste de démonstration non chargé.');
    }
    return bundle;
  }
}
