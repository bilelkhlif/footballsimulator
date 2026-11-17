/**
 * Mesures tactiques simples, calculées sur les positions mesurées d'un joueur : vitesse,
 * direction, distance parcourue, centre de chaque équipe.
 *
 * Elles ne valent que ce que valent les positions : une calibration qui tremble donne des vitesses
 * fausses. Les écarts trop longs entre deux positions (joueur masqué, image non calibrée) ne sont
 * jamais comblés : la distance parcourue s'y interrompt. Un déplacement de plus de 12 m/s est écarté
 * de même : c'est un échange d'identifiants ou un saut de la calibration, pas une course (seuil
 * commun avec l'indicateur « déplacements invraisemblables » de l'analyse).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/** Durée minimale couverte pour mesurer une vitesse, en secondes. */
export const MIN_SPEED_SPAN_S = 0.3;

/** Écart maximal entre deux positions pour les relier, en secondes. */
export const MAX_SEGMENT_GAP_S = 0.5;

/** Vitesse au-delà de laquelle un déplacement est invraisemblable, en m/s (metrics.py). */
export const MAX_PLAUSIBLE_SPEED = 12;

/**
 * Indique si deux positions successives se relient : proches dans le temps, à une vitesse possible.
 * @param {{time: number, pitch: number[]}} a
 * @param {{time: number, pitch: number[]}} b
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — mesures tactiques (échanges d'identifiants)
 */
export function isPlausibleStep(a, b) {
  const gap = b.time - a.time;
  if (gap <= 0 || gap > MAX_SEGMENT_GAP_S) {
    return false;
  }
  return Math.hypot(b.pitch[0] - a.pitch[0], b.pitch[1] - a.pitch[1]) / gap <= MAX_PLAUSIBLE_SPEED;
}

/**
 * Vitesse moyenne d'un joueur sur la fenêtre qui précède un instant, mesurée sur la dernière suite
 * de positions reliées (isPlausibleStep) : un échange d'identifiants n'y donne pas de vitesse folle.
 * @param {{time: number, pitch: number[]}[]} history positions mesurées, dans l'ordre du temps
 * @param {number} time
 * @param {number} [window] durée de la fenêtre, en secondes
 * @returns {{speed: number, vx: number, vy: number}|null} en m/s, ou null si la suite est trop courte
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — mesures tactiques
 */
export function velocityAt(history, time, window = 1) {
  const points = history.filter((point) => point.time <= time + 1e-6 && point.time >= time - window - 1e-6);
  let start = points.length - 1;
  while (start > 0 && isPlausibleStep(points[start - 1], points[start])) {
    start -= 1;
  }
  if (points.length - start < 2) {
    return null;
  }
  const first = points[start];
  const last = points.at(-1);
  const span = last.time - first.time;
  if (span < MIN_SPEED_SPAN_S) {
    return null;
  }
  const vx = (last.pitch[0] - first.pitch[0]) / span;
  const vy = (last.pitch[1] - first.pitch[1]) / span;
  return { speed: Math.hypot(vx, vy), vx, vy };
}

/**
 * Distance parcourue, sans relier les positions séparées de plus de MAX_SEGMENT_GAP_S, ni celles
 * qu'un déplacement invraisemblable sépare.
 * @param {{time: number, pitch: number[]}[]} history
 * @returns {number} en mètres
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — mesures tactiques
 */
export function distanceCovered(history) {
  let distance = 0;
  for (let index = 1; index < history.length; index += 1) {
    const a = history[index - 1];
    const b = history[index];
    if (isPlausibleStep(a, b)) {
      distance += Math.hypot(b.pitch[0] - a.pitch[0], b.pitch[1] - a.pitch[1]);
    }
  }
  return distance;
}

/**
 * Centre de chaque équipe : moyenne des positions de ses joueurs (gardiens exclus).
 * @param {object[]} objects personnes d'une image
 * @returns {Map<number, number[]>} équipe → [x, y], pour les équipes d'au moins 3 joueurs placés
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — mesures tactiques
 */
export function teamCentroids(objects) {
  const sums = new Map();
  for (const object of objects) {
    if (object.role !== 'player' || object.team === null || !object.pitch) {
      continue;
    }
    const sum = sums.get(object.team) ?? { x: 0, y: 0, count: 0 };
    sum.x += object.pitch[0];
    sum.y += object.pitch[1];
    sum.count += 1;
    sums.set(object.team, sum);
  }
  const centroids = new Map();
  for (const [team, { x, y, count }] of sums) {
    if (count >= 3) {
      centroids.set(team, [x / count, y / count]);
    }
  }
  return centroids;
}

/**
 * Vitesse en km/h, à la française.
 * @param {number|null} metresPerSecond
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — mesures tactiques
 */
export function formatSpeed(metresPerSecond) {
  if (metresPerSecond === null || metresPerSecond === undefined) {
    return '—';
  }
  return `${(metresPerSecond * 3.6).toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km/h`;
}
