/**
 * Barre d'outils tactique et retours à l'utilisateur (sprint 5).
 *
 * La barre réunit les modes (déplacer, passe, course) et l'historique (annuler, rétablir,
 * réinitialiser). Elle observe l'interaction et l'historique (patron Observer) : le mode actif est
 * marqué (aria-pressed), et « Annuler » ou « Rétablir » ne sont actifs que s'il y a une action à
 * défaire ou à refaire, avec son nom dans l'infobulle.
 *
 * Le bandeau d'aide montre ce qu'il faut faire dans l'état courant, et, pendant 2,5 s, le retour
 * du dernier geste : sélection, action faite, ou action refusée (hors du terrain, flèche trop
 * courte).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { ResetBoardCommand } from './commands.js';
import { INTERACTION_STATES, selectionLabel } from './tactical-interaction.js';

/** Durée d'affichage d'un retour dans le bandeau d'aide, en millisecondes. */
export const FEEDBACK_DURATION_MS = 2500;

/** Nom des modes de flèche dans l'aide. */
const ARROW_NAMES = Object.freeze({ pass: 'Passe', run: 'Course' });

/**
 * Texte d'aide pour l'état courant de l'interaction.
 * @param {{mode: string, state: string, selection: object|null}} interaction état (statechange)
 * @param {{inAr?: boolean}} [options] vrai en AR, où l'on ne fait pas tourner la vue au doigt
 * @returns {string} aide, vide si l'interaction est coupée
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Interface HTML — aide de l'interaction tactique
 */
export function describeGuidance({ mode, state, selection }, { inAr = false } = {}) {
  switch (state) {
    case INTERACTION_STATES.IDLE:
      return inAr
        ? 'Touchez un joueur ou le ballon pour le déplacer.'
        : 'Touchez un joueur ou le ballon pour le déplacer ; glissez pour tourner la vue.';
    case INTERACTION_STATES.SELECTED: {
      const name = selectionLabel(selection);
      return `${name.charAt(0).toUpperCase()}${name.slice(1)} sélectionné : touchez sa nouvelle place.`;
    }
    case INTERACTION_STATES.ARROW_START:
      return `${ARROW_NAMES[mode]} : touchez le point de départ, sur un joueur ou sur le gazon.`;
    case INTERACTION_STATES.ARROW_END:
      return `${ARROW_NAMES[mode]} : touchez le point d’arrivée.`;
    default:
      return '';
  }
}

/**
 * Pilote le bandeau d'aide : un texte de base, remplacé quelques instants par un retour.
 * @param {HTMLElement} element bandeau d'aide (#hint)
 * @param {object} [options]
 * @param {number} [options.duration] durée d'un retour, en millisecondes
 * @param {(callback: () => void, ms: number) => unknown} [options.setTimer] remplacé dans les tests
 * @param {(timer: unknown) => void} [options.clearTimer]
 * @returns {{readonly base: string, setBase: (text: string, options?: {force?: boolean}) => void,
 *   flash: (text: string, kind?: string) => void}}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Interface HTML — retours à l'utilisateur
 */
export function createHintController(element, {
  duration = FEEDBACK_DURATION_MS, setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  let base = element.textContent;
  let timer = null;
  /** Revient au texte de base et efface la couleur du retour. */
  const showBase = () => {
    timer = null;
    element.textContent = base;
    delete element.dataset.feedback;
  };
  return {
    get base() {
      return base;
    },
    // Nouveau texte de base ; un retour en cours reste affiché jusqu'à sa fin, sauf force.
    setBase(text, { force = false } = {}) {
      base = text;
      if (timer === null) {
        showBase();
      } else if (force) {
        clearTimer(timer);
        showBase();
      }
    },
    // Retour d'un geste : info, success ou invalid (couleur du bandeau).
    flash(text, kind = 'info') {
      if (timer !== null) {
        clearTimer(timer);
      }
      element.textContent = text;
      element.dataset.feedback = kind;
      timer = setTimer(showBase, duration);
    },
  };
}

/**
 * Relie la barre d'outils à l'interaction, à l'historique et au tableau.
 * @param {object} options
 * @param {HTMLElement} options.root barre d'outils (#tactical-toolbar)
 * @param {import('./tactical-interaction.js').TacticalInteraction} options.interaction
 * @param {import('./commands.js').CommandHistory} options.history
 * @param {import('./tactics-board.js').TacticsBoard} options.board
 * @param {(feedback: {kind: string, message: string}) => void} [options.onFeedback] retour d'une action
 * @returns {{modeButtons: HTMLButtonElement[], undoButton: HTMLButtonElement,
 *   redoButton: HTMLButtonElement, resetButton: HTMLButtonElement}}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Interface HTML — barre d'outils tactique (observateur)
 */
export function createTacticalToolbar({ root, interaction, history, board, onFeedback = () => {} }) {
  const modeButtons = [...root.querySelectorAll('[data-mode]')];
  const undoButton = root.querySelector('[data-action="undo"]');
  const redoButton = root.querySelector('[data-action="redo"]');
  const resetButton = root.querySelector('[data-action="reset"]');

  for (const button of modeButtons) {
    button.addEventListener('click', () => interaction.setMode(button.dataset.mode));
  }
  undoButton.addEventListener('click', () => {
    const command = history.undo();
    if (command) {
      onFeedback({ kind: 'info', message: `Annulé : ${command.label}.` });
    }
  });
  redoButton.addEventListener('click', () => {
    const command = history.redo();
    if (command) {
      onFeedback({ kind: 'info', message: `Rétabli : ${command.label}.` });
    }
  });
  resetButton.addEventListener('click', () => {
    interaction.cancel();
    if (history.execute(new ResetBoardCommand({ board }))) {
      onFeedback({ kind: 'success', message: 'Terrain réinitialisé ; « Annuler » le rétablit.' });
    }
  });

  /** Marque le mode actif. */
  const showMode = () => {
    for (const button of modeButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === interaction.mode));
    }
  };
  /** Active Annuler, Rétablir et Réinitialiser selon l'historique et l'état du tableau. */
  const showHistory = () => {
    undoButton.disabled = !history.canUndo;
    undoButton.title = history.undoLabel ? `Annuler : ${history.undoLabel}` : 'Rien à annuler';
    redoButton.disabled = !history.canRedo;
    redoButton.title = history.redoLabel ? `Rétablir : ${history.redoLabel}` : 'Rien à rétablir';
    resetButton.disabled = board.isInInitialState();
  };
  interaction.on('statechange', showMode);
  history.on('change', showHistory);
  board.on('change', showHistory);
  showMode();
  showHistory();
  return { modeButtons, undoButton, redoButton, resetButton };
}
