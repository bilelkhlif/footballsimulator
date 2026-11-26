/**
 * Boutons de formation (sprint 4, BF4) : pour chaque équipe, un bouton par formation.
 *
 * Les boutons sont créés à partir du registre FORMATIONS : ajouter une stratégie (patron Strategy)
 * ajoute son bouton, sans toucher à l'interface. Un clic demande le changement au tableau tactique ;
 * le panneau ne se met à jour qu'à l'événement formationchange (patron Observer). Il affiche donc
 * toujours la formation réellement en place, quelle que soit l'origine du changement : un bouton,
 * une annulation ou une réinitialisation (sprint 5). Depuis le sprint 5, main.mjs fait passer le
 * clic par une commande (ChangeFormationCommand), pour qu'il soit annulable.
 *
 * Sous les formations, trois boutons par équipe font basculer sa disposition : base, en possession
 * (le 4-3-3 devient un 2-3-5) et hors possession (4-5-1), par une commande annulable
 * (ChangePhaseCommand). Leurs libellés suivent la formation en place.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { FORMATIONS, PHASE_LABELS, PHASES } from './formations.mjs';

/**
 * Remplit le panneau des formations et le relie au tableau tactique.
 * @param {object} options
 * @param {HTMLElement} options.root conteneur du panneau
 * @param {import('./tactics-board.mjs').TacticsBoard} options.board tableau tactique
 * @param {Array<{id: string, label: string}>} options.teams équipes (config.TEAMS)
 * @param {Record<string, HTMLElement>} [options.chips] pastille de chaque équipe dans le bandeau
 *   supérieur, qui affiche sa formation
 * @param {(teamId: string, name: string) => void} [options.choose] action d'un clic ; par défaut,
 *   le changement direct du tableau
 * @param {(teamId: string, phase: string) => void} [options.choosePhase] action d'un bouton de phase ;
 *   par défaut, la bascule directe du tableau
 * @returns {{buttons: HTMLButtonElement[], phaseButtons: HTMLButtonElement[]}}
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Interface HTML — panneau des formations (observateur)
 */
export function createFormationPanel({
  root, board, teams, chips = {}, choose = (teamId, name) => board.setFormation(teamId, name),
  choosePhase = (teamId, phase) => board.setPhase(teamId, phase),
}) {
  const buttons = [];
  const phaseButtons = [];
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

    const phaseRow = document.createElement('div');
    phaseRow.className = `phase-row phase-row--${team.id}`;
    phaseRow.setAttribute('role', 'group');
    phaseRow.setAttribute('aria-label', `Disposition des ${team.label} : base, en possession ou hors possession`);
    for (const phase of Object.values(PHASES)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'phase-button';
      button.dataset.team = team.id;
      button.dataset.phase = phase;
      button.addEventListener('click', () => choosePhase(team.id, phase));
      phaseRow.append(button);
      phaseButtons.push(button);
    }
    root.append(phaseRow);
  }

  /** Marque la formation en place de chaque équipe, et l'écrit dans sa pastille. */
  const showCurrentFormations = () => {
    for (const button of buttons) {
      const current = board.getFormation(button.dataset.team).name;
      button.setAttribute('aria-pressed', String(current === button.dataset.formation));
    }
    for (const button of phaseButtons) {
      const { team, phase } = button.dataset;
      const formation = board.getFormation(team);
      // « En possession · 2-3-5 » : la phase et la disposition qu'elle donne à cette formation.
      button.textContent = phase === PHASES.BASE ? PHASE_LABELS[phase] : `${PHASE_LABELS[phase]} · ${formation.shapeName(phase)}`;
      button.setAttribute('aria-pressed', String(board.getPhase(team) === phase));
    }
    for (const team of teams) {
      if (chips[team.id]) {
        const formation = board.getFormation(team.id);
        const phase = board.getPhase(team.id);
        chips[team.id].textContent = phase === PHASES.BASE ? formation.name : `${formation.name} · ${formation.shapeName(phase)}`;
      }
    }
  };
  board.on('formationchange', showCurrentFormations);
  board.on('phasechange', showCurrentFormations);
  showCurrentFormations();
  return { buttons, phaseButtons };
}
