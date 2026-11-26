/**
 * Panneau « Équipes » : pour chaque équipe, son nom, son maillot (palette vérifiée pour les
 * daltoniens) et celui de son gardien, calculé. Observateur du tableau tactique (patron Observer) :
 * les champs affichent toujours l'identité réelle, après une modification, une annulation ou un
 * refus. Une modification passe par l'action `choose`, qui crée une commande annulable.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { KIT_PALETTE } from './team-colors.mjs';
import { TEAM_NAME_MAX_LENGTH } from './tactics-board.mjs';

/**
 * Construit le panneau des équipes et le relie au tableau tactique.
 * @param {object} options
 * @param {HTMLElement} options.root conteneur du panneau
 * @param {import('./tactics-board.mjs').TacticsBoard} options.board
 * @param {(teamId: string, identity: {name: string, kit: string}) => void} options.choose action d'une
 *   modification (commande annulable) ; elle peut être refusée
 * @returns {{render: () => void, dispose: () => void}}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Interface HTML — panneau des équipes (observateur)
 */
export function createTeamPanel({ root, board, choose }) {
  const rows = board.teamIds.map((teamId) => {
    const row = document.createElement('div');
    row.className = `team-identity team-identity--${teamId}`;
    row.setAttribute('role', 'group');

    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Nom';
    const name = document.createElement('input');
    name.type = 'text';
    name.maxLength = TEAM_NAME_MAX_LENGTH;
    name.autocomplete = 'off';
    name.dataset.teamName = teamId;
    nameLabel.append(name);

    const kitLabel = document.createElement('label');
    kitLabel.textContent = 'Maillot';
    const kit = document.createElement('select');
    kit.dataset.teamKit = teamId;
    for (const [key, { label }] of Object.entries(KIT_PALETTE)) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = label;
      kit.append(option);
    }
    kitLabel.append(kit);

    const keeper = document.createElement('p');
    keeper.className = 'muted';
    keeper.dataset.teamKeeper = teamId;

    /** Demande le changement ; le panneau se remet à l'état réel juste après, accepté ou non. */
    const submit = () => {
      choose(teamId, { name: name.value, kit: kit.value });
      render();
    };
    name.addEventListener('change', submit);
    kit.addEventListener('change', submit);
    row.append(nameLabel, kitLabel, keeper);
    root.append(row);
    return { teamId, row, name, kit, keeper };
  });

  /** Affiche l'identité réelle de chaque équipe. */
  const render = () => {
    for (const { teamId, row, name, kit, keeper } of rows) {
      const identity = board.getIdentity(teamId);
      row.setAttribute('aria-label', `Équipe ${identity.name}`);
      name.value = identity.name;
      kit.value = identity.kit;
      keeper.textContent = `Gardien : maillot ${KIT_PALETTE[identity.goalkeeperKit].label.toLowerCase()}, distinct des deux équipes.`;
    }
  };
  const off = board.on('identitychange', render);
  render();
  return { render, dispose: off };
}
