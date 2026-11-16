/**
 * Panneau de la séquence animée (sprint 6, bonus BF9) : enregistrer des images clés, lire l'action,
 * la mettre en pause, la recommencer, changer de vitesse et effacer la séquence.
 *
 * Les images clés passent par des commandes annulables (src/commands.js) ; la lecture, par le
 * lecteur (src/sequence-player.js). Le panneau observe la séquence et le lecteur (patron
 * Observer) : boutons actifs, libellé Lecture / Pause, vitesse marquée et état écrit en clair.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { AddKeyframeCommand, ClearSequenceCommand } from './commands.js';
import { MAX_KEYFRAMES } from './tactical-sequence.js';
import { PLAYBACK_STATES } from './sequence-player.js';

/**
 * Vitesse écrite à la française : « 0,5× », « 1× », « 2× ».
 * @param {number} speed
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Interface HTML — panneau de la séquence (BF9)
 */
export function formatSpeed(speed) {
  return `${String(speed).replace('.', ',')}×`;
}

/**
 * État de la séquence et de la lecture, en clair.
 * @param {{length: number, state: string, ended: boolean, step: number, steps: number, speed: number}} status
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Interface HTML — panneau de la séquence (BF9)
 */
export function describeSequence({ length, state, ended, step, steps, speed }) {
  if (state === PLAYBACK_STATES.PLAYING) {
    return `Lecture : étape ${step} sur ${steps}, vitesse ${formatSpeed(speed)}.`;
  }
  if (state === PLAYBACK_STATES.PAUSED) {
    return ended ? 'Fin de l’action : « Lecture » la rejoue.' : `En pause : étape ${step} sur ${steps}.`;
  }
  if (length === 0) {
    return 'Placez les joueurs, puis « Image clé ». Deux images au moins font une action.';
  }
  if (length === 1) {
    return '1 image clé : déplacez des joueurs, puis enregistrez la suivante.';
  }
  return `${length} images clés : « Lecture » joue l’action.`;
}

/**
 * Relie le panneau de la séquence à la séquence, au lecteur et à l'historique.
 * @param {object} options
 * @param {HTMLElement} options.root panneau (#sequence-panel)
 * @param {import('./tactical-sequence.js').TacticalSequence} options.sequence
 * @param {import('./sequence-player.js').SequencePlayer} options.player
 * @param {import('./commands.js').CommandHistory} options.history
 * @param {import('./tactics-board.js').TacticsBoard} options.board
 * @param {(feedback: {kind: string, message: string}) => void} [options.onFeedback]
 * @returns {{buttons: Record<string, HTMLButtonElement>, speedButtons: HTMLButtonElement[]}}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Interface HTML — panneau de la séquence (BF9)
 */
export function createSequencePanel({ root, sequence, player, history, board, onFeedback = () => {} }) {
  const buttons = Object.fromEntries(['keyframe', 'play', 'restart', 'clear'].map((name) => [
    name, root.querySelector(`[data-sequence="${name}"]`),
  ]));
  const speedButtons = [...root.querySelectorAll('[data-speed]')];
  const status = root.querySelector('[data-sequence="status"]');
  let playback = { state: player.state, ended: false, step: 1, steps: 0, speed: player.speed };

  buttons.keyframe.addEventListener('click', () => {
    history.execute(new AddKeyframeCommand({ sequence, board }));
    onFeedback({ kind: 'success', message: `Image clé ${sequence.length} enregistrée.` });
  });
  buttons.play.addEventListener('click', () => {
    if (player.state === PLAYBACK_STATES.PLAYING) {
      player.pause();
    } else if (!player.play()) {
      onFeedback({ kind: 'invalid', message: 'Enregistrez au moins deux images clés.' });
    }
  });
  buttons.restart.addEventListener('click', () => player.restart());
  buttons.clear.addEventListener('click', () => {
    if (history.execute(new ClearSequenceCommand({ sequence }))) {
      onFeedback({ kind: 'info', message: 'Séquence effacée ; « Annuler » la rétablit.' });
    }
  });
  for (const button of speedButtons) {
    button.addEventListener('click', () => player.setSpeed(Number(button.dataset.speed)));
  }

  /** Met à jour boutons et état écrit. */
  const render = () => {
    const playable = sequence.length >= 2;
    buttons.keyframe.disabled = sequence.length >= MAX_KEYFRAMES;
    buttons.play.disabled = !playable;
    buttons.play.textContent = playback.state === PLAYBACK_STATES.PLAYING ? 'Pause' : 'Lecture';
    buttons.restart.disabled = !playable;
    buttons.clear.disabled = sequence.length === 0;
    for (const button of speedButtons) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === player.speed));
    }
    status.textContent = describeSequence({ length: sequence.length, ...playback });
  };
  sequence.on('change', render);
  player.on('statechange', (detail) => {
    playback = detail;
    render();
  });
  render();
  return { buttons, speedButtons };
}
