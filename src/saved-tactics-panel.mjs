/**
 * Panneau « Tactiques enregistrées » (phase 5) : un champ pour nommer la tactique en cours et
 * l'enregistrer sur l'appareil, puis la liste des tactiques déjà enregistrées, la plus récente
 * d'abord, chacune avec un bouton « Ouvrir » et un bouton « Exporter ».
 *
 * Depuis la tâche 32, le panneau exporte aussi la tactique en cours en fichier JSON, et importe un
 * fichier JSON : la tactique importée est vérifiée, enregistrée sous un nom libre (jamais à la
 * place d'une autre), puis ouverte.
 *
 * Phase 6 : chaque tactique enregistrée peut être renommée, dans sa ligne de la liste.
 *
 * Le panneau ne connaît ni IndexedDB ni le tableau tactique : il passe par la bibliothèque
 * (src/tactic-library.mjs) pour enregistrer et relire, par src/tactic-file.mjs pour écrire et
 * vérifier les fichiers, et par l'action `open` pour rétablir une tactique, qui crée une commande
 * annulable (src/main.mjs).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import {
  MAX_SAVED_TACTICS, MAX_TACTIC_NAME_LENGTH, normalizeTacticName, SAVE_ERRORS,
} from './tactic-library.mjs';
import {
  createTacticFile, MAX_TACTIC_FILE_BYTES, parseTacticFile, serializeTacticFile, tacticFileName, uniqueTacticName,
} from './tactic-file.mjs';

/** Format de la date d'enregistrement affichée dans la liste. */
const SAVED_AT_FORMAT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/** Nom du fichier exporté pour la tactique en cours, quand le champ de nom est vide. */
const CURRENT_TACTIC_NAME = 'Tactique en cours';

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
    case SAVE_ERRORS.NOT_FOUND:
      return 'Cette tactique n’est plus enregistrée sur cet appareil.';
    default:
      return 'Enregistrement impossible : le stockage de cet appareil est indisponible.';
  }
}

/**
 * Fait télécharger un texte comme fichier, par un lien temporaire.
 * @param {string} fileName
 * @param {string} text
 * @param {string} type type MIME
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Interface HTML — tactiques enregistrées
 */
export function downloadTextFile(fileName, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Laisse au navigateur le temps de lancer le téléchargement avant de libérer le fichier.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Construit le panneau et affiche la liste des tactiques enregistrées.
 * @param {object} options
 * @param {HTMLElement} options.root conteneur du panneau
 * @param {ReturnType<import('./tactic-library.mjs').createTacticLibrary>} options.library
 * @param {() => object} options.capture tactique en cours à enregistrer (captureTactic)
 * @param {() => {formations: object, players: object}} options.getReference instantané du tableau
 *   en cours, contre lequel un fichier importé est vérifié
 * @param {(name: string, tactic: object) => boolean} options.open rétablit une tactique ; rend
 *   false si elle ne peut pas l'être
 * @param {(feedback: {kind: string, message: string}) => void} [options.onFeedback] message bref
 *   sur le terrain
 * @param {(fileName: string, text: string) => void} [options.download] téléchargement (doublure)
 * @returns {{refresh: () => Promise<void>, ready: Promise<void>, input: HTMLInputElement,
 *   importFile: (file: File) => Promise<boolean>}}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Interface HTML — tactiques enregistrées
 */
export function createSavedTacticsPanel({
  root, library, capture, getReference, open, onFeedback = () => {}, download = downloadTextFile,
}) {
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

  // Export et import en fichier JSON (tâche 32).
  const transfer = document.createElement('div');
  transfer.className = 'saved-tactics__transfer';
  const exportCurrent = document.createElement('button');
  exportCurrent.type = 'button';
  exportCurrent.className = 'button button--secondary';
  exportCurrent.dataset.exportCurrentTactic = '';
  exportCurrent.textContent = 'Exporter en JSON';
  exportCurrent.title = 'Télécharger la tactique en cours, avec sa séquence, en fichier JSON';
  const importButton = document.createElement('button');
  importButton.type = 'button';
  importButton.className = 'button button--secondary';
  importButton.dataset.importTactic = '';
  importButton.textContent = 'Importer un JSON';
  importButton.title = 'Ouvrir une tactique exportée en fichier JSON';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.hidden = true;
  fileInput.dataset.tacticFile = '';
  transfer.append(exportCurrent, importButton, fileInput);

  const status = document.createElement('p');
  status.className = 'muted';
  status.setAttribute('role', 'status');
  const list = document.createElement('ul');
  list.className = 'saved-tactics__list';
  root.append(form, transfer, status, list);

  /** Affiche un message dans le panneau et sur le terrain. */
  const tell = (kind, message) => {
    status.textContent = message;
    onFeedback({ kind, message });
  };

  /** Télécharge une tactique en fichier JSON. */
  const exportTactic = (name, tactic) => {
    const file = createTacticFile({ name, tactic });
    download(tacticFileName(file.name), serializeTacticFile(file));
    tell('success', `Tactique « ${file.name} » exportée en JSON, avec sa séquence.`);
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

  /** Exporte une tactique de la liste, relue dans le stockage au moment du clic. */
  const exportEntry = async ({ id, name }) => {
    const saved = await library.get(id);
    if (!saved) {
      tell('invalid', `La tactique « ${name} » est illisible sur cet appareil.`);
      return;
    }
    exportTactic(saved.name, saved.tactic);
  };

  /** Une ligne de la liste : nom, date d'enregistrement, boutons « Ouvrir » et « Exporter ». */
  const createItem = (entry) => {
    const item = document.createElement('li');
    item.className = 'saved-tactics__item';
    item.dataset.savedTactic = entry.id;
    const name = document.createElement('strong');
    name.textContent = entry.name;
    // Nom complet au survol, quand il est coupé par des points de suspension.
    name.title = entry.name;
    const savedAt = document.createElement('span');
    savedAt.className = 'muted';
    savedAt.textContent = `Enregistrée le ${SAVED_AT_FORMAT.format(entry.savedAt)}`;
    const actions = document.createElement('div');
    actions.className = 'saved-tactics__actions';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'button button--secondary';
    openButton.dataset.openTactic = entry.id;
    openButton.textContent = 'Ouvrir';
    openButton.setAttribute('aria-label', `Ouvrir la tactique : ${entry.name}`);
    openButton.addEventListener('click', () => openEntry(entry));
    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.className = 'button button--secondary';
    exportButton.dataset.exportTactic = entry.id;
    exportButton.textContent = 'Exporter';
    exportButton.setAttribute('aria-label', `Exporter en JSON la tactique : ${entry.name}`);
    exportButton.addEventListener('click', () => exportEntry(entry));
    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.className = 'button button--secondary';
    renameButton.dataset.renameTactic = entry.id;
    renameButton.textContent = 'Renommer';
    renameButton.setAttribute('aria-label', `Renommer la tactique : ${entry.name}`);
    renameButton.addEventListener('click', () => startRename(item, entry));
    actions.append(openButton, exportButton, renameButton);
    item.append(name, savedAt, actions);
    return item;
  };

  /** Met le focus sur un bouton d'une ligne après un rafraîchissement de la liste. */
  const focusInList = (selector) => list.querySelector(selector)?.focus();

  /**
   * Renommer (phase 6) : la ligne devient un petit formulaire, prérempli avec le nom actuel.
   * Entrée valide, Échap ou « Annuler » rend la ligne telle quelle. Un nom vide ou déjà pris est
   * refusé sans fermer le formulaire.
   */
  const startRename = (item, entry) => {
    const renameForm = document.createElement('form');
    renameForm.className = 'saved-tactics__rename';
    renameForm.noValidate = true;
    const renameLabel = document.createElement('label');
    renameLabel.textContent = 'Nouveau nom';
    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.maxLength = MAX_TACTIC_NAME_LENGTH;
    renameInput.autocomplete = 'off';
    renameInput.value = entry.name;
    renameInput.dataset.renameInput = entry.id;
    renameLabel.append(renameInput);
    const confirm = document.createElement('button');
    confirm.type = 'submit';
    confirm.className = 'button button--primary';
    confirm.dataset.confirmRename = entry.id;
    confirm.textContent = 'Valider';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'button button--secondary';
    cancel.textContent = 'Annuler';
    const buttons = document.createElement('div');
    buttons.className = 'saved-tactics__actions';
    buttons.append(confirm, cancel);
    renameForm.append(renameLabel, buttons);
    const previous = [...item.children];
    item.replaceChildren(renameForm);
    renameInput.focus();
    renameInput.select();

    /** Rend la ligne d'origine, focus sur son bouton « Renommer ». */
    const close = () => {
      item.replaceChildren(...previous);
      item.querySelector('[data-rename-tactic]')?.focus();
    };
    cancel.addEventListener('click', close);
    renameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    });
    renameForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      confirm.disabled = true;
      try {
        const result = await library.rename(entry.id, renameInput.value);
        if (!result.ok) {
          tell('invalid', describeSaveError(result));
          renameInput.focus();
          return;
        }
        await refresh();
        focusInList(`[data-rename-tactic="${CSS.escape(entry.id)}"]`);
        tell('success', result.entry.name === entry.name
          ? `La tactique garde son nom « ${entry.name} ».`
          : `Tactique « ${entry.name} » renommée « ${result.entry.name} ».`);
      } finally {
        confirm.disabled = false;
      }
    });
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

  /**
   * Importe un fichier : vérifié avant tout changement, enregistré sous un nom libre, puis ouvert.
   * Rend vrai si la tactique a été ouverte.
   */
  const importFile = async (file) => {
    if (!file) {
      return false;
    }
    if (file.size > MAX_TACTIC_FILE_BYTES) {
      tell('invalid', 'Fichier trop volumineux pour une tactique : rien n’a été modifié.');
      return false;
    }
    let text;
    try {
      text = await file.text();
    } catch {
      tell('invalid', 'Fichier illisible : rien n’a été modifié.');
      return false;
    }
    const parsed = parseTacticFile(text, getReference());
    if (!parsed.ok) {
      tell('invalid', parsed.error);
      return false;
    }
    const listing = await library.list();
    const name = uniqueTacticName(parsed.name, listing.tactics.map((entry) => entry.name));
    // Ouverte d'abord (vérifiée une seconde fois par `open`) : rien n'est enregistré si elle échoue.
    if (!open(name, parsed.tactic)) {
      tell('invalid', 'Tactique incompatible avec le terrain en cours : rien n’a été modifié.');
      return false;
    }
    const saved = listing.ok ? await library.save(name, parsed.tactic) : { ok: false, reason: SAVE_ERRORS.STORAGE };
    await refresh();
    tell(saved.ok ? 'success' : 'info', saved.ok
      ? `Tactique « ${name} » importée, enregistrée et ouverte : « Annuler » rend la précédente.`
      : `Tactique « ${name} » importée et ouverte, mais non enregistrée. ${describeSaveError(saved)}`);
    return true;
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

  exportCurrent.addEventListener('click', () => {
    exportTactic(normalizeTacticName(input.value) || CURRENT_TACTIC_NAME, capture());
  });
  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files ?? [];
    // Le même fichier peut être choisi de nouveau.
    fileInput.value = '';
    importButton.disabled = true;
    try {
      await importFile(file);
    } finally {
      importButton.disabled = false;
    }
  });

  return { refresh, ready: refresh(), input, importFile };
}