/**
 * Mise en forme des valeurs affichées par le visualiseur de match : nombres, parts, instants,
 * calibration. Séparée de visualizer-main.js pour être testée sans navigateur.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/** Causes d'échec de la calibration, en clair. */
export const CALIBRATION_REASONS = Object.freeze({
  'too-few-keypoints': 'trop peu de repères du terrain visibles',
  'too-few-inliers': 'repères du terrain incohérents',
  'aligned-keypoints': 'repères alignés : une seule ligne visible',
  mirrored: 'repères incohérents (image en miroir)',
  'reprojection-error': 'erreur de reprojection trop grande',
  'homography-failed': 'homographie impossible',
  'no-pitch-detected': 'terrain non détecté',
});

/**
 * Formate un nombre à la française.
 * @param {number|null|undefined} value
 * @param {number} [digits]
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — interface
 */
export function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/**
 * Formate une part en pourcentage.
 * @param {number|null|undefined} share entre 0 et 1
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — interface
 */
export function formatShare(share) {
  return share === null || share === undefined ? '—' : `${Math.round(share * 100)} %`;
}

/**
 * Formate un instant de la vidéo : minutes, secondes et dixièmes.
 * @param {number} seconds
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — interface
 */
export function formatTime(seconds) {
  const safe = Math.max(seconds || 0, 0);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${(safe - minutes * 60).toFixed(1).padStart(4, '0').replace('.', ',')}`;
}

/**
 * Décrit la calibration d'une image, en clair.
 * @param {object|null} calibration
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — interface
 */
export function describeCalibration(calibration) {
  if (!calibration) {
    return 'Aucune image analysée à cet instant.';
  }
  if (calibration.status === 'ok') {
    return `Calibration réussie : ${calibration.inliers} repères cohérents sur ${calibration.keypoints}, `
      + `erreur ${formatNumber(calibration.errorPx)} px (${formatNumber(calibration.errorM, 2)} m).`;
  }
  const reason = CALIBRATION_REASONS[calibration.reason] ?? calibration.reason;
  return `Calibration impossible (${reason}) : aucune position sur le terrain pour cette image.`;
}
