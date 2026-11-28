/**
 * Panneau de la séquence animée (sprint 6, bonus BF9) : enregistrer des images clés, lire l'action,
 * la mettre en pause, la recommencer, changer de vitesse et effacer la séquence.
 *
 * Les images clés passent par des commandes annulables (src/commands.mjs) ; la lecture, par le
 * lecteur (src/sequence-player.mjs). Le panneau observe la séquence et le lecteur (patron
 * Observer) : boutons actifs, libellé Lecture / Pause, vitesse marquée et état écrit en clair.
 * Phase 6 : un champ par image clé pour la note de l'entraîneur, et une légende sur le terrain qui
 * affiche, pendant la lecture, la note de l'image clé la plus proche.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { AddKeyframeCommand, ClearSequenceCommand, EditKeyframeNoteCommand } from './commands.mjs';
import { MAX_KEYFRAMES, MAX_NOTE_LENGTH } from './tactical-sequence.mjs';
import { PLAYBACK_STATES } from './sequence-player.mjs';

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
 * @param {import('./tactical-sequence.mjs').TacticalSequence} options.sequence
 * @param {import('./sequence-player.mjs').SequencePlayer} options.player
 * @param {import('./commands.mjs').CommandHistory} options.history
 * @param {import('./tactics-board.mjs').TacticsBoard} options.board
 * @param {(feedback: {kind: string, message: string}) => void} [options.onFeedback]
 * @param {HTMLElement|null} [options.caption] légende affichée sur le terrain pendant la lecture
 *   (phase 6), avec [data-caption-step] et [data-caption-text]
 * @returns {{buttons: Record<string, HTMLButtonElement>, speedButtons: HTMLButtonElement[]}}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Interface HTML — panneau de la séquence (BF9)
 */
export function createSequencePanel({ root, sequence, player, history, board, onFeedback = () => {}, caption = null }) {
  const buttons = Object.fromEntries(['keyframe', 'play', 'restart', 'clear'].map((name) => [
    name, root.querySelector(`[data-sequence="${name}"]`),
  ]));
  const speedButtons = [...root.querySelectorAll('[data-speed]')];
  const status = root.querySelector('[data-sequence="status"]');
  let playback = { state: player.state, ended: false, step: 1, steps: 0, speed: player.speed, keyframe: 0 };

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

  // Notes de l'entraîneur (phase 6) : un champ par image clé ; une note validée (Entrée ou sortie
  // du champ) passe par une commande annulable. Les champs existants sont mis à jour en place, pour
  // ne pas perdre le focus de celui qu'on est en train de remplir.
  const notesList = root.querySelector('[data-keyframe-notes]');
  /** Écrit la note d'un champ, si elle a changé. */
  const commitNote = (field) => {
    const index = Number(field.dataset.keyframeNote);
    if (index >= sequence.length) {
      return;
    }
    if (history.execute(new EditKeyframeNoteCommand({ sequence, index, note: field.value }))) {
      onFeedback({ kind: 'success', message: sequence.noteAt(index)
        ? `Note de l’image clé ${index + 1} enregistrée : elle s’affiche pendant la lecture.`
        : `Note de l’image clé ${index + 1} effacée.` });
    }
    field.value = sequence.noteAt(index);
  };
  /** Une ligne : « Image n » et son champ. */
  const createNoteItem = (index) => {
    const item = document.createElement('li');
    const label = document.createElement('label');
    const title = document.createElement('span');
    title.textContent = `Image ${index + 1}`;
    const field = document.createElement('input');
    field.type = 'text';
    field.maxLength = MAX_NOTE_LENGTH;
    field.autocomplete = 'off';
    field.placeholder = 'Note de l’entraîneur (facultative)';
    field.dataset.keyframeNote = String(index);
    field.addEventListener('change', () => commitNote(field));
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitNote(field);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        field.value = sequence.noteAt(index);
        field.blur();
      }
    });
    label.append(title, field);
    item.append(label);
    return item;
  };
  /** Accorde la liste au nombre d'images clés, et chaque champ à sa note. */
  const renderNotes = () => {
    if (!notesList) {
      return;
    }
    while (notesList.children.length > sequence.length) notesList.lastElementChild.remove();
    while (notesList.children.length < sequence.length) notesList.append(createNoteItem(notesList.children.length));
    notesList.querySelectorAll('[data-keyframe-note]').forEach((field, index) => {
      if (document.activeElement !== field) field.value = sequence.noteAt(index);
    });
    notesList.hidden = sequence.length === 0;
  };

  /** Légende de la lecture : la note de l'image clé la plus proche, tant que la lecture est ouverte. */
  const showCaption = () => {
    if (!caption) {
      return;
    }
    const index = playback.keyframe - 1;
    const note = playback.state !== PLAYBACK_STATES.STOPPED && index >= 0 && index < sequence.length ? sequence.noteAt(index) : '';
    caption.hidden = !note;
    if (note) {
      caption.querySelector('[data-caption-step]').textContent = `Image ${index + 1}`;
      caption.querySelector('[data-caption-text]').textContent = note;
    }
  };

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
    renderNotes();
    showCaption();
  };
  sequence.on('change', render);
  player.on('statechange', (detail) => {
    playback = detail;
    render();
  });
  render();
  return { buttons, speedButtons };
}
