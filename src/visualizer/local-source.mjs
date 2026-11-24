/**
 * Source « analyse locale » du visualiseur : le serveur Python (analysis/), joint à la même origine
 * quand il sert la page, ou à une autre adresse de la boucle locale quand la page vient de GitHub
 * Pages. Même interface que la source de démonstration (static-source.mjs), plus le téléversement,
 * l'interruption et la reprise, que seul le serveur sait faire.
 *
 * Depuis une autre origine, chaque requête est une requête CORS : le serveur n'y répond qu'aux
 * origines autorisées (--allow-origin), et Chrome peut demander l'accès aux applications de cet
 * appareil (Local Network Access). La vidéo est alors chargée avec crossorigin="anonymous" pour
 * porter l'en-tête Origin que le serveur vérifie.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { getAnalysis, getHealth, getTracking, getTrackingManifest, getTrackingWindow, interruptAnalysis,
  listAnalyses, resumeAnalysis, uploadVideo, videoUrl } from './api-client.mjs';

/** Adresse du serveur local par défaut (football_analysis serve). */
export const DEFAULT_SERVER_URL = 'http://127.0.0.1:8765/';

/**
 * Normalise l'adresse d'un serveur local saisie par l'utilisateur : http(s), boucle locale, « / » final.
 * @param {string} value
 * @returns {string|null} adresse normalisée, ou null si elle n'est pas une adresse de la boucle locale
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Visualiseur de match — connexion au serveur local
 */
export function normaliseServerUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    return null;
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || /^127\.\d+\.\d+\.\d+$/.test(url.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || !loopback || url.username || url.password) {
    return null;
  }
  return `${url.origin}/`;
}

/**
 * Serveur d'analyse local, à la même origine que la page ou à une adresse de la boucle locale.
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Visualiseur de match — source « analyse locale »
 */
export class LocalAnalysisSource {
  /**
   * @param {string|URL} base adresse du serveur (dossier de la page si le serveur la sert)
   * @param {{fetcher?: typeof fetch, pageOrigin?: string}} [options]
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « analyse locale »
   */
  constructor(base, { fetcher = (...args) => fetch(...args), pageOrigin = globalThis.location?.origin } = {}) {
    this.kind = 'local';
    this.base = new URL(base);
    this.crossOrigin = this.base.origin !== pageOrigin;
    this.fetch = (path, init = {}) => fetcher(new URL(path, this.base).href, { ...init, mode: this.crossOrigin ? 'cors' : init.mode });
  }

  /**
   * État du serveur, ou null s'il est injoignable (arrêté, refusé par le navigateur ou par CORS).
   * @returns {Promise<object|null>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « analyse locale »
   */
  getHealth() {
    return getHealth(this.fetch);
  }

  /**
   * Analyses du serveur, les plus récentes d'abord.
   * @returns {Promise<object[]>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « analyse locale »
   */
  listAnalyses() {
    return listAnalyses(this.fetch);
  }

  /**
   * État et progression d'une analyse.
   * @param {string} id
   * @returns {Promise<object>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « analyse locale »
   */
  getAnalysis(id) {
    return getAnalysis(id, this.fetch);
  }

  /**
   * Document de suivi complet d'une ancienne analyse (sans lecture par fenêtres).
   * @param {string} id
   * @returns {Promise<object>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « analyse locale »
   */
  getTracking(id) {
    return getTracking(id, this.fetch);
  }

  /**
   * Manifeste de lecture par fenêtres, ou null pour une ancienne analyse.
   * @param {string} id
   * @returns {Promise<object|null>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « analyse locale »
   */
  getTrackingManifest(id) {
    return getTrackingManifest(id, this.fetch);
  }

  /**
   * Fenêtre horodatée d'images et de résumés de trajectoires.
   * @param {string} id
   * @param {number} from
   * @param {number} to
   * @param {{selectedId?: number|null, signal?: AbortSignal}} [options]
   * @returns {Promise<{frames: object[], tracks: object[]}>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « analyse locale »
   */
  getTrackingWindow(id, from, to, options = {}) {
    return getTrackingWindow(id, from, to, { ...options, fetcher: this.fetch });
  }

  /**
   * Reprend une analyse interrompue.
   * @param {string} id
   * @returns {Promise<object>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « analyse locale »
   */
  resumeAnalysis(id) {
    return resumeAnalysis(id, this.fetch);
  }

  /**
   * Interrompt une analyse en attente ou en cours.
   * @param {string} id
   * @returns {Promise<object>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « analyse locale »
   */
  interruptAnalysis(id) {
    return interruptAnalysis(id, this.fetch);
  }

  /**
   * Téléverse une vidéo vers le serveur local.
   * @param {File} file
   * @param {(fraction: number) => void} onProgress
   * @returns {Promise<object>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « analyse locale »
   */
  uploadVideo(file, onProgress) {
    return uploadVideo(file, onProgress, { base: this.base });
  }

  /**
   * Adresse de la vidéo source d'une analyse.
   * @param {string} id
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « analyse locale »
   */
  videoUrl(id) {
    return new URL(videoUrl(id), this.base).href;
  }

  /**
   * Mode CORS de l'élément vidéo : « anonymous » si le serveur est une autre origine que la page.
   * @returns {string|null}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — source « analyse locale »
   */
  videoCrossOrigin() {
    return this.crossOrigin ? 'anonymous' : null;
  }
}
