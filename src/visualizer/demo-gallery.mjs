/**
 * Galerie des matchs de démonstration et masquage des positions d'une calibration rejetée.
 *
 * Les cartes reprennent le catalogue (demo/index.json) : vignette, catégorie, durée, crédit de la
 * vidéo, verdict du contrôle visuel de la calibration et indicateurs de qualité calculés à l'export
 * depuis les mesures de l'analyse. Rien n'est saisi à la main dans ces chiffres.
 * Le masquage ne modifie aucune donnée : le visualiseur transmet au terrain 3D une copie de l'image
 * analysée marquée « non calibrée », si bien qu'aucune position, vitesse ou distance fausse n'est montrée.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/** Libellés courts des verdicts du contrôle visuel de la calibration. */
export const VERDICT_LABELS = Object.freeze({
  approximate: 'Calibration approximative',
  rejected: 'Positions 3D masquées',
  exact: 'Données synthétiques',
});

/**
 * Libellés courts des verdicts du contrôle visuel des équipes (planche d'une vignette par trajectoire,
 * rangée par équipe attribuée) : aucune erreur relevée, quelques erreurs chiffrées dans la note,
 * équipes fausses, ou vidéo synthétique annotée.
 */
export const TEAM_VERDICT_LABELS = Object.freeze({
  verified: 'Équipes vérifiées',
  partial: 'Équipes : quelques erreurs',
  wrong: 'Équipes fausses',
  exact: 'Équipes exactes',
});

/**
 * Durée lisible : 26 s, 1 min 05 s.
 * @param {number|null|undefined} seconds
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Visualiseur de match — galerie des démonstrations
 */
export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  const total = Math.round(seconds);
  return total < 60 ? `${total} s` : `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, '0')} s`;
}

/**
 * Pourcentage arrondi, à la française.
 * @param {number|null|undefined} share
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Visualiseur de match — galerie des démonstrations
 */
function percent(share) {
  return typeof share === 'number' && Number.isFinite(share) ? `${Math.round(share * 100)} %` : '—';
}

/**
 * Indicateurs d'une carte : calibration, déplacements invraisemblables, coupures, continuité du suivi.
 * Le ton signale la fiabilité : good, warn ou bad (seuils documentés dans docs/visualiseur-demos-reelles.md).
 * @param {object|null} quality indicateurs du catalogue (gallery_quality côté Python)
 * @param {{verdict: string}|null} check verdict du contrôle visuel
 * @returns {{key: string, label: string, value: string, tone: string, title: string}[]}
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Visualiseur de match — galerie des démonstrations
 */
export function describeQuality(quality, check = null) {
  if (!quality) {
    return [];
  }
  const chips = [];
  if (quality.calibratedShare !== undefined) {
    const rejected = check?.verdict === 'rejected';
    chips.push({
      key: 'calibration', label: 'Calibré', value: percent(quality.calibratedShare),
      tone: rejected ? 'bad' : quality.calibratedShare >= 0.9 ? 'good' : 'warn',
      title: rejected ? 'Images calibrées, mais calibration jugée fausse au contrôle visuel'
        : 'Part des images analysées dont la calibration a réussi',
    });
  }
  if (quality.implausibleSpeedShare !== undefined && quality.implausibleSpeedShare !== null) {
    const share = quality.implausibleSpeedShare;
    chips.push({
      key: 'implausible', label: '> 12 m/s', value: percent(share),
      tone: share < 0.1 ? 'good' : share < 0.3 ? 'warn' : 'bad',
      title: 'Part des déplacements mesurés au-delà de 12 m/s : tremblement de calibration ou échange d\'identité',
    });
  }
  if (typeof quality.knownTeamShare === 'number') {
    // Deux équipes attendues : un classement où presque tous les joueurs d'une image sont dans la même
    // équipe trahit un regroupement faux, même avec beaucoup de joueurs « classés ».
    const balanced = typeof quality.teamMajorityShare !== 'number' || quality.teamMajorityShare <= 0.7;
    chips.push({
      key: 'teams', label: 'Équipes', value: percent(quality.knownTeamShare),
      tone: !balanced ? 'bad' : quality.knownTeamShare >= 0.85 ? 'good' : 'warn',
      title: balanced ? 'Part des observations de joueurs dont l\'équipe est connue'
        : `Équipes déséquilibrées : ${percent(quality.teamMajorityShare)} des joueurs d'une image dans la même équipe`,
    });
  }
  if (quality.medianTrackSeconds !== undefined && quality.medianTrackSeconds !== null) {
    chips.push({
      key: 'continuity', label: 'Suivi', value: `${quality.medianTrackSeconds.toFixed(1).replace('.', ',')} s`,
      tone: quality.medianTrackSeconds >= 3 ? 'good' : 'warn',
      title: 'Durée médiane d\'une trajectoire avant perte ou changement d\'identifiant',
    });
  }
  if (quality.cuts !== undefined && quality.cuts !== null) {
    chips.push({
      key: 'cuts', label: 'Coupures', value: String(quality.cuts), tone: 'neutral',
      title: 'Changements de plan détectés : le suivi repart à zéro à chacun',
    });
  }
  return chips;
}

/**
 * Copie d'une image analysée sans calibration : le terrain 3D n'y place ni joueur ni ballon.
 * @param {{frame: object|null, objects: object[], ball: object|null}} sample
 * @returns {{frame: object|null, objects: object[], ball: object|null}}
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Visualiseur de match — calibration rejetée
 */
export function maskUncalibrated(sample) {
  if (!sample?.frame) {
    return sample;
  }
  return { ...sample, frame: { ...sample.frame, calibration: { status: 'failed', reason: 'calibration-rejected' } } };
}

/**
 * Crée les cartes de la galerie ; un clic ou Entrée ouvre le match.
 * @param {HTMLElement} list liste (ul) de la galerie
 * @param {object[]} demos démonstrations (StaticAnalysisSource.listAnalyses)
 * @param {{selectedId?: string|null, onSelect: (id: string) => void}} options
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Visualiseur de match — galerie des démonstrations
 */
export function renderGallery(list, demos, { selectedId = null, onSelect }) {
  const items = demos.map((demo) => {
    const item = document.createElement('li');
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'vz-match';
    card.dataset.demoId = demo.id;
    card.setAttribute('aria-pressed', String(demo.id === selectedId));
    const figure = document.createElement('span');
    figure.className = 'vz-match__media';
    if (demo.thumbnailUrl) {
      const image = document.createElement('img');
      image.src = demo.thumbnailUrl;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.width = 320;
      image.height = 180;
      image.addEventListener('error', () => image.remove(), { once: true });
      figure.append(image);
    }
    const duration = document.createElement('span');
    duration.className = 'vz-match__duration';
    duration.textContent = formatDuration(demo.duration);
    figure.append(duration);
    if (demo.category) {
      const category = document.createElement('span');
      category.className = 'vz-match__category';
      category.textContent = demo.category;
      figure.append(category);
    }
    const body = document.createElement('span');
    body.className = 'vz-match__body';
    const title = document.createElement('span');
    title.className = 'vz-match__title';
    title.textContent = demo.name;
    body.append(title);
    const verdicts = document.createElement('span');
    verdicts.className = 'vz-match__verdicts';
    if (demo.calibrationCheck) {
      const verdict = document.createElement('span');
      verdict.className = 'vz-match__verdict';
      verdict.dataset.verdict = demo.calibrationCheck.verdict;
      verdict.textContent = VERDICT_LABELS[demo.calibrationCheck.verdict] ?? demo.calibrationCheck.verdict;
      verdict.title = demo.calibrationCheck.note;
      verdicts.append(verdict);
    }
    if (demo.teamCheck) {
      const verdict = document.createElement('span');
      verdict.className = 'vz-match__verdict';
      verdict.dataset.kind = 'teams';
      verdict.dataset.verdict = demo.teamCheck.verdict;
      verdict.textContent = TEAM_VERDICT_LABELS[demo.teamCheck.verdict] ?? demo.teamCheck.verdict;
      verdict.title = demo.teamCheck.note;
      verdicts.append(verdict);
    }
    if (verdicts.childElementCount) {
      body.append(verdicts);
    }
    const chips = describeQuality(demo.quality, demo.calibrationCheck);
    if (chips.length) {
      const row = document.createElement('span');
      row.className = 'vz-match__quality';
      for (const chip of chips) {
        const element = document.createElement('span');
        element.className = 'vz-metric';
        element.dataset.tone = chip.tone;
        element.dataset.metric = chip.key;
        element.title = chip.title;
        element.textContent = `${chip.label} ${chip.value}`;
        row.append(element);
      }
      body.append(row);
    }
    if (demo.description) {
      const description = document.createElement('span');
      description.className = 'vz-match__description';
      description.textContent = demo.description;
      body.append(description);
    }
    if (demo.credit) {
      const credit = document.createElement('span');
      credit.className = 'vz-match__credit';
      credit.textContent = demo.credit;
      body.append(credit);
    }
    card.append(figure, body);
    card.addEventListener('click', () => onSelect(demo.id));
    item.append(card);
    return item;
  });
  list.replaceChildren(...items);
}

/**
 * Marque la carte du match ouvert ; aucune si l'analyse vient du serveur local.
 * @param {HTMLElement} list
 * @param {string|null} id
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Visualiseur de match — galerie des démonstrations
 */
export function markSelected(list, id) {
  for (const card of list.querySelectorAll('.vz-match')) {
    card.setAttribute('aria-pressed', String(card.dataset.demoId === id));
  }
}
