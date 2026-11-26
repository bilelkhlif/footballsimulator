/**
 * Raccourcis clavier de la vue 3D (sur ordinateur, ou tablette avec clavier).
 *
 * - D, P, C : outils Déplacer, Passe, Course ;
 * - Échap : abandonne la sélection ou le tracé en cours, ferme un panneau ouvert ;
 * - Ctrl+Z (Cmd+Z sur Mac) : annuler ; Ctrl+Y ou Ctrl+Maj+Z : rétablir.
 *
 * Les boutons de l'interface restent atteignables à la touche Tab et activables par Entrée ou
 * Espace : les raccourcis s'y ajoutent, ils ne les remplacent pas. Un raccourci est ignoré quand le
 * clavier sert à autre chose (champ de saisie, touche déjà traitée, touche répétée par appui long).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/** Touche de chaque outil. */
export const MODE_KEYS = Object.freeze({ d: 'move', p: 'pass', c: 'run', b: 'dribble', x: 'cross', t: 'shot', m: 'mark' });

/**
 * Traduit un appui de touche en action, ou null s'il n'en déclenche aucune.
 * @param {{key: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, shiftKey?: boolean,
 *   repeat?: boolean, defaultPrevented?: boolean, target?: {tagName?: string, isContentEditable?: boolean}}} event
 * @returns {{type: 'mode', mode: string}|{type: 'undo'}|{type: 'redo'}|{type: 'cancel'}|null}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Interface HTML — raccourcis clavier
 */
export function resolveShortcut(event) {
  const tag = event.target?.tagName;
  if (event.defaultPrevented || event.target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return null;
  }
  const key = event.key?.toLowerCase() ?? '';
  const command = event.ctrlKey || event.metaKey;
  if (key === 'escape') {
    return { type: 'cancel' };
  }
  if (event.repeat) {
    return null;
  }
  if (command && !event.altKey) {
    if (key === 'z') {
      return { type: event.shiftKey ? 'redo' : 'undo' };
    }
    return key === 'y' ? { type: 'redo' } : null;
  }
  if (!event.altKey && !event.shiftKey && Object.hasOwn(MODE_KEYS, key)) {
    return { type: 'mode', mode: MODE_KEYS[key] };
  }
  return null;
}

/**
 * Écoute le clavier et déclenche les actions des raccourcis.
 * @param {object} options
 * @param {EventTarget} options.target élément écouté (window)
 * @param {{mode: (mode: string) => void, undo: () => void, redo: () => void, cancel: () => boolean}} options.actions
 *   cancel renvoie vrai s'il a abandonné quelque chose
 * @param {() => boolean} [options.isEnabled] faux pour suspendre les raccourcis
 * @returns {() => void} arrête l'écoute
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Interface HTML — raccourcis clavier
 */
export function attachKeyboardShortcuts({ target, actions, isEnabled = () => true }) {
  /** Appui de touche : action du raccourci ; le navigateur ne la traite pas une seconde fois. */
  const onKeyDown = (event) => {
    const shortcut = isEnabled() ? resolveShortcut(event) : null;
    if (!shortcut) {
      return;
    }
    if (shortcut.type === 'mode') {
      actions.mode(shortcut.mode);
    } else if (shortcut.type === 'cancel') {
      if (!actions.cancel()) {
        return; // rien à abandonner : Échap garde son effet habituel
      }
    } else {
      actions[shortcut.type]();
    }
    event.preventDefault();
  };
  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}
