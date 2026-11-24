/**
 * Placement automatique du terrain 3D dans la vidéo : la zone de l'image la moins encombrée.
 *
 * Huit positions candidates (coins et milieux des bords) reçoivent une note d'encombrement :
 *
 * - les joueurs et le ballon détectés sur une fenêtre de temps (les deux secondes à venir pour une
 *   vidéo analysée), chacun pondéré par la part de sa boîte que le terrain 3D cacherait ;
 * - la part de la zone qui recouvre la pelouse, d'après la calibration : à encombrement égal,
 *   mieux vaut cacher les tribunes que le jeu.
 *
 * Le terrain ne change de place que si une autre position est nettement meilleure, et pas plus
 * d'une fois toutes les quelques secondes : il ne doit pas sauter d'un coin à l'autre.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/** Positions candidates, relatives à la zone libre : coins et milieux des bords. */
export const ANCHORS = Object.freeze([[0, 0], [0.5, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]]);

/** Poids de chaque élément caché, par rôle. */
export const WEIGHTS = Object.freeze({ player: 1, goalkeeper: 1, referee: 0.5, ball: 3, selected: 4 });

/** Poids de la pelouse cachée, pour une zone entièrement posée sur le terrain. */
export const PITCH_WEIGHT = 0.6;

/**
 * Rectangles candidats, de la taille du panneau, dans la zone donnée.
 * @param {{width: number, height: number}} area zone d'affichage de la vidéo
 * @param {{width: number, height: number}} size taille du panneau
 * @param {number} [margin] marge aux bords, en pixels
 * @returns {{x: number, y: number, width: number, height: number}[]}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — placement automatique du terrain 3D
 */
export function candidateRects(area, size, margin = 12) {
  const freeX = Math.max(area.width - size.width - 2 * margin, 0);
  const freeY = Math.max(area.height - size.height - 2 * margin, 0);
  return ANCHORS.map(([ax, ay]) => ({
    x: margin + ax * freeX, y: margin + ay * freeY, width: size.width, height: size.height,
  }));
}

/**
 * Aire commune à deux rectangles.
 * @param {{x: number, y: number, width: number, height: number}} a
 * @param {{x: number, y: number, width: number, height: number}} b
 * @returns {number}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — placement automatique du terrain 3D
 */
export function overlapArea(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * Part de la zone posée sur la pelouse, estimée sur une grille de points.
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @param {(x: number, y: number) => boolean} isOnPitch point d'affichage sur le terrain ?
 * @param {number} [columns]
 * @param {number} [rows]
 * @returns {number} entre 0 et 1
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — placement automatique du terrain 3D
 */
export function pitchCoverage(rect, isOnPitch, columns = 6, rows = 4) {
  let inside = 0;
  for (let i = 0; i < columns; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      inside += isOnPitch(rect.x + ((i + 0.5) / columns) * rect.width, rect.y + ((j + 0.5) / rows) * rect.height) ? 1 : 0;
    }
  }
  return inside / (columns * rows);
}

/**
 * Note d'encombrement de chaque rectangle candidat : plus elle est basse, mieux c'est.
 * @param {{x: number, y: number, width: number, height: number}[]} candidates
 * @param {{x: number, y: number, width: number, height: number, weight: number}[]} boxes éléments
 *   détectés, en coordonnées d'affichage, déjà pondérés (et divisés par le nombre d'images)
 * @param {((x: number, y: number) => boolean)|null} isOnPitch null sans calibration
 * @returns {number[]}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — placement automatique du terrain 3D
 */
export function scoreRegions(candidates, boxes, isOnPitch) {
  return candidates.map((rect) => {
    let score = 0;
    for (const box of boxes) {
      const area = box.width * box.height;
      if (area > 0) {
        score += (box.weight * overlapArea(rect, box)) / area;
      }
    }
    return isOnPitch ? score + PITCH_WEIGHT * pitchCoverage(rect, isOnPitch) : score;
  });
}

/**
 * Applique une homographie (9 nombres, ligne par ligne) à un point.
 * @param {number[]} h homographie de l'image vers le terrain
 * @param {number} x
 * @param {number} y
 * @returns {number[]|null} [x, y] sur le terrain, ou null si le point est derrière la caméra
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — placement automatique du terrain 3D
 */
export function applyHomography(h, x, y) {
  const w = h[6] * x + h[7] * y + h[8];
  if (!(Math.abs(w) > 1e-9)) {
    return null;
  }
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

/**
 * Choisit la position du terrain 3D, avec hystérésis.
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — placement automatique du terrain 3D
 */
export class AutoPlacer {
  /**
   * @param {object} [options]
   * @param {number} [options.switchRatio] la nouvelle position doit être au moins aussi bonne que
   *   ce rapport de la note actuelle
   * @param {number} [options.minGain] gain minimal, en « joueurs cachés »
   * @param {number} [options.holdSeconds] délai minimal entre deux déplacements, en temps de vidéo
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — placement automatique du terrain 3D
   */
  constructor({ switchRatio = 0.6, minGain = 0.3, holdSeconds = 3 } = {}) {
    this.switchRatio = switchRatio;
    this.minGain = minGain;
    this.holdSeconds = holdSeconds;
    this.current = null;
    this.lastSwitch = -Infinity;
    this.lastTime = null;
  }

  /**
   * Choisit l'indice de la position candidate, en gardant l'actuelle sauf gain net. Après un
   * saut dans la vidéo (plus d'une seconde d'écart avec l'appel précédent), le choix est immédiat.
   * @param {number[]} scores notes des candidats
   * @param {number} time instant de la vidéo, en secondes
   * @returns {number}
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — placement automatique du terrain 3D
   */
  choose(scores, time) {
    let best = 0;
    for (let index = 1; index < scores.length; index += 1) {
      if (scores[index] < scores[best] - 1e-9) {
        best = index;
      }
    }
    const current = this.current;
    const jumped = this.lastTime === null || Math.abs(time - this.lastTime) > 1;
    this.lastTime = time;
    if (current === null || jumped) {
      this.current = best;
      this.lastSwitch = time;
      return best;
    }
    const gain = scores[current] - scores[best];
    const clearlyBetter = scores[best] <= scores[current] * this.switchRatio && gain >= this.minGain;
    if (best !== current && clearlyBetter && time - this.lastSwitch >= this.holdSeconds) {
      this.current = best;
      this.lastSwitch = time;
    }
    return this.current;
  }

  /**
   * Oublie la position actuelle : le prochain choix sera immédiat.
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — placement automatique du terrain 3D
   */
  reset() {
    this.current = null;
    this.lastSwitch = -Infinity;
    this.lastTime = null;
  }
}
