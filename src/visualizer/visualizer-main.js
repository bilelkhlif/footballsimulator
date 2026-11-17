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
import { getHealth, getTracking, listAnalyses, uploadVideo, videoUrl, waitForAnalysis } from './api-client.js';
import { applyHomography, AutoPlacer, candidateRects, scoreRegions, WEIGHTS } from './auto-placement.js';
import { OverlayFrame } from './overlay-frame.js';
import { OverlayPitch } from './overlay-pitch.js';
import { describeCalibration, formatNumber, formatShare, formatTime } from './format.js';
import { TrackingStore } from './tracking-store.js';
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
   * Démarre : terrain 3D en WebGPU, mise en page, serveur d'analyse, boucle de rendu.
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
    await this.#connect();
  }

  /**
   * Se connecte au serveur d'analyse, liste les analyses et ouvre celle de l'adresse (?analyse=).
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — application
   */
  async #connect() {
    const health = await getHealth();
    if (!health) {
      this.setStatus('Serveur d\'analyse injoignable : lancez « python -m football_analysis serve » dans analysis/.', 'error');
      byId('upload-input').disabled = true;
      return;
    }
    if (health.missingModels?.length) {
      this.setStatus(`Poids manquants sur le serveur : ${health.missingModels.join(', ')}.`, 'error');
    } else {
      this.setStatus(`Serveur prêt (calcul : ${health.device}).`);
    }
    await this.refreshList();
    const requested = new URLSearchParams(window.location.search).get('analyse');
    if (requested) {
      await this.openAnalysis(requested);
    }
  }

  /**
   * Recharge la liste des analyses terminées.
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — application
   */
  async refreshList() {
    const select = byId('analysis-select');
    const analyses = await listAnalyses().catch(() => []);
    select.replaceChildren(new Option('Analyses précédentes…', ''));
    for (const analysis of analyses) {
      const label = analysis.status === 'done' ? analysis.name : `${analysis.name} (${analysis.status === 'failed' ? 'échec' : 'en cours'})`;
      const option = new Option(label, analysis.id);
      option.disabled = analysis.status !== 'done';
      select.append(option);
    }
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
   * Téléverse une vidéo, la montre aussitôt, attend son analyse puis l'ouvre.
   * @param {File} file
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — application
   */
  async analyse(file) {
    this.#showVideo(URL.createObjectURL(file), null);
    try {
      const job = await uploadVideo(file, (fraction) => this.setStatus(`Téléversement : ${formatShare(fraction)}`));
      const final = await waitForAnalysis(job.id, (status) => {
        const progress = status.progress;
        const share = progress?.fraction === null || progress?.fraction === undefined ? '' : ` ${formatShare(progress.fraction)}`;
        this.setStatus(status.status === 'queued' ? 'En attente d\'analyse…' : `Analyse${share} : ${progress?.message ?? status.status}`);
      });
      if (final.status !== 'done') {
        throw new Error(final.error ?? 'Analyse impossible.');
      }
      await this.refreshList();
      await this.openAnalysis(job.id, { keepVideo: true });
    } catch (error) {
      this.setStatus(error.message, 'error');
    }
  }

  /**
   * Ouvre une analyse terminée : document de suivi, vidéo, équipes, qualité.
   * @param {string} id
   * @param {{keepVideo?: boolean}} [options] garder la vidéo locale déjà affichée
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — application
   */
  async openAnalysis(id, { keepVideo = false } = {}) {
    try {
      this.setStatus('Chargement de l\'analyse…');
      const tracking = await getTracking(id);
      this.store = TrackingStore.fromDocument(tracking);
      this.selectedId = null;
      this.placer.reset();
      this.overlay?.setTeams(this.store.teams);
      if (!keepVideo || !this.video.src) {
        this.#showVideo(videoUrl(id), id);
      }
      byId('analysis-select').value = id;
      this.#renderQuality();
      this.layout();
      this.setStatus(`Analyse ouverte : ${tracking.source.name}`);
    } catch (error) {
      this.setStatus(error.message, 'error');
    }
  }

  /**
   * Charge une vidéo dans le lecteur.
   * @param {string} source adresse de la vidéo
   * @param {string|null} id analyse correspondante
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — application
   */
  #showVideo(source, id) {
    if (this.video.src.startsWith('blob:')) {
      URL.revokeObjectURL(this.video.src);
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
    const fps = this.store?.source.fps ?? 25;
    const time = this.mediaTime ?? Math.floor(this.video.currentTime * fps + 1e-3) / fps;
    if (!this.store) {
      this.annotations.draw({ objects: [], ball: null }, { content: this.content, source: { width: 1, height: 1 }, teamColor: () => null, selectedId: null });
      return;
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
    const team = object?.team ?? track?.team ?? null;
    const color = team === null ? null : this.store.teamColor(team);
    byId('sel-id').textContent = String(this.selectedId);
    byId('sel-role').textContent = ROLE_LABELS[object?.role ?? track?.role] ?? '—';
    byId('sel-team').textContent = team === null ? 'inconnue' : `${team === 0 ? 'A' : 'B'} (votes : ${formatShare(object?.teamConfidence ?? track?.teamConfidence)})`;
    byId('sel-team-chip').style.background = color ?? 'transparent';
    byId('sel-visible').textContent = object ? `oui (détection ${formatShare(object.confidence)})` : 'non, à cet instant';
    byId('sel-position').textContent = object?.pitch ? `x ${formatNumber(object.pitch[0])} m, y ${formatNumber(object.pitch[1])} m` : 'indisponible';
    byId('sel-speed').textContent = formatSpeed(velocities.get(this.selectedId)?.speed ?? null);
    byId('sel-distance').textContent = `${formatNumber(distanceCovered(history), 0)} m mesurés`;
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
    const rows = [
      ['Images analysées', `${detection.frames ?? this.store.frames.length} (${formatNumber(analysis.fps)} images/s)`],
      ['Calibration réussie', `${formatShare(calibration.calibratedShare)} des images`],
      ['Erreur de reprojection', `${formatNumber(calibration.medianErrorPx)} px, ${formatNumber(calibration.medianErrorM, 2)} m (médianes)`],
      ['Positions sur le terrain', formatShare(positions.placedShare)],
      ['Ballon détecté', `${formatShare(detection.ballFrameShare)} des images`],
      ['Trajectoires', `${tracking.tracks ?? '—'}, fragmentation ${formatNumber(tracking.fragmentation, 2)}`],
      ['Équipe connue', `${formatShare(teams.knownTeamShare)} des observations`],
      ['Traitement', `${formatNumber(processing.framesPerSecond)} images/s sur ${processing.device ?? '—'}`],
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
  step(direction) {
    if (!this.store) {
      return;
    }
    this.video.pause();
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
    byId('analysis-select').addEventListener('change', (event) => event.target.value && this.openAnalysis(event.target.value));
    byId('annotations').addEventListener('click', (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      this.select(this.annotations.pick(event.clientX - rect.left, event.clientY - rect.top));
    });
    this.video.addEventListener('loadedmetadata', () => this.layout());
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
    };
  }
}

const app = new MatchVisualizer();
window.__matchVisualizer = app;
app.start();
