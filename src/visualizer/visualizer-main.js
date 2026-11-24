/**
 * Visualiseur de match : point d'entrée de visualizer.html.
 *
 * Enchaînement : téléversement d'une vidéo → analyse par le serveur local (analysis/) → lecture
 * de la vidéo d'origine, avec ses annotations et le terrain 3D synchronisés image par image.
 *
 * Synchronisation : requestVideoFrameCallback donne l'instant exact (mediaTime) de chaque image
 * présentée pendant la lecture ; le magasin de suivi renvoie l'état des joueurs à cet instant.
 * Après un déplacement dans la vidéo, et sans requestVideoFrameCallback, l'instant vient de
 * currentTime, ramené au début de l'image affichée (vidéo à cadence fixe) : annotations et image
 * restent la même image.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { formatSpeed, distanceCovered, teamCentroids, velocityAt } from './analytics.js';
import { POLL_INTERVAL_MS } from './api-client.js';
import { DEFAULT_SERVER_URL, LocalAnalysisSource, normaliseServerUrl } from './local-source.mjs';
import { StaticAnalysisSource } from './static-source.mjs';
import { applyHomography, AutoPlacer, candidateRects, scoreRegions, WEIGHTS } from './auto-placement.js';
import { OverlayFrame } from './overlay-frame.js';
import { OverlayPitch } from './overlay-pitch.js';
import { describeCalibration, describeIdentityCheck, describeIdentityValues, formatNumber, formatShare, formatTime } from './format.js';
import { TrackingStore } from './tracking-store.js';
import { PagedTrackingStore } from './paged-tracking-store.mjs';
import { boxToDisplay, containRect, VideoAnnotations } from './video-annotations.js';

/** Durée des traces, en secondes. */
export const TRAIL_SECONDS = 4;

/** Fenêtre de temps examinée par le placement automatique, en secondes de vidéo. */
export const PLACEMENT_WINDOW_S = 2;

/** Intervalle entre deux décisions du placement automatique, en secondes de vidéo. */
export const PLACEMENT_INTERVAL_S = 0.25;

/** Taille de départ du panneau : part de la largeur de l'image, et proportions. */
const PANEL_WIDTH_SHARE = 0.34;
const PANEL_ASPECT = 1.55;

/** Rôles, en clair. */
const ROLE_LABELS = Object.freeze({ player: 'Joueur', goalkeeper: 'Gardien', referee: 'Arbitre' });

/** Clé de stockage local de l'adresse du serveur d'analyse choisie sur une page publique. */
const SERVER_KEY = 'football-simulator:serveur-analyse';

/** Textes des états de fonctionnement affichés en haut de la page. */
const CONNECTION_LABELS = {
  demo: 'Mode démo : exports statiques, aucun serveur requis',
  connecting: 'Connexion au serveur local…',
  connected: 'Serveur local connecté',
  unavailable: 'Serveur local indisponible',
  processing: 'Analyse en cours',
  interrupted: 'Analyse interrompue',
  completed: 'Analyse terminée',
  failed: 'Échec de l\'analyse',
};

/**
 * Vrai si la page a été servie par le serveur d'analyse Python : il ajoute l'en-tête
 * « Server-Timing: football-analysis », lisible sans requête dans la mesure de navigation.
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Visualiseur de match — choix du mode
 */
function servedByAnalysisServer() {
  const [navigation] = performance.getEntriesByType('navigation');
  return Boolean(navigation?.serverTiming?.some((entry) => entry.name === 'football-analysis'));
}

/**
 * Raccourci de document.getElementById.
 * @param {string} id
 * @returns {HTMLElement}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — interface
 */
function byId(id) {
  return document.getElementById(id);
}

/**
 * Application du visualiseur : état, rendu synchronisé et interface.
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — application
 */
class MatchVisualizer {
  /**
   * Relie l'application aux éléments de la page.
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — application
   */
  constructor() {
    this.video = byId('match-video');
    this.stage = byId('stage');
    this.store = null;
    this.overlay = null;
    this.selectedId = null;
    this.openGeneration = 0;
    this.manifestTimer = null;
    this.lastWindowCheck = 0;
    this.currentAnalysis = null;
    /** Mode affiché (« demo » ou « local »), source de données et état de fonctionnement. */
    this.mode = null;
    this.source = null;
    this.local = null;
    this.demo = new StaticAnalysisSource('demo/index.json');
    this.connection = null;
    this.jobTimer = null;
    this.sameOrigin = undefined;
    this.probeSameOrigin = false;
    /** Instant de la dernière image présentée (requestVideoFrameCallback), ou null avant la première. */
    this.mediaTime = null;
    this.lastSample = null;
    this.lastPlacementTime = -Infinity;
    this.lastPanelUpdate = 0;
    this.options = { autoPlace: true, trails: true, arrows: true, annotations: true };
    this.placer = new AutoPlacer();
    this.annotations = new VideoAnnotations(byId('annotations'));
    this.frame = new OverlayFrame({ element: byId('pitch-panel'), handle: byId('pitch-panel-bar'), resizeHandle: byId('pitch-panel-resize') });
  }

  /**
   * Démarre : terrain 3D en WebGPU, mise en page, mode (démonstration ou serveur local), boucle de rendu.
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — application
   */
  async start() {
    this.#bindInterface();
    this.layout();
    new ResizeObserver(() => this.layout()).observe(this.stage);
    try {
      this.overlay = await OverlayPitch.create(byId('pitch-view'), (id) => this.select(id));
      this.overlay.resize(byId('pitch-view').clientWidth, byId('pitch-view').clientHeight);
    } catch (error) {
      byId('pitch-view').textContent = 'Le terrain 3D a besoin de WebGPU, absent ou inutilisable dans ce navigateur : '
        + 'ouvrez la page dans Chrome ou Edge à jour.';
      console.error(error);
    }
    this.frame.on('resize', (rect) => this.overlay?.resize(rect.width, rect.height - byId('pitch-panel-bar').offsetHeight));
    this.#watchFrames();
    requestAnimationFrame(() => this.#loop());
    await this.#initialMode();
  }

  /**
   * Choisit le mode de départ : celui de l'adresse (?demo=, ?analyse=, ?serveur=, ?mode=), sinon
   * l'analyse locale si le serveur Python sert cette page, sinon la démonstration.
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — choix du mode
   */
  async #initialMode() {
    if (this.mode !== null) {
      return; // un choix explicite effectué pendant le démarrage reste prioritaire
    }
    const generation = this.openGeneration;
    const params = new URLSearchParams(window.location.search);
    if (params.has('demo') || params.get('mode') === 'demo') {
      await this.setMode('demo', { open: params.get('demo') });
    } else if (params.has('serveur') || params.has('analyse') || params.get('mode') === 'local') {
      this.probeSameOrigin = true;
      await this.setMode('local', { server: params.get('serveur'), open: params.get('analyse') });
    } else {
      const local = servedByAnalysisServer() && await this.#sameOriginServer();
      if (generation !== this.openGeneration) {
        return;
      }
      await this.setMode(local ? 'local' : 'demo');
    }
  }

  /**
   * Vrai si le serveur d'analyse répond à la même origine que la page. Interrogé seulement si la
   * page vient du serveur Python (marque Server-Timing) ou, en mode local demandé, de la boucle
   * locale : une page publique ou statique ne produit donc pas d'erreur 404 au démarrage.
   * @returns {Promise<boolean>}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — choix du mode
   */
  async #sameOriginServer() {
    if (this.sameOrigin === undefined) {
      const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname);
      if (!loopback || !(servedByAnalysisServer() || this.probeSameOrigin)) {
        return false;
      }
      this.sameOrigin = Boolean(await new LocalAnalysisSource(new URL('./', window.location.href)).getHealth());
    }
    return this.sameOrigin;
  }

  /**
   * Passe en mode démonstration (exports statiques) ou analyse locale (serveur Python).
   * @param {'demo'|'local'} mode
   * @param {{server?: string|null, open?: string|null}} [options] serveur à joindre, analyse à ouvrir
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — choix du mode
   */
  async setMode(mode, { server = null, open = null } = {}) {
    const generation = ++this.openGeneration;
    this.mode = mode;
    this.#closeAnalysis();
    byId('mode-demo').setAttribute('aria-pressed', String(mode === 'demo'));
    byId('mode-local').setAttribute('aria-pressed', String(mode === 'local'));
    byId('demo-controls').hidden = mode !== 'demo';
    byId('local-controls').hidden = mode !== 'local';
    byId('mode-help').hidden = true;
    document.body.dataset.mode = mode;
    if (mode === 'demo') {
      this.source = this.demo;
      await this.#showDemos(open, generation);
    } else {
      byId('upload-input').disabled = true;
      this.setConnectionState('connecting');
      await this.#connectLocal(server, open, generation);
    }
  }

  /**
   * Une réponse ne peut modifier que la source et la génération qui l'ont demandée.
   * @param {number} generation génération capturée avant la requête
   * @param {{kind: string}|null} source source capturée avant la requête
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — isolation des opérations asynchrones
   */
  #isCurrentSource(generation, source) {
    return generation === this.openGeneration && source === this.source && source?.kind === this.mode;
  }

  /**
   * Ferme l'analyse ouverte : suivi, minuteries, vidéo et bandeau de provenance.
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — choix du mode
   */
  #closeAnalysis() {
    clearTimeout(this.manifestTimer);
    clearTimeout(this.jobTimer);
    this.manifestTimer = null;
    this.jobTimer = null;
    this.store?.dispose?.();
    this.store = null;
    this.currentAnalysis = null;
    this.selectedId = null;
    this.video.pause();
    if (this.video.src.startsWith('blob:')) {
      URL.revokeObjectURL(this.video.src);
    }
    this.video.removeAttribute('src');
    this.video.removeAttribute('poster');
    this.video.load();
    byId('stage-empty').hidden = false;
    byId('provenance-banner').hidden = true;
    byId('resume-analysis').hidden = true;
    byId('interrupt-analysis').hidden = true;
    this.setStatus('');
  }

  /**
   * Liste les démonstrations du catalogue et ouvre la demandée, sinon la première.
   * @param {string|null} open
   * @param {number} generation
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — mode démonstration
   */
  async #showDemos(open, generation) {
    this.setConnectionState('demo');
    const select = byId('demo-select');
    try {
      const demos = await this.demo.listAnalyses();
      if (generation !== this.openGeneration) {
        return;
      }
      select.replaceChildren(...demos.map((demo) => new Option(demo.name, demo.id)));
      const chosen = demos.find((demo) => demo.id === open) ?? demos[0];
      if (!chosen) {
        this.setStatus('Aucune démonstration disponible.', 'error');
        return;
      }
      select.value = chosen.id;
      await this.openAnalysis(chosen.id, { expectedGeneration: generation });
    } catch (error) {
      if (generation === this.openGeneration) {
        this.setConnectionState('failed', 'Démonstration indisponible');
        this.setStatus(error.message, 'error');
      }
    }
  }

  /**
   * Se connecte au serveur local : même origine si possible, sinon l'adresse donnée, mémorisée ou par défaut.
   * @param {string|null} server
   * @param {string|null} open
   * @param {number} generation
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — mode analyse locale
   */
  async #connectLocal(server, open, generation) {
    const sameOrigin = await this.#sameOriginServer();
    if (generation !== this.openGeneration || this.mode !== 'local') {
      return;
    }
    let remembered = null;
    try {
      remembered = window.localStorage.getItem(SERVER_KEY);
    } catch {
      // stockage refusé : adresse par défaut
    }
    const base = sameOrigin ? new URL('./', window.location.href).href
      : normaliseServerUrl(server) ?? normaliseServerUrl(remembered) ?? DEFAULT_SERVER_URL;
    if (server && !sameOrigin && !normaliseServerUrl(server)) {
      this.setStatus('Adresse de serveur refusée : seule la boucle locale (127.0.0.1, localhost) est acceptée.', 'error');
    }
    const source = new LocalAnalysisSource(base);
    this.local = source;
    this.source = source;
    byId('server-form').hidden = sameOrigin;
    byId('server-url').value = base;
    byId('upload-input').disabled = true;
    this.setConnectionState('connecting');
    const health = await source.getHealth();
    if (!this.#isCurrentSource(generation, source)) {
      return;
    }
    if (!health) {
      this.setConnectionState('unavailable');
      this.#showHelp(base, sameOrigin);
      byId('analysis-select').replaceChildren(new Option('Analyses précédentes…', ''));
      return;
    }
    if (!sameOrigin) {
      try {
        window.localStorage.setItem(SERVER_KEY, base);
      } catch {
        // stockage refusé : l'adresse sera redemandée
      }
    }
    byId('upload-input').disabled = false;
    this.setConnectionState('connected', `Serveur local connecté (calcul : ${health.device})`);
    if (health.missingModels?.length) {
      this.setStatus(`Poids manquants sur le serveur : ${health.missingModels.join(', ')}.`, 'error');
    }
    await this.refreshList();
    if (!this.#isCurrentSource(generation, source)) {
      return;
    }
    if (open) {
      // Analyse en cours : suivie, et ouverte dès son premier segment publié. Sinon, ouverte aussitôt.
      const status = await source.getAnalysis(open).catch(() => null);
      if (!this.#isCurrentSource(generation, source)) {
        return;
      }
      if (status && ['receiving', 'queued', 'running'].includes(status.status)) {
        this.currentAnalysis = open;
        this.#followJob(open, generation, { source });
        return;
      }
      await this.openAnalysis(open, { expectedGeneration: generation });
      if (status && this.#isCurrentSource(generation, source)) {
        this.#renderJob(status);
      }
    }
  }

  /**
   * Explique comment démarrer ou joindre le serveur local, selon l'origine de la page.
   * @param {string} base adresse essayée
   * @param {boolean} sameOrigin page servie par le serveur lui-même
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — mode analyse locale
   */
  #showHelp(base, sameOrigin) {
    const help = byId('mode-help');
    const steps = [
      `Serveur local injoignable à ${base}. Démarrez-le dans le dossier analysis/ du dépôt :`,
      '.venv\\Scripts\\python -m football_analysis serve',
    ];
    if (!sameOrigin && window.location.protocol === 'https:') {
      steps.push('Si Chrome demande l\'accès aux applications et services de cet appareil, acceptez : '
        + 'cette page publique doit joindre le serveur de votre ordinateur.');
      steps.push(`Sinon, ouvrez ${base}visualizer.html : la même interface, servie par Python.`);
    }
    steps.push('Le mode « Explorer la démo » reste disponible sans serveur.');
    help.replaceChildren(...steps.map((text, index) => {
      const line = document.createElement(index === 1 ? 'code' : 'p');
      line.textContent = text;
      return line;
    }));
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'vz-button';
    retry.textContent = 'Réessayer';
    retry.addEventListener('click', () => this.setMode('local', { server: byId('server-url').value }));
    help.append(retry);
    help.hidden = false;
  }

  /**
   * Affiche l'état de fonctionnement : démo, connexion, traitement, interruption, fin ou échec.
   * @param {'demo'|'connecting'|'connected'|'unavailable'|'processing'|'interrupted'|'completed'|'failed'} state
   * @param {string} [label] texte affiché, à la place du texte par défaut
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — états de fonctionnement
   */
  setConnectionState(state, label) {
    const element = byId('connection-state');
    element.dataset.state = state;
    element.textContent = label ?? CONNECTION_LABELS[state];
    document.body.dataset.connection = state;
    this.connection = state;
  }

  /**
   * Recharge la liste des analyses du serveur local.
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — application
   */
  async refreshList() {
    const generation = this.openGeneration;
    const source = this.local;
    if (!source || !this.#isCurrentSource(generation, source)) {
      return;
    }
    const select = byId('analysis-select');
    const analyses = await source.listAnalyses().catch(() => []);
    if (!this.#isCurrentSource(generation, source)) {
      return;
    }
    select.replaceChildren(new Option('Analyses précédentes…', ''));
    for (const analysis of analyses) {
      const states = { failed: 'échec', interrupted: 'interrompue', queued: 'en attente', running: 'en cours' };
      const label = analysis.status === 'done' ? analysis.name : `${analysis.name} (${states[analysis.status] ?? 'réception'})`;
      const option = new Option(label, analysis.id);
      option.disabled = ['receiving', 'queued'].includes(analysis.status);
      select.append(option);
    }
    select.value = this.currentAnalysis ?? '';
  }

  /**
   * Affiche un message d'état dans la barre du haut.
   * @param {string} message
   * @param {'info'|'error'} [kind]
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — interface
   */
  setStatus(message, kind = 'info') {
    const status = byId('job-status');
    status.textContent = message;
    status.dataset.kind = kind;
  }

  /**
   * Téléverse une vidéo vers le serveur local, la montre aussitôt, puis suit son analyse.
   * @param {File} file
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — application
   */
  async analyse(file) {
    if (this.mode !== 'local' || !this.local || this.source !== this.local) {
      return;
    }
    const generation = ++this.openGeneration;
    const source = this.local;
    this.#closeAnalysis();
    this.#showVideo(URL.createObjectURL(file), null, { crossOrigin: null });
    try {
      this.setConnectionState('processing', 'Téléversement…');
      const job = await source.uploadVideo(file, (fraction) => {
        if (this.#isCurrentSource(generation, source)) {
          this.setStatus(`Téléversement : ${formatShare(fraction)}`);
        }
      });
      if (!this.#isCurrentSource(generation, source)) {
        return;
      }
      this.currentAnalysis = job.id;
      await this.refreshList();
      if (!this.#isCurrentSource(generation, source)) {
        return;
      }
      await this.#followJob(job.id, generation, { fileName: file.name, source });
    } catch (error) {
      if (this.#isCurrentSource(generation, source)) {
        this.setConnectionState('failed', 'Échec du téléversement');
        this.setStatus(error.message, 'error');
      }
    }
  }

  /**
   * Suit une analyse du serveur local jusqu'à sa fin, son interruption ou son échec. Une coupure du
   * serveur ne perd pas l'analyse : l'interrogation reprend avec un délai croissant (10 s au plus),
   * et un serveur redémarré la rend « interrompue », donc reprenable.
   * @param {string} id
   * @param {number} generation
   * @param {{fileName?: string, source?: LocalAnalysisSource}} [options]
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — suivi des analyses locales
   */
  async #followJob(id, generation, { fileName = null, source = this.local } = {}) {
    if (!this.#isCurrentSource(generation, source)) {
      return; // une opération dépassée ne doit même pas effacer une minuterie plus récente
    }
    clearTimeout(this.jobTimer);
    let delay = POLL_INTERVAL_MS;
    let preview = null;
    const poll = async () => {
      if (!this.#isCurrentSource(generation, source)) {
        return;
      }
      let status;
      try {
        status = await source.getAnalysis(id);
        delay = POLL_INTERVAL_MS;
      } catch {
        if (!this.#isCurrentSource(generation, source)) {
          return;
        }
        this.setConnectionState('unavailable', 'Serveur local injoignable : nouvel essai…');
        this.setStatus(`Connexion perdue avec le serveur local ; nouvel essai dans ${Math.round(delay / 1000)} s. `
          + 'Si le serveur a été arrêté, relancez-le : l\'analyse sera reprenable.', 'error');
        this.jobTimer = setTimeout(poll, delay);
        delay = Math.min(delay * 2, 10000);
        return;
      }
      if (!this.#isCurrentSource(generation, source)) {
        return;
      }
      this.#renderJob(status);
      if (status.status === 'running' && status.results !== false && !this.store && !preview) {
        preview = source.getTrackingManifest(id).then(async (manifest) => {
          if (manifest?.storage.frameCount && this.#isCurrentSource(generation, source) && !this.store) {
            await this.openAnalysis(id, { keepVideo: true, expectedGeneration: generation, manifest });
          }
        }).catch(() => {
          // Le premier segment n'est pas encore lisible ; l'état suivant permettra un nouvel essai.
        }).finally(() => { preview = null; });
      }
      if (['receiving', 'queued', 'running'].includes(status.status)) {
        this.jobTimer = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }
      await preview;
      if (!this.#isCurrentSource(generation, source)) {
        return;
      }
      await this.refreshList();
      if (status.status === 'done' && this.#isCurrentSource(generation, source)) {
        if (this.currentAnalysis === id && this.store instanceof PagedTrackingStore && this.store.complete) {
          this.setStatus(`Analyse terminée : ${fileName ?? this.store.source.name}`);
        } else {
          await this.openAnalysis(id, { keepVideo: Boolean(this.video.src), expectedGeneration: generation });
        }
      }
    };
    await poll();
  }

  /**
   * Traduit l'état d'une analyse locale en état affiché, message et boutons Interrompre / Reprendre.
   * @param {object} status
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — suivi des analyses locales
   */
  #renderJob(status) {
    const interrupt = byId('interrupt-analysis');
    const resume = byId('resume-analysis');
    const active = ['receiving', 'queued', 'running'].includes(status.status);
    interrupt.hidden = !['queued', 'running'].includes(status.status);
    interrupt.disabled = Boolean(status.interruptRequested);
    resume.hidden = !(status.resumable && ['failed', 'interrupted'].includes(status.status));
    const fraction = status.progress?.fraction;
    const share = fraction === null || fraction === undefined ? '' : ` ${formatShare(fraction)}`;
    if (active) {
      this.setConnectionState('processing', status.status === 'running' ? `Analyse en cours${share}` : 'Analyse en attente');
      this.setStatus(status.progress?.message ?? 'Analyse en attente…');
    } else if (status.status === 'interrupted') {
      this.setConnectionState('interrupted', status.resumable ? 'Analyse interrompue (reprenable)' : 'Analyse interrompue');
      this.setStatus(status.error ?? 'Analyse interrompue.', 'error');
    } else if (status.status === 'failed') {
      this.setConnectionState('failed');
      this.setStatus(status.error ?? 'Analyse impossible.', 'error');
    } else {
      this.setConnectionState('completed');
    }
  }

  /**
   * Ouvre une analyse complète ou partielle, ou une démonstration : fenêtre de suivi, vidéo, équipes, qualité.
   * @param {string} id
   * @param {{keepVideo?: boolean, expectedGeneration?: number|null, manifest?: object|null}} [options]
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — application
   */
  async openAnalysis(id, { keepVideo = false, expectedGeneration = null, manifest: providedManifest = null } = {}) {
    if (expectedGeneration !== null && expectedGeneration !== this.openGeneration) {
      return;
    }
    const generation = expectedGeneration ?? ++this.openGeneration;
    const source = this.source;
    if (!this.#isCurrentSource(generation, source)) {
      return;
    }
    clearTimeout(this.manifestTimer);
    try {
      this.setStatus(source.kind === 'demo' ? 'Chargement de la démonstration…' : 'Chargement de l\'analyse…');
      const manifest = providedManifest ?? await source.getTrackingManifest(id);
      if (!this.#isCurrentSource(generation, source)) {
        return;
      }
      const tracking = manifest ?? await source.getTracking(id);
      if (!this.#isCurrentSource(generation, source)) {
        return;
      }
      this.store?.dispose?.();
      this.store = manifest
        ? new PagedTrackingStore(manifest, (from, to, options) => source.getTrackingWindow(id, from, to, options))
        : TrackingStore.fromDocument(tracking);
      this.currentAnalysis = id;
      this.selectedId = null;
      this.placer.reset();
      this.overlay?.setTeams(this.store.teams);
      if (!keepVideo || !this.video.src) {
        this.#showVideo(source.videoUrl(id), id, { poster: source.posterUrl?.(id) ?? null });
      }
      this.video.dataset.analysis = id;
      if (manifest) {
        await this.store.ensureTime(keepVideo ? this.video.currentTime : 0);
        if (!this.#isCurrentSource(generation, source)) {
          return;
        }
      }
      byId(source.kind === 'demo' ? 'demo-select' : 'analysis-select').value = id;
      this.#renderProvenance(manifest?.provenance ?? null);
      this.#renderQuality();
      this.layout();
      this.#rememberInAddress(id);
      this.setStatus(`${source.kind === 'demo' ? 'Démonstration ouverte' : 'Analyse ouverte'} : ${manifest?.title ?? tracking.source.name}`);
      if (source.kind === 'local' && manifest && !manifest.complete) {
        this.#refreshManifest(id, generation, source);
      }
    } catch (error) {
      if (this.#isCurrentSource(generation, source)) {
        this.setStatus(error.message, 'error');
        if (source.kind === 'demo') {
          this.setConnectionState('failed', 'Démonstration illisible');
        }
      }
    }
  }

  /**
   * Bandeau de provenance : démonstration synthétique ou export statique d'une analyse réelle.
   * @param {object|null} provenance
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — provenance des données
   */
  #renderProvenance(provenance) {
    const banner = byId('provenance-banner');
    if (provenance?.kind === 'synthetic') {
      banner.textContent = 'Démonstration synthétique : vidéo et annotations générées ensemble, sans modèle. '
        + 'Elle montre l\'interface et le format des données, pas la précision de l\'analyse IA.';
    } else if (provenance?.kind === 'analysis') {
      banner.textContent = `Export statique d'une analyse réelle (exporté le ${String(provenance.exportedAt ?? '').slice(0, 10)}) : `
        + 'résultats figés, mesures de qualité et limites ci-contre.';
    }
    banner.dataset.kind = provenance?.kind ?? '';
    banner.hidden = !provenance;
  }

  /**
   * Inscrit l'analyse ouverte dans l'adresse, pour qu'un rechargement la rouvre.
   * @param {string} id
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Visualiseur de match — choix du mode
   */
  #rememberInAddress(id) {
    const url = new URL(window.location.href);
    for (const key of ['demo', 'analyse', 'mode', 'serveur']) {
      url.searchParams.delete(key);
    }
    if (this.mode === 'demo') {
      url.searchParams.set('demo', id);
    } else {
      url.searchParams.set('analyse', id);
      if (this.local?.crossOrigin) {
        url.searchParams.set('serveur', this.local.base.href);
      }
    }
    window.history.replaceState(null, '', url);
  }

  /**
   * Suit les segments d'une analyse ouverte sans télécharger ses images déjà consultées.
   * @param {string} id
   * @param {number} generation
   * @param {LocalAnalysisSource} [source] source capturée à l'ouverture de l'analyse
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Visualiseur de match — progression des analyses longues
   */
  async #refreshManifest(id, generation, source = this.local) {
    if (!this.#isCurrentSource(generation, source)) {
      return;
    }
    try {
      const [manifest, status] = await Promise.all([source.getTrackingManifest(id), source.getAnalysis(id)]);
      if (!this.#isCurrentSource(generation, source) || !(this.store instanceof PagedTrackingStore)) {
        return;
      }
      if (manifest) {
        this.store.updateManifest(manifest);
        this.overlay?.setTeams(this.store.teams);
        this.#renderQuality();
      }
      this.#renderJob(status);
      if (status.status === 'done') {
        this.setStatus(`Analyse terminée : ${this.store.source.name}`);
      } else if (['receiving', 'queued', 'running'].includes(status.status)) {
        this.setStatus(status.progress?.message ?? 'Analyse en cours ; les segments publiés sont consultables.');
      }
      if (manifest?.complete || ['failed', 'interrupted'].includes(status.status)) {
        await this.refreshList();
        return;
      }
    } catch {
      if (this.#isCurrentSource(generation, source)) {
        this.setConnectionState('unavailable', 'Serveur local injoignable : nouvel essai…');
        this.setStatus('Connexion perdue avec le serveur local ; les segments déjà chargés restent consultables.', 'error');
      }
    }
    if (this.#isCurrentSource(generation, source)) {
      this.manifestTimer = setTimeout(() => this.#refreshManifest(id, generation, source), 3000);
    }
  }

  /**
   * Demande la fenêtre courante sans bloquer le rendu, même pendant un déplacement rapide.
   * @param {number} time
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Visualiseur de match — chargement asynchrone
   */
  #ensureWindow(time) {
    const store = this.store;
    if (!(store instanceof PagedTrackingStore)) {
      return;
    }
    store.ensureTime(time, { selectedId: this.selectedId }).catch((error) => {
      if (this.store === store) {
        this.setStatus(`Chargement du suivi : ${error.message}`, 'error');
      }
    });
  }

  /**
   * Charge une vidéo dans le lecteur.
   * @param {string} source adresse de la vidéo
   * @param {string|null} id analyse correspondante
   * @param {{crossOrigin?: string|null, poster?: string|null}} [options] mode CORS (serveur d'une autre origine), affiche
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — application
   */
  #showVideo(source, id, { crossOrigin = this.source?.videoCrossOrigin?.() ?? null, poster = null } = {}) {
    if (this.video.src.startsWith('blob:')) {
      URL.revokeObjectURL(this.video.src);
    }
    if (crossOrigin) {
      this.video.crossOrigin = crossOrigin;
    } else {
      this.video.removeAttribute('crossorigin');
    }
    if (poster) {
      this.video.poster = poster;
    } else {
      this.video.removeAttribute('poster');
    }
    this.video.src = source;
    this.video.dataset.analysis = id ?? '';
    byId('stage-empty').hidden = true;
  }

  /**
   * Sélectionne une trajectoire (ou aucune).
   * @param {number|null} id
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — application
   */
  select(id) {
    this.selectedId = id === this.selectedId ? null : id;
    this.#ensureWindow(this.video.currentTime);
    this.lastPanelUpdate = 0;
  }

  /**
   * Recalcule la mise en page : calque d'annotations et zone du panneau 3D.
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — interface
   */
  layout() {
    const width = this.stage.clientWidth;
    const height = this.stage.clientHeight;
    this.annotations.resize(width, height);
    const source = this.store?.source ?? { width: this.video.videoWidth, height: this.video.videoHeight };
    this.content = containRect({ width, height }, source);
    this.frame.setArea(this.content);
    if (!this.panelSized && this.content.width > 0) {
      this.panelSized = true;
      const panelWidth = Math.max(this.content.width * PANEL_WIDTH_SHARE, 220);
      this.frame.setRect({ x: this.content.x + this.content.width - panelWidth - 12, y: this.content.y + 12,
        width: panelWidth, height: panelWidth / PANEL_ASPECT });
    }
    this.lastPlacementTime = -Infinity;
  }

  /**
   * Suit l'instant exact de chaque image présentée par le lecteur.
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — synchronisation
   */
  #watchFrames() {
    if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) {
      return;
    }
    // Après un déplacement, l'ancien instant ne vaut plus : currentTime, ramené au début de l'image
    // affichée, le remplace jusqu'au prochain rappel (que tous les navigateurs ne donnent pas à l'arrêt).
    this.video.addEventListener('seeking', () => { this.mediaTime = null; });
    this.video.addEventListener('emptied', () => { this.mediaTime = null; });
    const onFrame = (now, metadata) => {
      this.mediaTime = metadata.mediaTime;
      this.video.requestVideoFrameCallback(onFrame);
    };
    this.video.requestVideoFrameCallback(onFrame);
  }

  /**
   * Boucle d'affichage : annotations, terrain 3D, placement, panneaux.
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — synchronisation
   */
  #loop() {
    requestAnimationFrame(() => this.#loop());
    // Sans rappel d'image : currentTime ramené au début de l'image affichée, si la cadence est fixe
    // (indiqué par l'analyse) ; à cadence variable, currentTime tel quel, à une image près.
    const fps = this.store?.source.fps ?? 25;
    const snap = this.store?.source.constantFrameRate !== false;
    const time = this.mediaTime ?? (snap ? Math.floor(this.video.currentTime * fps + 1e-3) / fps : this.video.currentTime);
    if (!this.store) {
      this.annotations.draw({ objects: [], ball: null }, { content: this.content, source: { width: 1, height: 1 }, teamColor: () => null, selectedId: null });
      this.overlay?.update({ frame: null, objects: [], ball: null }, { selectedId: null,
        velocities: new Map(), histories: new Map(), showTrails: false, showArrows: false, centroids: new Map() });
      return;
    }
    if (performance.now() - this.lastWindowCheck > 150) {
      this.lastWindowCheck = performance.now();
      this.#ensureWindow(time);
    }
    const sample = this.store.sample(time);
    const histories = this.store.histories(time - TRAIL_SECONDS, time);
    const velocities = new Map();
    for (const object of sample.objects) {
      const velocity = histories.has(object.id) ? velocityAt(histories.get(object.id), time) : null;
      if (velocity) {
        velocities.set(object.id, velocity);
      }
    }
    this.lastSample = sample;
    this.annotations.draw(sample, {
      content: this.content, source: this.store.source, teamColor: (team) => this.store.teamColor(team),
      selectedId: this.selectedId, visible: this.options.annotations,
    });
    this.lastUpdate = this.overlay?.update(sample, {
      selectedId: this.selectedId, velocities, histories, showTrails: this.options.trails,
      showArrows: this.options.arrows, centroids: teamCentroids(sample.objects),
    }) ?? null;
    this.#autoPlace(time);
    // Panneaux : aussitôt que l'image analysée change (après un déplacement), sinon 5 fois par seconde.
    if (sample.frame !== this.lastPanelFrame || performance.now() - this.lastPanelUpdate > 200) {
      this.lastPanelFrame = sample.frame;
      this.lastPanelUpdate = performance.now();
      this.#renderFrameInfo(sample, velocities);
      this.#renderControls(time);
    }
  }

  /**
   * Place le panneau 3D dans la zone la moins encombrée, sauf s'il est verrouillé, réduit ou
   * placé à la main.
   * @param {number} time
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — placement automatique du terrain 3D
   */
  #autoPlace(time) {
    if (!this.options.autoPlace || this.frame.locked || this.frame.minimized || !this.content?.width) {
      return;
    }
    if (Math.abs(time - this.lastPlacementTime) < PLACEMENT_INTERVAL_S) {
      return;
    }
    this.lastPlacementTime = time;
    const { source } = this.store;
    const frames = this.store.framesBetween(time, time + PLACEMENT_WINDOW_S);
    if (!frames.length) {
      return;
    }
    const boxes = [];
    for (const frame of frames) {
      for (const object of frame.objects) {
        const weight = object.id === this.selectedId ? WEIGHTS.selected : WEIGHTS[object.role] ?? 1;
        boxes.push({ ...boxToDisplay(object.box, this.content, source), weight: weight / frames.length });
      }
      if (frame.ball) {
        boxes.push({ ...boxToDisplay(frame.ball.box, this.content, source), weight: WEIGHTS.ball / frames.length });
      }
    }
    const homography = frames[0].calibration?.status === 'ok' ? frames[0].calibration.homography : null;
    const isOnPitch = homography ? (x, y) => {
      const point = applyHomography(homography, ((x - this.content.x) / this.content.width) * source.width,
        ((y - this.content.y) / this.content.height) * source.height);
      return point !== null && Math.abs(point[0]) <= 52.5 && Math.abs(point[1]) <= 34;
    } : null;
    const rect = this.frame.rect;
    const area = { width: this.content.width, height: this.content.height };
    const candidates = candidateRects(area, rect, 12).map((c) => ({ ...c, x: c.x + this.content.x, y: c.y + this.content.y }));
    const choice = this.placer.choose(scoreRegions(candidates, boxes, isOnPitch), time);
    const target = candidates[choice];
    if (Math.abs(target.x - rect.x) > 1 || Math.abs(target.y - rect.y) > 1) {
      this.frame.setRect(target, { animate: true });
    }
  }

  /**
   * Met à jour les panneaux latéraux : image affichée et joueur sélectionné.
   * @param {object} sample
   * @param {Map<number, object>} velocities
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — interface
   */
  #renderFrameInfo(sample, velocities) {
    byId('frame-calibration').textContent = describeCalibration(sample.frame?.calibration ?? null);
    byId('frame-counts').textContent = sample.frame
      ? `${sample.objects.length} personnes suivies, ballon ${sample.ball ? 'détecté' : 'non détecté'}${sample.frame.cut ? ', nouveau plan' : ''}.`
      : '';
    const panel = byId('selection-details');
    const empty = byId('selection-empty');
    const object = sample.objects.find((candidate) => candidate.id === this.selectedId);
    const track = this.store.tracks.get(this.selectedId);
    panel.hidden = this.selectedId === null;
    empty.hidden = this.selectedId !== null;
    if (this.selectedId === null) {
      return;
    }
    const history = this.store.history(this.selectedId, track?.firstTime ?? 0, this.lastSample.time);
    const team = object ? object.team : track?.team ?? null;
    const color = team === null ? null : this.store.teamColor(team);
    byId('sel-id').textContent = String(this.selectedId);
    byId('sel-role').textContent = ROLE_LABELS[object?.role ?? track?.role] ?? '—';
    const identityValues = describeIdentityValues(object, formatSpeed(velocities.get(this.selectedId)?.speed ?? null),
      this.store instanceof PagedTrackingStore ? this.store.distanceAt(this.selectedId, this.lastSample.time) : distanceCovered(history));
    byId('sel-team').textContent = team === null
      ? (identityValues.note ? 'inconnue (identité incertaine)' : 'inconnue')
      : `${team === 0 ? 'A' : 'B'} (votes : ${formatShare(object?.teamConfidence ?? track?.teamConfidence)})`;
    byId('sel-team-chip').style.background = color ?? 'transparent';
    byId('sel-visible').textContent = object ? `oui (détection ${formatShare(object.confidence)})` : 'non, à cet instant';
    byId('sel-position').textContent = object?.pitch ? `x ${formatNumber(object.pitch[0])} m, y ${formatNumber(object.pitch[1])} m` : 'indisponible';
    byId('sel-speed').textContent = identityValues.speed;
    byId('sel-distance').textContent = identityValues.distance;
    byId('sel-identity').textContent = identityValues.note ?? 'suivie (pas de contact corrigé à cet instant)';
    byId('sel-span').textContent = track ? `${formatTime(track.firstTime)} – ${formatTime(track.lastTime)} (${track.observations} images)` : '—';
  }

  /**
   * Affiche la qualité de l'analyse et ses limites.
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — interface
   */
  #renderQuality() {
    const metrics = this.store.metrics ?? {};
    const { detection = {}, tracking = {}, calibration = {}, positions = {}, teams = {}, processing = {} } = metrics;
    const analysis = this.store.analysis ?? {};
    const synthetic = analysis.synthetic === true;
    const notApplicable = 'sans objet : données synthétiques, exactes par construction';
    byId('tracking-availability').textContent = this.store instanceof PagedTrackingStore
      ? (this.store.complete ? 'Analyse terminée. ' : 'Analyse incomplète. ')
        + `Suivi disponible jusqu'à ${formatTime(this.store.storage.availableUntil)}. `
        + (this.store.storage.frameCount ? '' : 'Aucun segment publié pour le moment.') : '';
    const rows = [
      ['Images analysées', `${detection.frames ?? this.store.storage?.frameCount ?? this.store.frames.length} (${formatNumber(analysis.fps)} images/s)`],
      ['Calibration réussie', `${formatShare(calibration.calibratedShare)} des images`],
      ["Erreur d'ajustement", synthetic ? notApplicable
        : `${formatNumber(calibration.medianFitErrorPx)} px, ${formatNumber(calibration.medianFitErrorM, 2)} m (médianes, optimistes)`],
      ['Erreur hors échantillon', synthetic ? notApplicable
        : `${formatNumber(calibration.medianHoldoutErrorPx)} px, ${formatNumber(calibration.medianHoldoutErrorM, 2)} m `
        + `(médianes ; 90 % sous ${formatNumber(calibration.p90HoldoutErrorM, 2)} m), sur les repères du terrain`],
      ['Positions sur le terrain', formatShare(positions.placedShare)],
      ['Ballon détecté', `${formatShare(detection.ballFrameShare)} des images`],
      ['Trajectoires', `${tracking.tracks ?? '—'}, fragmentation ${formatNumber(tracking.fragmentation, 2)}`],
      ['Identités', describeIdentityCheck(metrics.identity)],
      ['Équipe connue', `${formatShare(teams.knownTeamShare)} des observations`],
      ['Équilibre des équipes', `${formatShare(teams.medianMajorityShare)} des joueurs d'une image dans la même équipe (vers 50 % attendu)`],
      ['Traitement', processing.synthetic ? 'aucun : rien n\'a été analysé (démonstration synthétique)'
        : `${formatNumber(processing.slowdown)} fois la durée de la vidéo (${formatNumber(processing.analysedFramesPerSecond)} images analysées/s, ${processing.device ?? '—'})`],
    ];
    byId('quality-list').replaceChildren(...rows.flatMap(([label, value]) => {
      const term = document.createElement('dt');
      term.textContent = label;
      const definition = document.createElement('dd');
      definition.textContent = value;
      return [term, definition];
    }));
    byId('limitations-list').replaceChildren(...this.store.limitations.map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
    const legend = byId('team-legend');
    legend.replaceChildren(...this.store.teams.map((team) => {
      const item = document.createElement('span');
      item.className = 'vz-legend-item';
      item.innerHTML = `<i style="background:${team.color ?? '#9aa0a6'}"></i>Équipe ${team.id === 0 ? 'A' : 'B'}`;
      return item;
    }));
  }

  /**
   * Met à jour la barre de lecture.
   * @param {number} time
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — interface
   */
  #renderControls(time) {
    const duration = Number.isFinite(this.video.duration) ? this.video.duration : 0;
    byId('time-display').textContent = `${formatTime(time)} / ${formatTime(duration)}`;
    const seek = byId('seek');
    seek.max = String(duration || 0);
    if (document.activeElement !== seek) {
      seek.value = String(time);
    }
    byId('play').textContent = this.video.paused ? 'Lecture' : 'Pause';
  }

  /**
   * Avance ou recule d'une image analysée.
   * @param {number} direction 1 ou -1
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — interface
   */
  async step(direction) {
    if (!this.store) {
      return;
    }
    this.video.pause();
    const store = this.store;
    const time = this.video.currentTime;
    if (store instanceof PagedTrackingStore) {
      try {
        await store.ensureTime(time, { selectedId: this.selectedId });
      } catch (error) {
        this.setStatus(error.message, 'error');
        return;
      }
      if (store !== this.store || this.video.currentTime !== time || !store.sample(time).frame) {
        return;
      }
    }
    const index = this.store.indexAt(this.video.currentTime + (direction > 0 ? 1e-3 : -1e-3));
    const target = this.store.frames[Math.min(Math.max(index + (direction > 0 ? 1 : 0), 0), this.store.frames.length - 1)];
    if (target) {
      this.video.currentTime = target.time + 1e-3;
    }
  }

  /**
   * Relie les boutons, la barre de lecture, le clavier et les clics sur la vidéo.
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — interface
   */
  #bindInterface() {
    byId('upload-input').addEventListener('change', (event) => {
      const [file] = event.target.files;
      if (file) {
        this.analyse(file);
      }
      event.target.value = '';
    });
    byId('analysis-select').addEventListener('change', async (event) => {
      const id = event.target.value;
      const source = this.local;
      if (!id || this.mode !== 'local' || !source || source !== this.source) {
        return;
      }
      const generation = ++this.openGeneration;
      await this.openAnalysis(id, { expectedGeneration: generation });
      if (!this.#isCurrentSource(generation, source) || this.currentAnalysis !== id) {
        return;
      }
      const status = await source.getAnalysis(id).catch(() => null);
      if (status && this.#isCurrentSource(generation, source) && this.currentAnalysis === id) {
        this.#renderJob(status);
        if (['receiving', 'queued', 'running'].includes(status.status)) {
          this.#followJob(id, generation, { source });
        }
      }
    });
    byId('demo-select').addEventListener('change', (event) => event.target.value && this.openAnalysis(event.target.value));
    byId('mode-demo').addEventListener('click', () => this.mode !== 'demo' && this.setMode('demo'));
    byId('mode-local').addEventListener('click', () => this.mode !== 'local' && this.setMode('local'));
    byId('server-form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.setMode('local', { server: byId('server-url').value });
    });
    byId('interrupt-analysis').addEventListener('click', async () => {
      const id = this.currentAnalysis;
      const source = this.local;
      const generation = this.openGeneration;
      if (!id || !source || !this.#isCurrentSource(generation, source)) {
        return;
      }
      byId('interrupt-analysis').disabled = true;
      try {
        const status = await source.interruptAnalysis(id);
        if (!this.#isCurrentSource(generation, source) || this.currentAnalysis !== id) {
          return;
        }
        this.#renderJob(status);
        this.setStatus('Interruption demandée : arrêt au prochain lot d\'images ; les segments validés sont conservés.');
      } catch (error) {
        if (this.#isCurrentSource(generation, source) && this.currentAnalysis === id) {
          this.setStatus(error.message, 'error');
          byId('interrupt-analysis').disabled = false;
        }
      }
    });
    byId('annotations').addEventListener('click', (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      this.select(this.annotations.pick(event.clientX - rect.left, event.clientY - rect.top));
    });
    this.video.addEventListener('loadedmetadata', () => this.layout());
    this.video.addEventListener('seeking', () => this.#ensureWindow(this.video.currentTime));
    byId('resume-analysis').addEventListener('click', async () => {
      const id = this.currentAnalysis;
      const source = this.local;
      const generation = this.openGeneration;
      if (!id || !source || !this.#isCurrentSource(generation, source)) {
        return;
      }
      byId('resume-analysis').disabled = true;
      try {
        await source.resumeAnalysis(id);
        if (!this.#isCurrentSource(generation, source) || this.currentAnalysis !== id) {
          return;
        }
        this.setStatus('Reprise en attente ; les segments validés sont conservés.');
        byId('resume-analysis').hidden = true;
        await this.refreshList();
        if (this.#isCurrentSource(generation, source) && this.currentAnalysis === id) {
          this.#followJob(id, generation, { source });
        }
      } catch (error) {
        if (this.#isCurrentSource(generation, source) && this.currentAnalysis === id) {
          this.setStatus(error.message, 'error');
        }
      } finally {
        if (this.#isCurrentSource(generation, source) && this.currentAnalysis === id) {
          byId('resume-analysis').disabled = false;
        }
      }
    });
    byId('play').addEventListener('click', () => (this.video.paused ? this.video.play() : this.video.pause()));
    byId('seek').addEventListener('input', (event) => { this.video.currentTime = Number(event.target.value); });
    byId('speed').addEventListener('change', (event) => { this.video.playbackRate = Number(event.target.value); });
    byId('mute').addEventListener('click', (event) => {
      this.video.muted = !this.video.muted;
      event.currentTarget.setAttribute('aria-pressed', String(!this.video.muted));
    });
    byId('frame-previous').addEventListener('click', () => this.step(-1));
    byId('frame-next').addEventListener('click', () => this.step(1));
    const toggles = { 'toggle-auto': 'autoPlace', 'toggle-trails': 'trails', 'toggle-arrows': 'arrows', 'toggle-annotations': 'annotations' };
    for (const [id, option] of Object.entries(toggles)) {
      byId(id).addEventListener('click', (event) => {
        this.options[option] = !this.options[option];
        event.currentTarget.setAttribute('aria-pressed', String(this.options[option]));
        if (option === 'autoPlace' && this.options.autoPlace) {
          this.placer.reset();
          this.lastPlacementTime = -Infinity;
        }
      });
    }
    byId('toggle-lock').addEventListener('click', (event) => {
      this.frame.setLocked(!this.frame.locked);
      event.currentTarget.setAttribute('aria-pressed', String(this.frame.locked));
    });
    byId('pitch-recentre').addEventListener('click', () => this.overlay?.resetView());
    byId('pitch-minimise').addEventListener('click', () => {
      this.frame.setMinimized(true);
      byId('pitch-restore').hidden = false;
    });
    byId('pitch-restore').addEventListener('click', () => {
      this.frame.setMinimized(false);
      byId('pitch-restore').hidden = true;
    });
    this.frame.on('usermove', () => {
      this.options.autoPlace = false;
      byId('toggle-auto').setAttribute('aria-pressed', 'false');
    });
    window.addEventListener('keydown', (event) => {
      if (event.target.closest('input, select, textarea')) {
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        byId('play').click();
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        this.step(event.key === 'ArrowRight' ? 1 : -1);
      } else if (event.key === 'Escape') {
        this.selectedId = null;
      }
    });
  }

  /**
   * État observable par les tests de bout en bout.
   * @returns {object}
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — tests
   */
  snapshot() {
    const sample = this.lastSample;
    return {
      mediaTime: this.mediaTime,
      currentTime: this.video.currentTime,
      sampleTime: sample?.time ?? null,
      analysedTime: sample?.frame?.time ?? null,
      interpolated: sample?.interpolated ?? false,
      objects: sample?.objects.map((object) => ({ id: object.id, box: object.box, pitch: object.pitch })) ?? [],
      selectedId: this.selectedId,
      panel: this.frame.rect,
      content: this.content,
      options: { ...this.options, locked: this.frame.locked, minimized: this.frame.minimized },
      overlay: this.lastUpdate,
      webgpu: this.overlay?.usesWebGpu ?? false,
      teams: this.store?.teams ?? [],
      loadedFrames: this.store?.frames.length ?? 0,
      window: this.store?.window ?? null,
      complete: this.store?.complete ?? true,
      mode: this.mode,
      connection: this.connection,
      source: this.source?.kind ?? null,
      analysis: this.currentAnalysis,
    };
  }
}

const app = new MatchVisualizer();
window.__matchVisualizer = app;
app.start();
