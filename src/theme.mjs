/**
 * Thème clair, sombre ou automatique, partagé par le tableau tactique et le visualiseur.
 *
 * « auto » laisse les feuilles de style suivre prefers-color-scheme ; « light » et « dark » posent
 * data-theme sur la racine. Le choix est mémorisé dans le navigateur quand c'est possible : sans
 * stockage (navigation privée, données bloquées), le thème marche le temps de la page.
 * Le fond de la scène 3D suit le thème : la couleur est modifiée en place, si bien que la vue
 * revient au bon fond après une session AR (ar-view.mjs restaure le même objet).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

import { SCENE_COLORS } from './config.mjs';

export const THEME_STORAGE_KEY = 'football-simulator:theme';
export const THEME_CHOICES = Object.freeze(['auto', 'light', 'dark']);

/** Fond et table de la scène 3D, couleur de l'interface du navigateur, par thème résolu. */
export const THEME_COLORS = Object.freeze({
  dark: Object.freeze({ scene: SCENE_COLORS.background, table: SCENE_COLORS.table, browser: '#0e1311' }),
  light: Object.freeze({ scene: 0xe3eae5, table: 0xc9d4cc, browser: '#eef3f0' }),
});

/**
 * Lit la préférence enregistrée ; « auto » si absente, illisible ou inconnue.
 * @param {Storage | null | undefined} storage
 * @returns {'auto' | 'light' | 'dark'}
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Interface — thème (préférence)
 */
export function readThemePreference(storage) {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return THEME_CHOICES.includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Enregistre la préférence ; un stockage indisponible n'empêche pas d'appliquer le thème.
 * @param {Storage | null | undefined} storage
 * @param {'auto' | 'light' | 'dark'} choice
 * @returns {boolean} vrai si la préférence a été mémorisée
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Interface — thème (préférence)
 */
export function writeThemePreference(storage, choice) {
  try {
    if (choice === 'auto') {
      storage?.removeItem(THEME_STORAGE_KEY);
    } else {
      storage?.setItem(THEME_STORAGE_KEY, choice);
    }
    return Boolean(storage);
  } catch {
    return false;
  }
}

/**
 * Thème effectivement affiché : le choix explicite, ou celui du système en mode automatique.
 * @param {'auto' | 'light' | 'dark'} choice
 * @param {((query: string) => {matches: boolean}) | undefined} matchMedia
 * @returns {'light' | 'dark'}
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Interface — thème (résolution)
 */
export function resolveTheme(choice, matchMedia) {
  if (choice === 'light' || choice === 'dark') {
    return choice;
  }
  return matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Pose le thème sur la racine du document et sur la couleur d'interface du navigateur.
 * @param {HTMLElement} root élément racine (documentElement)
 * @param {'auto' | 'light' | 'dark'} choice
 * @param {{matchMedia?: Function, meta?: HTMLMetaElement | null}} [options]
 * @returns {'light' | 'dark'} thème résolu
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Interface — thème (application)
 */
export function applyTheme(root, choice, { matchMedia, meta } = {}) {
  if (choice === 'light' || choice === 'dark') {
    root.dataset.theme = choice;
  } else {
    delete root.dataset.theme;
  }
  const resolved = resolveTheme(choice, matchMedia);
  meta?.setAttribute('content', THEME_COLORS[resolved].browser);
  return resolved;
}

/**
 * Relie un groupe de boutons [data-theme-choice] au thème, au stockage et au système.
 * @param {{root: HTMLElement, buttons: Iterable<HTMLButtonElement>, storage?: Storage | null,
 *   matchMedia?: (query: string) => MediaQueryList, meta?: HTMLMetaElement | null,
 *   status?: HTMLElement | null, onChange?: (resolved: 'light' | 'dark', choice: string) => void}} options
 * @returns {{choice: () => string, resolved: () => 'light' | 'dark', select: (choice: string) => void, dispose: () => void}}
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Interface — thème (réglages)
 */
export function createThemeControl({ root, buttons, storage, matchMedia, meta, status, onChange }) {
  const group = [...buttons];
  let choice = readThemePreference(storage);
  let resolved = applyTheme(root, choice, { matchMedia, meta });

  const render = () => {
    for (const button of group) {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === choice));
    }
    if (status) {
      status.textContent = choice === 'auto'
        ? `Automatique : thème ${resolved === 'light' ? 'clair' : 'sombre'}, comme le système.`
        : `Thème ${choice === 'light' ? 'clair' : 'sombre'} choisi pour ce navigateur.`;
    }
  };

  const select = (next) => {
    if (!THEME_CHOICES.includes(next)) {
      return;
    }
    choice = next;
    writeThemePreference(storage, next);
    resolved = applyTheme(root, choice, { matchMedia, meta });
    render();
    onChange?.(resolved, choice);
  };

  const handlers = group.map((button) => {
    const handler = () => select(button.dataset.themeChoice);
    button.addEventListener('click', handler);
    return [button, handler];
  });

  // En mode automatique, un changement du système (passage en clair le jour) est suivi sans recharger.
  const query = matchMedia?.('(prefers-color-scheme: light)');
  const onSystemChange = () => {
    if (choice === 'auto') {
      resolved = applyTheme(root, choice, { matchMedia, meta });
      render();
      onChange?.(resolved, choice);
    }
  };
  query?.addEventListener?.('change', onSystemChange);

  render();
  onChange?.(resolved, choice);
  return {
    choice: () => choice,
    resolved: () => resolved,
    select,
    dispose() {
      for (const [button, handler] of handlers) {
        button.removeEventListener('click', handler);
      }
      query?.removeEventListener?.('change', onSystemChange);
    },
  };
}
