/**
 * Actions du joueur sélectionné (extraites de src/main.mjs à la phase 6) : « Point de vue » et
 * « Personnaliser le joueur », les deux boutons de la barre d'état qui apparaissent à côté de
 * « Désélectionner » quand un joueur est sélectionné, hors AR.
 *
 * - Point de vue : la même scène, vue à hauteur d'homme depuis la place du joueur
 *   (src/point-of-view.mjs). Mode d'affichage seulement : rien du tableau tactique ne change. Il ne
 *   s'ouvre que sur son bouton, jamais à la simple sélection ; sa barre dit qui l'on regarde et
 *   comment regarder autour.
 * - Personnaliser le joueur : coupe, couleur des cheveux et teint, avec aperçu immédiat en 3D
 *   (src/player-customization-panel.mjs) ; « Appliquer » crée une commande annulable
 *   (ChangePlayerAppearanceCommand), enregistrée avec la tactique.
 *
 * Les deux boutons suivent la sélection (patron Observer) et se masquent en AR, pendant le point de
 * vue et, pour le second, tant que son panneau est ouvert. Une session AR ferme les deux.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { ChangePlayerAppearanceCommand } from './commands.mjs';
import { postOfNumber } from './formations.mjs';
import { createPlayerCustomizationPanel } from './player-customization-panel.mjs';
import { teamName } from './team-identity.mjs';

/**
 * Aide de la barre du point de vue, selon que le curseur est verrouillé ou non.
 * @param {boolean} locked vrai quand la souris est capturée (pointer lock)
 * @returns {string}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Interface HTML — actions du joueur sélectionné
 */
export function describeLook(locked) {
  return locked
    ? 'Bougez la souris pour regarder autour · Échap rend le curseur.'
    : 'Cliquez sur le terrain puis bougez la souris, ou glissez au doigt, pour regarder autour.';
}

/**
 * Libellé d'un joueur : « Bleus · n° 9 · AC », équipe, numéro et poste dans la formation en place.
 * @param {import('./tactics-board.mjs').TacticsBoard} board
 * @param {string} teamId
 * @param {number} number
 * @returns {string}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Interface HTML — actions du joueur sélectionné
 */
export function playerLabel(board, teamId, number) {
  return `${teamName(teamId)} · n° ${number} · ${postOfNumber(board.getFormation(teamId), number)}`;
}

/**
 * Relie les boutons « Point de vue » et « Personnaliser le joueur » à la sélection, au point de
 * vue, au panneau de personnalisation et à la session AR.
 * @param {object} options
 * @param {Document} options.document document de la page
 * @param {{xr: {isPresenting: boolean, addEventListener?: Function}}} options.renderer
 * @param {import('./tactics-board.mjs').TacticsBoard} options.board
 * @param {import('./commands.mjs').CommandHistory} options.history
 * @param {import('./tactical-interaction.mjs').TacticalInteraction} options.interaction
 * @param {import('./point-of-view.mjs').PointOfView} options.pointOfView
 * @param {ReturnType<typeof import('./player-appearance-view.mjs').followPlayerAppearances>} options.appearanceView
 * @param {{flash: (message: string, kind: string) => void}} options.hint bandeau d'aide
 * @returns {{customization: ReturnType<typeof createPlayerCustomizationPanel>, refresh: () => void}}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Interface HTML — actions du joueur sélectionné
 */
export function wireSelectedPlayerActions({
  document, renderer, board, history, interaction, pointOfView, appearanceView, hint,
}) {
  const pointOfViewButton = document.getElementById('point-of-view');
  const pointOfViewBar = document.getElementById('point-of-view-bar');
  const pointOfViewTitle = pointOfViewBar.querySelector('[data-pov-title]');
  const pointOfViewHelp = pointOfViewBar.querySelector('[data-pov-help]');
  const customizeButton = document.getElementById('customize-player');

  const customization = createPlayerCustomizationPanel({
    root: document.getElementById('player-customization'),
    getAppearance: (teamId, number) => board.getAppearance(teamId, number),
    describe: (teamId, number) => playerLabel(board, teamId, number),
    preview: (teamId, number, appearance) => appearanceView.preview(teamId, number, appearance),
    clearPreview: () => appearanceView.clearPreview(),
    apply: (teamId, number, appearance) => {
      history.execute(new ChangePlayerAppearanceCommand({ board, teamId, number, appearance }));
      hint.flash(`n° ${number} des ${teamName(teamId)} personnalisé : « Annuler » rend son apparence d'avant.`, 'success');
    },
    onToggle: () => refresh(),
  });

  /** Les deux boutons suivent la sélection : un joueur sélectionné, hors AR et hors point de vue. */
  const refresh = () => {
    const selection = interaction.selection;
    const unavailable = selection?.type !== 'player' || renderer.xr.isPresenting || pointOfView.active;
    pointOfViewButton.hidden = unavailable;
    customizeButton.hidden = unavailable || customization.isOpen;
    if (!pointOfViewButton.hidden) {
      pointOfViewButton.setAttribute('aria-label', `Point de vue du n° ${selection.number} des ${teamName(selection.teamId)}`);
    }
    if (!customizeButton.hidden) {
      customizeButton.setAttribute('aria-label', `Personnaliser le n° ${selection.number} des ${teamName(selection.teamId)}`);
    }
  };
  interaction.on('statechange', refresh);

  customizeButton.addEventListener('click', () => {
    const selection = interaction.selection;
    if (selection?.type === 'player') {
      customization.open(selection);
    }
  });
  pointOfViewButton.addEventListener('click', () => {
    customization.cancel();
    if (!pointOfView.enter(interaction.selection)) {
      hint.flash('Point de vue indisponible pour cette sélection.', 'invalid');
    }
  });
  document.getElementById('point-of-view-exit').addEventListener('click', () => pointOfView.exit());
  pointOfView.on('change', ({ active, target }) => {
    pointOfViewBar.hidden = !active;
    if (active) {
      document.body.dataset.pointOfView = 'active';
      pointOfViewTitle.textContent = playerLabel(board, target.teamId, target.number);
      pointOfViewHelp.textContent = describeLook(false);
    } else {
      delete document.body.dataset.pointOfView;
      delete document.body.dataset.pointerLocked;
      hint.flash('Retour au terrain : la tactique est inchangée.', 'info');
    }
    refresh();
  });
  pointOfView.on('lockchange', ({ locked }) => {
    document.body.dataset.pointerLocked = String(locked);
    pointOfViewHelp.textContent = describeLook(locked);
  });
  // Une session AR ferme le point de vue et la personnalisation : la vue appartient au téléphone.
  renderer.xr.addEventListener?.('sessionstart', () => {
    pointOfView.exit();
    customization.cancel();
    refresh();
  });
  renderer.xr.addEventListener?.('sessionend', refresh);
  return { customization, refresh };
}
