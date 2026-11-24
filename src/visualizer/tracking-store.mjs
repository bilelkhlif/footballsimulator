/**
 * Données de suivi dans le navigateur : le document produit par l'analyse (analysis/), ou les
 * messages d'un futur flux en direct, au même format (analysis/football_analysis/contract.py).
 *
 * Synchronisation : la vidéo donne l'instant de l'image affichée ; le magasin renvoie l'état des
 * joueurs à cet instant. Entre deux images analysées, boîtes et positions sont interpolées
 * linéairement, mais seulement si le même joueur est présent dans les deux, dans le même plan, et
 * si les deux analyses sont consécutives. Sinon, l'image analysée la plus proche est rendue telle
 * quelle : aucune position n'est inventée là où l'analyse n'en a pas.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/** Format et version attendus. */
export const TRACKING_FORMAT = 'football-tracking';
export const TRACKING_VERSION = 1;

/** Écart maximal entre deux analyses interpolées, en intervalles d'analyse (une analyse manquée au-delà). */
export const MAX_GAP_INTERVALS = 1.5;

/**
 * Interpolation linéaire de deux tableaux de nombres de même longueur.
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} t entre 0 et 1
 * @returns {number[]}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — données de suivi (synchronisation)
 */
export function lerpArray(a, b, t) {
  return a.map((value, index) => value + (b[index] - value) * t);
}

/**
 * Magasin des données de suivi d'une vidéo.
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — données de suivi
 */
export class TrackingStore {
  /**
   * @param {object} header en-tête : source, analysis, pitch (contract.py)
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — données de suivi
   */
  constructor(header) {
    if (header.format !== TRACKING_FORMAT || header.version !== TRACKING_VERSION) {
      throw new Error(`Format de suivi inattendu : ${header.format} ${header.version}`);
    }
    this.source = header.source;
    this.analysis = header.analysis;
    this.pitch = header.pitch;
    /** @type {object[]} images analysées, dans l'ordre du temps */
    this.frames = [];
    this.teams = [];
    /** @type {Map<number, object>} */
    this.tracks = new Map();
    this.metrics = null;
    this.limitations = [];
  }

  /**
   * Construit un magasin à partir d'un document complet (vidéo téléversée).
   * @param {object} document
   * @returns {TrackingStore}
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — données de suivi
   */
  static fromDocument(document) {
    const store = new TrackingStore(document);
    for (const frame of document.frames) {
      store.append(frame);
    }
    store.applySummary(document);
    return store;
  }

  /**
   * Reçoit un message d'un flux en direct : en-tête (ignoré ici), image ou résumé.
   * @param {{type: string}} message
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — données de suivi (flux en direct)
   */
  ingest(message) {
    if (message.type === 'frame') {
      const { type, ...frame } = message;
      this.append(frame);
    } else if (message.type === 'summary') {
      this.applySummary(message);
    }
  }

  /**
   * Ajoute une image analysée, en gardant l'ordre du temps.
   * @param {object} frame
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — données de suivi
   */
  append(frame) {
    const last = this.frames.at(-1);
    if (!last || frame.time >= last.time) {
      this.frames.push(frame);
      return;
    }
    this.frames.splice(this.indexAt(frame.time) + 1, 0, frame);
  }

  /**
   * Recopie le résumé : équipes, trajectoires, mesures, limites.
   * @param {object} summary
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — données de suivi
   */
  applySummary(summary) {
    this.teams = summary.teams ?? [];
    this.tracks = new Map((summary.tracks ?? []).map((track) => [track.id, track]));
    this.metrics = summary.metrics ?? null;
    this.limitations = summary.limitations ?? [];
  }

  /**
   * Intervalle entre deux images analysées, en secondes.
   * @returns {number}
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — données de suivi
   */
  get interval() {
    return (this.analysis?.stride ?? 1) / this.source.fps;
  }

  /**
   * Indice de la dernière image analysée à l'instant donné ou avant, ou -1.
   * @param {number} time en secondes
   * @returns {number}
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — données de suivi (synchronisation)
   */
  indexAt(time) {
    let low = 0;
    let high = this.frames.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (this.frames[middle].time <= time + 1e-6) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found;
  }

  /**
   * Image analysée la plus proche de l'instant, si elle en est à moins d'un intervalle.
   * @param {number} time
   * @returns {object|null}
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — données de suivi (synchronisation)
   */
  nearestFrame(time) {
    const index = this.indexAt(time);
    const candidates = [this.frames[index], this.frames[index + 1]].filter(Boolean);
    let best = null;
    for (const frame of candidates) {
      if (!best || Math.abs(frame.time - time) < Math.abs(best.time - time)) {
        best = frame;
      }
    }
    return best && Math.abs(best.time - time) <= this.interval ? best : null;
  }

  /**
   * État des joueurs et du ballon à un instant de la vidéo.
   * @param {number} time instant de l'image affichée, en secondes
   * @returns {{time: number, frame: object|null, objects: object[], ball: object|null,
   *   interpolated: boolean}} `frame` est l'image analysée la plus proche (calibration, plan)
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — données de suivi (synchronisation)
   */
  sample(time) {
    const frame = this.nearestFrame(time);
    if (!frame) {
      return { time, frame: null, objects: [], ball: null, interpolated: false };
    }
    const index = this.indexAt(time);
    const previous = this.frames[index];
    const next = this.frames[index + 1];
    const consecutive = previous && next && previous.shot === next.shot && !next.cut
      && next.time - previous.time <= this.interval * MAX_GAP_INTERVALS + 1e-6;
    if (!consecutive || time <= previous.time) {
      return { time, frame, objects: frame.objects, ball: frame.ball, interpolated: false };
    }
    const t = (time - previous.time) / (next.time - previous.time);
    const other = frame === previous ? next : previous;
    const othersById = new Map(other.objects.map((object) => [object.id, object]));
    const objects = frame.objects.map((object) => {
      const match = othersById.get(object.id);
      if (!match) {
        return object;
      }
      const [from, to] = frame === previous ? [object, match] : [match, object];
      const pitch = from.pitch && to.pitch ? lerpArray(from.pitch, to.pitch, t) : object.pitch;
      return { ...object, box: lerpArray(from.box, to.box, t), pitch };
    });
    let { ball } = frame;
    if (previous.ball && next.ball) {
      ball = {
        ...frame.ball,
        box: lerpArray(previous.ball.box, next.ball.box, t),
        pitch: previous.ball.pitch && next.ball.pitch ? lerpArray(previous.ball.pitch, next.ball.pitch, t) : frame.ball.pitch,
      };
    }
    return { time, frame, objects, ball, interpolated: true };
  }

  /**
   * Images analysées entre deux instants, bornes comprises.
   * @param {number} from
   * @param {number} to
   * @returns {object[]}
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — données de suivi
   */
  framesBetween(from, to) {
    const start = Math.max(this.indexAt(from - 1e-6), 0);
    const frames = [];
    for (let index = start; index < this.frames.length && this.frames[index].time <= to; index += 1) {
      if (this.frames[index].time >= from - 1e-6) {
        frames.push(this.frames[index]);
      }
    }
    return frames;
  }

  /**
   * Positions mesurées d'un joueur sur le terrain entre deux instants, dans son plan.
   * @param {number} trackId
   * @param {number} from
   * @param {number} to
   * @returns {{time: number, pitch: number[]}[]}
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — données de suivi (traces)
   */
  history(trackId, from, to) {
    const points = [];
    for (const frame of this.framesBetween(from, to)) {
      const object = frame.objects.find((candidate) => candidate.id === trackId);
      if (object?.pitch) {
        points.push({ time: frame.time, pitch: object.pitch });
      }
    }
    return points;
  }

  /**
   * Positions mesurées de tous les joueurs entre deux instants, en un seul parcours.
   * @param {number} from
   * @param {number} to
   * @returns {Map<number, {time: number, pitch: number[]}[]>}
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — données de suivi (traces)
   */
  histories(from, to) {
    const histories = new Map();
    for (const frame of this.framesBetween(from, to)) {
      for (const object of frame.objects) {
        if (object.pitch) {
          if (!histories.has(object.id)) {
            histories.set(object.id, []);
          }
          histories.get(object.id).push({ time: frame.time, pitch: object.pitch });
        }
      }
    }
    return histories;
  }

  /**
   * Couleur d'une équipe (0 ou 1), ou null si elle est inconnue.
   * @param {number|null} team
   * @returns {string|null}
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — données de suivi
   */
  teamColor(team) {
    return this.teams.find((candidate) => candidate.id === team)?.color ?? null;
  }
}
