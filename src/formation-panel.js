/**
 * Boutons de formation (sprint 4, BF4) : pour chaque équipe, un bouton par formation.
 *
 * Les boutons sont créés à partir du registre FORMATIONS : ajouter une stratégie (patron Strategy)
 * ajoute son bouton, sans toucher à l'interface. Un clic demande le changement au tableau tactique ;
 * le panneau ne se met à jour qu'à l'événement formationchange (patron Observer). Il affiche donc
 * toujours la formation réellement en place, quelle que soit l'origine du changement : un bouton,
 * une annulation ou une réinitialisation (sprint 5). Depuis le sprint 5, main.js fait passer le
 * clic par une commande (ChangeFormationCommand), pour qu'il soit annulable.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { FORMATIONS } from './formations.js';

/**
 * Remplit le panneau des formations et le relie au tableau tactique.
 * @param {object} options
 * @param {HTMLElement} options.root conteneur du panneau
 * @param {import('./tactics-board.js').TacticsBoard} options.board tableau tactique
 * @param {Array<{id: string, label: string}>} options.teams équipes (config.TEAMS)
 * @param {Record<string, HTMLElement>} [options.chips] pastille de chaque équipe dans le bandeau
 *   supérieur, qui affiche sa formation
 * @param {(teamId: string, name: string) => void} [options.choose] action d'un clic ; par défaut,
 *   le changement direct du tableau
 * @returns {{buttons: HTMLButtonElement[]}}
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Interface HTML — panneau des formations (observateur)
 */
export function createFormationPanel({ root, board, teams, chips = {}, choose = (teamId, name) => board.setFormation(teamId, name) }) {
  const buttons = [];
  for (const team of teams) {
    const row = document.createElement('div');
    row.className = `formation-row formation-row--${team.id}`;
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', `Formation des ${team.label}`);

    const label = document.createElement('span');
    label.className = 'formation-row__team';
    label.textContent = team.label;
    row.append(label);

    for (const name of Object.keys(FORMATIONS)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'formation-button';
      button.textContent = name;
      button.dataset.team = team.id;
      button.dataset.formation = name;
      button.addEventListener('click', () => choose(team.id, name));
      row.append(button);
      buttons.push(button);
    }
    root.append(row);
  }

  /** Marque la formation en place de chaque équipe, et l'écrit dans sa pastille. */
  const showCurrentFormations = () => {
    for (const button of buttons) {
      const current = board.getFormation(button.dataset.team).name;
      button.setAttribute('aria-pressed', String(current === button.dataset.formation));
    }
    for (const team of teams) {
      if (chips[team.id]) {
        chips[team.id].textContent = board.getFormation(team.id).name;
      }
    }
  };
  board.on('formationchange', showCurrentFormations);
  showCurrentFormations();
  return { buttons };
}
