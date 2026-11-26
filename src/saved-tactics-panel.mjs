/**
 * Panneau « Tactiques enregistrées » (phase 5) : un champ pour nommer la tactique en cours et
 * l'enregistrer sur l'appareil, puis la liste des tactiques déjà enregistrées, la plus récente
 * d'abord, chacune avec un bouton « Ouvrir ».
 *
 * Le panneau ne connaît ni IndexedDB ni le tableau tactique : il passe par la bibliothèque
 * (src/tactic-library.mjs) pour enregistrer et relire, et par l'action `open` pour rétablir une
 * tactique, qui crée une commande annulable (src/main.mjs).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { MAX_SAVED_TACTICS, MAX_TACTIC_NAME_LENGTH, SAVE_ERRORS } from './tactic-library.mjs';

/** Format de la date d'enregistrement affichée dans la liste. */
const SAVED_AT_FORMAT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Message affiché pour un enregistrement refusé.
 * @param {{reason: string, name?: string}} result
 * @returns {string}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Interface HTML — tactiques enregistrées
 */
export function describeSaveError({ reason, name }) {
  switch (reason) {
    case SAVE_ERRORS.EMPTY_NAME:
      return 'Donnez un nom à la tactique avant de l’enregistrer.';
    case SAVE_ERRORS.DUPLICATE:
      return `Une tactique s’appelle déjà « ${name} » : choisissez un autre nom.`;
    case SAVE_ERRORS.FULL:
      return `Limite de ${MAX_SAVED_TACTICS} tactiques enregistrées atteinte sur cet appareil.`;
    default:
      return 'Enregistrement impossible : le stockage de cet appareil est indisponible.';
  }
}

/**
 * Construit le panneau et affiche la liste des tactiques enregistrées.
 * @param {object} options
 * @param {HTMLElement} options.root conteneur du panneau
 * @param {ReturnType<import('./tactic-library.mjs').createTacticLibrary>} options.library
 * @param {() => object} options.capture tactique en cours à enregistrer (captureTactic)
 * @param {(name: string, tactic: object) => boolean} options.open rétablit une tactique ; rend
 *   false si elle ne peut pas l'être
 * @param {(feedback: {kind: string, message: string}) => void} [options.onFeedback] message bref
 *   sur le terrain
 * @returns {{refresh: () => Promise<void>, ready: Promise<void>, input: HTMLInputElement}}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Interface HTML — tactiques enregistrées
 */
export function createSavedTacticsPanel({ root, library, capture, open, onFeedback = () => {} }) {
  const form = document.createElement('form');
  form.className = 'saved-tactics__form';
  form.noValidate = true;
  const label = document.createElement('label');
  label.textContent = 'Nom de la tactique';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = MAX_TACTIC_NAME_LENGTH;
  input.autocomplete = 'off';
  input.placeholder = 'Ex. : Pressing haut contre le 4-3-3';
  input.dataset.tacticName = '';
  label.append(input);
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'button button--secondary';
  submit.dataset.saveTactic = '';
  submit.textContent = 'Enregistrer';
  form.append(label, submit);

  const status = document.createElement('p');
  status.className = 'muted';
  status.setAttribute('role', 'status');
  const list = document.createElement('ul');
  list.className = 'saved-tactics__list';
  root.append(form, status, list);

  /** Affiche un message dans le panneau et sur le terrain. */
  const tell = (kind, message) => {
    status.textContent = message;
    onFeedback({ kind, message });
  };

  /** Ouvre une tactique de la liste, relue dans le stockage au moment du clic. */
  const openEntry = async ({ id, name }) => {
    const saved = await library.get(id);
    if (!saved || !open(saved.name, saved.tactic)) {
      tell('invalid', `La tactique « ${name} » est illisible sur cet appareil.`);
      return;
    }
    tell('success', `Tactique « ${saved.name} » ouverte : « Annuler » rend la précédente.`);
  };

  /** Une ligne de la liste : nom, date d'enregistrement, bouton « Ouvrir ». */
  const createItem = (entry) => {
    const item = document.createElement('li');
    item.className = 'saved-tactics__item';
    item.dataset.savedTactic = entry.id;
    const name = document.createElement('strong');
    name.textContent = entry.name;
    const savedAt = document.createElement('span');
    savedAt.className = 'muted';
    savedAt.textContent = `Enregistrée le ${SAVED_AT_FORMAT.format(entry.savedAt)}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--secondary';
    button.dataset.openTactic = entry.id;
    button.textContent = 'Ouvrir';
    button.setAttribute('aria-label', `Ouvrir la tactique : ${entry.name}`);
    button.addEventListener('click', () => openEntry(entry));
    item.append(name, savedAt, button);
    return item;
  };

  /** Relit la bibliothèque et redessine la liste. */
  const refresh = async () => {
    const { ok, tactics } = await library.list();
    list.replaceChildren(...tactics.map(createItem));
    if (!ok) {
      status.textContent = 'Tactiques enregistrées indisponibles sur cet appareil.';
    } else if (!tactics.length) {
      status.textContent = 'Aucune tactique enregistrée pour l’instant.';
    } else {
      status.textContent = `${tactics.length} tactique${tactics.length > 1 ? 's' : ''} enregistrée${tactics.length > 1 ? 's' : ''} sur cet appareil.`;
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const result = await library.save(input.value, capture());
      if (!result.ok) {
        tell('invalid', describeSaveError(result));
        input.focus();
        return;
      }
      input.value = '';
      await refresh();
      tell('success', `Tactique « ${result.entry.name} » enregistrée.`);
    } finally {
      submit.disabled = false;
    }
  });

  return { refresh, ready: refresh(), input };
}