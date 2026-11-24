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
 * Décrit le contrôle des identités de l'analyse (analysis/football_analysis/identity.py), en clair.
 * Sans contrôle (ancien résultat), le dit plutôt que d'annoncer zéro correction.
 * @param {object|null|undefined} identity mesures « identity » de l'analyse
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Visualiseur de match — interface (identités)
 */
export function describeIdentityCheck(identity) {
  if (identity?.synthetic) {
    const contacts = identity.scriptedContacts ?? [];
    const spans = contacts.map((contact) => `${formatNumber(contact.start)} à ${formatNumber(contact.end)} s`).join(', ');
    return `données synthétiques : ${contacts.length} contact${contacts.length > 1 ? 's' : ''} masqué${contacts.length > 1 ? 's' : ''} `
      + `scénarisé${contacts.length > 1 ? 's' : ''}${spans ? ` (${spans})` : ''}, d'identité incertaine ; aucun contrôle par l'IA.`;
  }
  if (!identity?.checked) {
    return 'non contrôlées (analyse antérieure) : un identifiant peut changer de joueur.';
  }
  const parts = [`${identity.swaps} échange${identity.swaps > 1 ? 's' : ''} corrigé${identity.swaps > 1 ? 's' : ''}`];
  if (identity.splits) {
    parts.push(`${identity.splits} trajectoire${identity.splits > 1 ? 's' : ''} séparée${identity.splits > 1 ? 's' : ''}`);
  }
  return `${parts.join(', ')} sur ${identity.contacts} contact${identity.contacts > 1 ? 's' : ''} masqué${identity.contacts > 1 ? 's' : ''} ; `
    + 'échanges entre coéquipiers non détectés.';
}

/**
 * Valeurs du joueur sélectionné qui dépendent de son identité : pendant un contact corrigé, qui est
 * qui n'est pas connu ; la vitesse n'est pas affichée, et la distance est signalée comme estimée.
 * @param {{identity?: string}|null|undefined} object observation du joueur à l'instant affiché
 * @param {string} speed vitesse déjà formatée
 * @param {number|null} distance distance cumulée, en mètres
 * @returns {{speed: string, distance: string, note: string|null}}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Visualiseur de match — interface (identités incertaines)
 */
export function describeIdentityValues(object, speed, distance) {
  const uncertain = object?.identity === 'uncertain';
  const metres = distance === null || distance === undefined ? null : formatNumber(distance, 0);
  if (!uncertain) {
    return { speed, distance: metres === null ? 'indisponible à cet instant' : `${metres} m mesurés`, note: null };
  }
  return {
    speed: '— (identité incertaine)',
    distance: metres === null ? 'indisponible à cet instant' : `≈ ${metres} m (estimation : identité incertaine)`,
    note: 'Contact entre deux joueurs : qui est qui n’est pas connu à cet instant.',
  };
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
  if (calibration.status === 'ok' && calibration.synthetic) {
    return `Calibration exacte par construction (vidéo synthétique) : ${calibration.keypoints} repères du terrain visibles.`;
  }
  if (calibration.status === 'ok') {
    // Erreur hors échantillon : chaque repère prédit sans lui. Ce n'est pas la précision des joueurs.
    return `Calibration réussie : ${calibration.inliers} repères cohérents sur ${calibration.keypoints}, `
      + `erreur hors échantillon ${formatNumber(calibration.holdoutErrorPx)} px (${formatNumber(calibration.holdoutErrorM, 2)} m) `
      + `sur les repères.`;
  }
  const reason = CALIBRATION_REASONS[calibration.reason] ?? calibration.reason;
  return `Calibration impossible (${reason}) : aucune position sur le terrain pour cette image.`;
}
