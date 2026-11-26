/**
 * Panneau « Analyse tactique » : les mesures de chaque équipe, en mètres réels (largeur,
 * profondeur, distance entre les lignes, surface occupée), et la ligne de hors-jeu de chaque équipe
 * qui attaque, recalculées à chaque changement du tableau tactique. Observateur (patron Observer) :
 * il lit le tableau et ne le modifie jamais. Un bouton affiche les lignes de hors-jeu sur le terrain.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { measureTeam } from './tactical-metrics.mjs';
import { computeOffside, describeOffside } from './offside.mjs';

/** Lignes du tableau : clé de la mesure, libellé, unité. */
export const METRIC_ROWS = Object.freeze([
  ['width', 'Largeur', 'm'],
  ['depth', 'Profondeur', 'm'],
  ['defenseToMidfield', 'Défense ↔ milieu', 'm'],
  ['midfieldToAttack', 'Milieu ↔ attaque', 'm'],
  ['area', 'Surface occupée', 'm²'],
]);

/**
 * Texte d'une mesure : arrondie au mètre, avec son unité ; un tiret si elle n'existe pas.
 * @param {number|null} value
 * @param {string} unit
 * @returns {string}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Interface HTML — panneau d'analyse tactique
 */
export function formatMetric(value, unit) {
  return value === null || !Number.isFinite(value) ? '—' : `${Math.round(value).toLocaleString('fr-FR')} ${unit}`;
}

/**
 * Construit le tableau des mesures et le relie au tableau tactique.
 * @param {object} options
 * @param {HTMLElement} options.root conteneur du panneau
 * @param {import('./tactics-board.mjs').TacticsBoard} options.board
 * @param {Array<{id: string, label: string}>} options.teams équipes (config.TEAMS)
 * @param {{visible: boolean}} [options.offsideLayer] lignes de hors-jeu en 3D, affichées par le bouton
 * @returns {{render: () => void, dispose: () => void}}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Interface HTML — panneau d'analyse tactique
 */
export function createAnalysisPanel({ root, board, teams, offsideLayer = null }) {
  const table = document.createElement('table');
  table.className = 'analysis-table';
  const caption = document.createElement('caption');
  caption.className = 'sr-only';
  caption.textContent = 'Mesures tactiques de chaque équipe, en mètres réels';
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const text of ['Mesure', ...teams.map((team) => team.label)]) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = text;
    headRow.append(cell);
  }
  head.append(headRow);
  const body = document.createElement('tbody');
  for (const [key, label] of METRIC_ROWS) {
    const row = document.createElement('tr');
    row.dataset.metric = key;
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = label;
    row.append(name);
    for (const team of teams) {
      const cell = document.createElement('td');
      cell.dataset.team = team.id;
      row.append(cell);
    }
    body.append(row);
  }
  table.append(caption, head, body);
  root.append(table);

  // Hors-jeu : une phrase par équipe qui attaque, et l'affichage des lignes sur le terrain.
  const offside = document.createElement('div');
  offside.className = 'offside-summary';
  const heading = document.createElement('h4');
  heading.textContent = 'Hors-jeu';
  offside.append(heading);
  const lines = teams.map((team) => {
    const line = document.createElement('p');
    line.dataset.offside = team.id;
    offside.append(line);
    return line;
  });
  if (offsideLayer) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'offside-toggle';
    toggle.className = 'button button--secondary';
    /** Libellé et état du bouton, d'après l'affichage réel des lignes. */
    const showToggle = () => {
      toggle.setAttribute('aria-pressed', String(offsideLayer.visible));
      toggle.textContent = offsideLayer.visible ? 'Masquer les lignes de hors-jeu' : 'Afficher les lignes de hors-jeu';
    };
    toggle.addEventListener('click', () => {
      offsideLayer.visible = !offsideLayer.visible;
      showToggle();
    });
    showToggle();
    offside.append(toggle);
  }
  root.append(offside);

  /** Recalcule et affiche les mesures des deux équipes. */
  const render = () => {
    const metrics = Object.fromEntries(teams.map((team) => [team.id, measureTeam(board, team.id)]));
    for (const row of body.children) {
      const [, , unit] = METRIC_ROWS.find(([key]) => key === row.dataset.metric);
      for (const cell of row.querySelectorAll('td')) {
        cell.textContent = formatMetric(metrics[cell.dataset.team][row.dataset.metric], unit);
      }
    }
    for (const line of lines) {
      line.textContent = describeOffside(computeOffside(board, line.dataset.offside));
    }
  };
  const offChange = board.on('change', render);
  const offPhase = board.on('phasechange', render);
  render();
  return { render, dispose: () => { offChange(); offPhase(); } };
}
