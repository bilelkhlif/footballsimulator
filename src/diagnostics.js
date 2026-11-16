/**
 * Mode diagnostic (sprint 5) : mesure de la fluidité, pour vérifier l'objectif du cahier (au moins
 * 30 images par seconde sur un téléphone de milieu de gamme, §2.3 et §4.3).
 *
 * Désactivé par défaut : il ne s'affiche qu'avec ?diagnostics dans l'adresse. Le panneau fait partie
 * de l'interface superposée : il reste donc visible en AR, par le DOM Overlay, sur le téléphone.
 *
 * Il affiche les images par seconde et la durée moyenne d'une image sur les 120 dernières images,
 * le temps de processeur central d'une image (sprint 6 : de son début à la fin du rendu ; s'il est
 * bien plus court que la durée d'une image, c'est le processeur graphique qui limite),
 * le moteur de rendu actif (WebGPU, ou WebGL en mode test), l'état de la session XR, et le nombre
 * d'appels de dessin et de triangles de la dernière image, lus dans renderer.info de three.js.
 *
 * Coût : à chaque image, une écriture dans un tableau de taille fixe (Float64Array), sans
 * allocation ; le texte du panneau n'est réécrit que deux fois par seconde, juste après le rendu,
 * car three.js remet ses statistiques à zéro au début de chaque image.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/** Paramètre d'adresse qui active le mode diagnostic. */
export const DIAGNOSTICS_PARAMETER = 'diagnostics';

/** Nombre d'images retenues pour les moyennes. */
export const FRAME_WINDOW = 120;

/** Intervalle entre deux mises à jour du panneau, en millisecondes. */
export const PANEL_INTERVAL_MS = 500;

/** Écart au-delà duquel deux images ne se suivent pas (onglet en arrière-plan, entrée en AR). */
const MAX_FRAME_GAP_MS = 1000;

/**
 * Indique si l'adresse demande le mode diagnostic.
 * @param {string} [search] partie « ?… » de l'adresse
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Performance — activation du mode diagnostic
 */
export function isDiagnosticsRequested(search = window.location.search) {
  return new URLSearchParams(search).has(DIAGNOSTICS_PARAMETER);
}

/**
 * Statistiques des dernières images, dans une mémoire circulaire de taille fixe.
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Performance — mesure des images par seconde
 */
export class FrameStats {
  #times;
  #count = 0;
  #next = 0;

  /**
   * @param {number} [capacity] nombre d'images retenues
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Performance — mesure des images par seconde
   */
  constructor(capacity = FRAME_WINDOW) {
    this.#times = new Float64Array(capacity);
  }

  /**
   * Nombre d'images retenues.
   * @returns {number}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Performance — mesure des images par seconde
   */
  get sampleCount() {
    return this.#count;
  }

  /**
   * Enregistre l'instant d'une image. Un retour en arrière de l'horloge ou un trou de plus d'une
   * seconde (changement d'horloge en entrant en AR, onglet masqué) repart de zéro.
   * @param {number} time instant de l'image, en millisecondes (argument de la boucle de rendu)
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Performance — mesure des images par seconde
   */
  record(time) {
    if (this.#count > 0) {
      const last = this.#times[(this.#next - 1 + this.#times.length) % this.#times.length];
      if (time <= last || time - last > MAX_FRAME_GAP_MS) {
        this.reset();
      }
    }
    this.#times[this.#next] = time;
    this.#next = (this.#next + 1) % this.#times.length;
    this.#count = Math.min(this.#count + 1, this.#times.length);
  }

  /**
   * Durée couverte par les images retenues, en millisecondes.
   * @returns {number}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Performance — mesure des images par seconde
   */
  get span() {
    if (this.#count < 2) {
      return 0;
    }
    const capacity = this.#times.length;
    const newest = this.#times[(this.#next - 1 + capacity) % capacity];
    const oldest = this.#times[(this.#next - this.#count + capacity) % capacity];
    return newest - oldest;
  }

  /**
   * Images par seconde sur la fenêtre : (n - 1) intervalles pendant la durée couverte.
   * @returns {number} 0 tant qu'il y a moins de deux images
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Performance — mesure des images par seconde
   */
  get fps() {
    const span = this.span;
    return span > 0 ? ((this.#count - 1) * 1000) / span : 0;
  }

  /**
   * Durée moyenne d'une image, en millisecondes.
   * @returns {number} 0 tant qu'il y a moins de deux images
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Performance — mesure des images par seconde
   */
  get averageFrameMs() {
    return this.#count > 1 ? this.span / (this.#count - 1) : 0;
  }

  /**
   * Oublie les images retenues.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Performance — mesure des images par seconde
   */
  reset() {
    this.#count = 0;
    this.#next = 0;
  }
}

/**
 * Panneau du mode diagnostic, mis à jour par la boucle de rendu.
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Performance — panneau du mode diagnostic
 */
export class DiagnosticsPanel {
  #element;
  #renderer;
  #stats;
  #getXrState;
  #interval;
  #fields;
  #lastWrite = -Infinity;
  #now;
  #frameStart = null;
  /** Temps de processeur central des dernières images, en millisecondes (mémoire circulaire). */
  #cpu = new Float64Array(FRAME_WINDOW);
  #cpuCount = 0;
  #cpuNext = 0;

  /**
   * @param {object} options
   * @param {HTMLElement} options.element panneau (#diagnostics), avec ses champs [data-field]
   * @param {{backend?: object, info?: {render?: {drawCalls?: number, triangles?: number}}}} options.renderer
   * @param {FrameStats} [options.stats]
   * @param {() => string} options.getXrState état de la session XR, en clair
   * @param {number} [options.interval] intervalle entre deux mises à jour, en millisecondes
   * @param {() => number} [options.now] horloge en millisecondes ; remplacée dans les tests
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Performance — panneau du mode diagnostic
   */
  constructor({ element, renderer, stats = new FrameStats(), getXrState, interval = PANEL_INTERVAL_MS, now = () => performance.now() }) {
    this.#now = now;
    this.#element = element;
    this.#renderer = renderer;
    this.#stats = stats;
    this.#getXrState = getXrState;
    this.#interval = interval;
    this.#fields = Object.fromEntries([...element.querySelectorAll('[data-field]')].map((field) => [field.dataset.field, field]));
    element.hidden = false;
  }

  /**
   * Statistiques des images.
   * @returns {FrameStats}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Performance — panneau du mode diagnostic
   */
  get stats() {
    return this.#stats;
  }

  /**
   * Temps moyen de processeur central d'une image, en millisecondes, sur les dernières images.
   * @returns {number} 0 tant qu'aucune image n'est mesurée
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Performance — panneau du mode diagnostic
   */
  get averageCpuMs() {
    let total = 0;
    for (let index = 0; index < this.#cpuCount; index += 1) {
      total += this.#cpu[index];
    }
    return this.#cpuCount ? total / this.#cpuCount : 0;
  }

  /**
   * Tout début de l'image : retient l'instant, pour mesurer son temps de processeur central.
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Performance — panneau du mode diagnostic
   */
  beforeFrame() {
    this.#frameStart = this.#now();
  }

  /**
   * Travail d'une image, avant le rendu : enregistre son instant.
   * @param {number} time instant de l'image, en millisecondes
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Performance — panneau du mode diagnostic
   */
  update(time) {
    this.#stats.record(time);
  }

  /**
   * Juste après le rendu de l'image : réécrit le panneau deux fois par seconde, avec les
   * statistiques de l'image qui vient d'être dessinée (three.js les remet à zéro au début de la
   * suivante).
   * @param {number} time instant de l'image, en millisecondes
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Performance — panneau du mode diagnostic
   */
  afterRender(time) {
    if (this.#frameStart !== null) {
      this.#cpu[this.#cpuNext] = this.#now() - this.#frameStart;
      this.#cpuNext = (this.#cpuNext + 1) % this.#cpu.length;
      this.#cpuCount = Math.min(this.#cpuCount + 1, this.#cpu.length);
      this.#frameStart = null;
    }
    if (time - this.#lastWrite >= this.#interval || time < this.#lastWrite) {
      this.#lastWrite = time;
      this.write();
    }
  }

  /**
   * Réécrit les champs du panneau.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Performance — panneau du mode diagnostic
   */
  write() {
    const { fps, averageFrameMs } = this.#stats;
    const render = this.#renderer.info?.render;
    const backend = this.#renderer.backend;
    this.#setField('fps', fps > 0 ? fps.toFixed(0) : '–');
    this.#setField('frame', averageFrameMs > 0 ? `${averageFrameMs.toFixed(1)} ms` : '–');
    const cpu = this.averageCpuMs;
    this.#setField('cpu', cpu > 0 ? `${cpu.toFixed(1)} ms` : '–');
    this.#setField('backend', backend?.isWebGPUBackend ? 'WebGPU' : (backend?.isWebGLBackend ? 'WebGL 2 (mode test)' : '–'));
    this.#setField('xr', this.#getXrState());
    this.#setField('calls', Number.isFinite(render?.drawCalls) ? String(render.drawCalls) : 'non fourni');
    this.#setField('triangles', Number.isFinite(render?.triangles) ? String(render.triangles) : 'non fourni');
    const memory = this.#renderer.info?.memory?.total;
    this.#setField('memory', Number.isFinite(memory) ? `${(memory / 1048576).toFixed(1)} Mio` : 'non fourni');
    this.#element.dataset.fps = fps.toFixed(1);
  }

  /**
   * Écrit un champ du panneau, s'il existe.
   * @param {string} name
   * @param {string} text
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Performance — panneau du mode diagnostic
   */
  #setField(name, text) {
    const field = this.#fields[name];
    if (field && field.textContent !== text) {
      field.textContent = text;
    }
  }
}
