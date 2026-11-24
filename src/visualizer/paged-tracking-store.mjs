/**
 * Lecture horodatée des analyses longues : une seule fenêtre d'images et de trajectoires en mémoire.
 * Les rappels de rendu gardent l'interface synchrone de TrackingStore ; les déplacements du lecteur
 * chargent leurs données à part. Une réponse dépassée ne remplace jamais la fenêtre demandée ensuite.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { TrackingStore } from './tracking-store.mjs';

/** Durée du contexte passé, pour les traces de quatre secondes et leur image précédente. */
export const WINDOW_BEFORE_SECONDS = 5;
/** Horizon de lecture, renouvelé avant de manquer les deux secondes du placement automatique. */
export const WINDOW_AHEAD_SECONDS = 12;
/** Pas des fenêtres : leur longueur ne dépasse pas dix-sept secondes, hors images voisines. */
export const WINDOW_STEP_SECONDS = 6;

/**
 * Magasin paginé : une fenêtre chargée, une requête remplaçable, aucune archive dans le navigateur.
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Visualiseur de match — lecture bornée des données de suivi
 */
export class PagedTrackingStore extends TrackingStore {
  /**
   * @param {object} manifest en-tête complet, sans la liste intégrale des trajectoires
   * @param {(from: number, to: number, options: object) => Promise<object>} loadWindow
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Visualiseur de match — lecture bornée des données de suivi
   */
  constructor(manifest, loadWindow) {
    super(manifest);
    this.applySummary({ ...manifest, tracks: [] });
    this.complete = manifest.complete === true;
    this.storage = manifest.storage;
    this.loadWindow = loadWindow;
    this.window = null;
    this.pending = null;
    this.generation = 0;
    this.retryAfter = 0;
    this.disposed = false;
  }

  /**
   * Actualise une analyse incomplète ; une republication des équipes invalide la fenêtre courante.
   * @param {object} manifest
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Visualiseur de match — disponibilité des segments
   */
  updateManifest(manifest) {
    if (manifest.storage.revision !== this.storage.revision) {
      this.cancelPending();
      this.window = null;
    }
    this.complete = manifest.complete === true;
    this.source = manifest.source;
    this.analysis = manifest.analysis;
    this.storage = manifest.storage;
    this.applySummary({ ...manifest, tracks: [...this.tracks.values()] });
  }

  /**
   * Indique si une fenêtre suffit aux traces passées et au placement à venir.
   * @param {{from: number, to: number}|null} window
   * @param {number} time
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Visualiseur de match — lecture bornée des données de suivi
   */
  covers(window, time) {
    if (!window) {
      return false;
    }
    const duration = this.complete ? this.source.duration ?? Infinity : this.storage.availableUntil;
    return window.from <= Math.max(0, time - 4) + 1e-6
      && window.to >= Math.min(duration, time + 2) - 1e-6;
  }

  /**
   * Charge la fenêtre utile ; annule les requêtes dépassées lors de déplacements rapides.
   * @param {number} time instant réel du lecteur, en secondes
   * @param {{selectedId?: number|null}} [options]
   * @returns {Promise<boolean>} vrai si une nouvelle fenêtre a été installée
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Visualiseur de match — chargement asynchrone des données de suivi
   */
  async ensureTime(time, { selectedId = null } = {}) {
    if (this.disposed || !Number.isFinite(time)) {
      return false;
    }
    if (!this.complete && time > this.storage.availableUntil + this.interval) {
      this.cancelPending();
      return false;
    }
    const selectedReady = selectedId === null || this.tracks.has(selectedId);
    if (this.covers(this.window, time) && selectedReady) {
      if (this.pending && !this.covers(this.pending, time)) {
        this.cancelPending();
      }
      return false;
    }
    if (this.pending && this.pending.selectedId === selectedId && this.covers(this.pending, time)) {
      return this.pending.promise;
    }
    if (Date.now() < this.retryAfter) {
      return false;
    }
    this.cancelPending();
    const generation = this.generation;
    const base = Math.floor(Math.max(0, time) / WINDOW_STEP_SECONDS) * WINDOW_STEP_SECONDS;
    const from = Math.max(0, base - WINDOW_BEFORE_SECONDS);
    const limit = this.complete ? this.source.duration ?? Infinity : this.storage.availableUntil;
    const to = Math.max(from, Math.min(limit, base + WINDOW_AHEAD_SECONDS));
    const controller = new AbortController();
    const pending = { from, to, selectedId, controller, promise: null };
    this.pending = pending;
    pending.promise = Promise.resolve().then(() => this.loadWindow(from, to, { selectedId, signal: controller.signal }))
      .then((response) => {
        if (this.disposed || generation !== this.generation || controller.signal.aborted) {
          return false;
        }
        this.frames = [];
        for (const frame of response.frames) {
          this.append(frame);
        }
        this.tracks = new Map((response.tracks ?? []).map((track) => [track.id, track]));
        this.window = { from, to };
        this.retryAfter = 0;
        return true;
      }).catch((error) => {
        if (controller.signal.aborted || generation !== this.generation || this.disposed) {
          return false;
        }
        this.retryAfter = Date.now() + 1000;
        throw error;
      }).finally(() => {
        if (this.pending === pending) {
          this.pending = null;
        }
      });
    return pending.promise;
  }

  /**
   * Annule une requête et invalide même une réponse déjà résolue que le réseau livrerait ensuite.
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Visualiseur de match — chargement asynchrone des données de suivi
   */
  cancelPending() {
    this.generation += 1;
    this.pending?.controller.abort();
    this.pending = null;
  }

  /**
   * État synchronisé ; une fenêtre ancienne ne reste pas dessinée après un déplacement éloigné.
   * @param {number} time
   * @returns {object}
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Visualiseur de match — synchronisation des données chargées
   */
  sample(time) {
    if (!this.window || time < this.window.from - 1e-6 || time > this.window.to + 1e-6
        || (!this.complete && time > this.storage.availableUntil + this.interval)) {
      return { time, frame: null, objects: [], ball: null, interpolated: false };
    }
    return super.sample(time);
  }

  /**
   * Distance cumulée par le serveur à la dernière observation antérieure à l'instant affiché.
   * @param {number} trackId
   * @param {number} time
   * @returns {number|null} mètres, ou null si le passé nécessaire n'a pas été fourni
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Visualiseur de match — mesures tactiques bornées
   */
  distanceAt(trackId, time) {
    for (let index = this.indexAt(time); index >= 0; index -= 1) {
      const object = this.frames[index].objects.find((candidate) => candidate.id === trackId);
      if (Number.isFinite(object?.distanceM)) {
        return object.distanceM;
      }
    }
    const track = this.tracks.get(trackId);
    return track?.lastTime <= time && Number.isFinite(track.distanceM) ? track.distanceM : null;
  }

  /**
   * Libère la fenêtre et sa requête lorsqu'une autre analyse est ouverte.
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Visualiseur de match — durée de vie des données chargées
   */
  dispose() {
    this.disposed = true;
    this.cancelPending();
    this.frames = [];
    this.tracks.clear();
    this.window = null;
  }
}
