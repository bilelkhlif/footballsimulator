/**
 * Panneau « Personnaliser le joueur » (phase 5) : quatre coupes de cheveux, chacune avec un petit
 * aperçu dessiné, un sélecteur de couleur libre pour les cheveux, et une palette de teints de peau,
 * du plus clair au plus foncé (pas de couleur libre pour la peau : seulement des teints réels).
 *
 * Chaque choix s'affiche aussitôt sur le joueur en 3D, en aperçu (src/player-appearance-view.mjs),
 * sans toucher au tableau tactique. « Appliquer » garde la personnalisation : une seule commande
 * annulable, enregistrée avec la tactique. « Annuler », la croix ou Échap retirent l'aperçu : le
 * joueur reprend l'apparence qu'il avait à l'ouverture du panneau.
 *
 * Le panneau ne connaît ni la scène ni l'historique : il passe par les actions `preview`,
 * `clearPreview` et `apply`, câblées dans src/main.mjs.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import {
  copyAppearance, HAIR_STYLES, isHairColor, sameAppearance, SKIN_TONES, skinToneColor,
} from './player-appearance.mjs';

/** Dessin de chaque coupe pour les boutons : une tête de profil vue de trois quarts, sans visage. */
const HAIR_PREVIEWS = Object.freeze({
  classic: '<path d="M10 22c0-8 5-13 12-13s12 5 12 13c-2-3-6-5-12-5s-10 2-12 5z"/>',
  crew: '<path d="M11 20c1-6 5-9 11-9s10 3 11 9c-3-2-7-3-11-3s-8 1-11 3z"/><rect x="14" y="8" width="16" height="4" rx="2"/>',
  curly: '<g><circle cx="13" cy="17" r="3.4"/><circle cx="17" cy="12" r="3.4"/><circle cx="22" cy="10" r="3.4"/>'
    + '<circle cx="27" cy="12" r="3.4"/><circle cx="31" cy="17" r="3.4"/><circle cx="22" cy="15" r="3.4"/></g>',
  mohawk: '<path d="M20 4h4l2 6-1 9h-6l-1-9z"/><path d="M11 22c1-6 5-9 11-9s10 3 11 9c-3-2-7-3-11-3s-8 1-11 3z" opacity=".35"/>',
});

/**
 * Icône d'une coupe : la tête couleur peau, les cheveux dans la couleur choisie.
 * @param {string} style identifiant de la coupe
 * @returns {string} SVG
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Interface HTML — personnalisation des joueurs
 */
export function hairPreviewSvg(style) {
  return `<svg class="hair-choice__art" viewBox="0 0 44 44" aria-hidden="true">`
    + '<circle class="hair-choice__head" cx="22" cy="24" r="12"/>'
    + `<g class="hair-choice__hair">${HAIR_PREVIEWS[style] ?? ''}</g></svg>`;
}

/**
 * Construit le panneau dans son conteneur (masqué jusqu'à l'ouverture).
 * @param {object} options
 * @param {HTMLElement} options.root section du panneau (index.html)
 * @param {(teamId: string, number: number) => {hair: string, color: string}} options.getAppearance
 *   apparence enregistrée d'un joueur
 * @param {(teamId: string, number: number) => string} options.describe titre du joueur
 * @param {(teamId: string, number: number, appearance: object) => void} options.preview aperçu en 3D
 * @param {() => void} options.clearPreview retire l'aperçu
 * @param {(teamId: string, number: number, appearance: object) => void} options.apply garde le choix
 * @param {(open: boolean) => void} [options.onToggle] ouverture ou fermeture du panneau
 * @returns {{open: (selection: {teamId: string, number: number}) => void, cancel: () => boolean,
 *   readonly isOpen: boolean}}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Interface HTML — personnalisation des joueurs
 */
export function createPlayerCustomizationPanel({
  root, getAppearance, describe, preview, clearPreview, apply, onToggle = () => {},
}) {
  const title = root.querySelector('[data-customize-title]');
  const styles = root.querySelector('[data-hair-styles]');
  const colorInput = root.querySelector('[data-hair-color]');
  const colorValue = root.querySelector('[data-hair-color-value]');
  const skinTones = root.querySelector('[data-skin-tones]');
  let target = null;
  let original = null;
  let draft = null;

  const buttons = HAIR_STYLES.map(({ id, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hair-choice';
    button.dataset.hairStyle = id;
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = `${hairPreviewSvg(id)}<span>${label}</span>`;
    button.addEventListener('click', () => choose({ hair: id }));
    styles.append(button);
    return button;
  });

  // Teints : une pastille par teint, du plus clair au plus foncé, choisie d'un clic.
  const swatches = SKIN_TONES.map(({ id, label, color }) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'skin-swatch';
    swatch.dataset.skinTone = id;
    swatch.title = label;
    swatch.setAttribute('aria-label', `Teint : ${label}`);
    swatch.setAttribute('aria-pressed', 'false');
    swatch.style.setProperty('--swatch', color);
    swatch.addEventListener('click', () => choose({ skin: id }));
    skinTones.append(swatch);
    return swatch;
  });

  /** Met l'interface à jour d'après le brouillon : coupe et teint cochés, couleur affichée. */
  const render = () => {
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.hairStyle === draft.hair));
    }
    for (const swatch of swatches) {
      swatch.setAttribute('aria-pressed', String(swatch.dataset.skinTone === draft.skin));
    }
    root.style.setProperty('--skin-color', skinToneColor(draft.skin));
    colorInput.value = draft.color;
    colorValue.textContent = draft.color.toUpperCase();
    root.style.setProperty('--hair-color', draft.color);
  };

  /** Change la coupe ou la couleur du brouillon et l'affiche aussitôt sur le joueur. */
  const choose = (change) => {
    if (!target) return;
    draft = { ...draft, ...change };
    render();
    preview(target.teamId, target.number, draft);
  };

  /** Ferme le panneau. */
  const close = () => {
    target = null;
    original = null;
    draft = null;
    root.hidden = true;
    onToggle(false);
  };

  colorInput.addEventListener('input', () => {
    if (isHairColor(colorInput.value)) {
      choose({ color: colorInput.value.toLowerCase() });
    }
  });

  root.querySelector('[data-customize-apply]').addEventListener('click', () => {
    if (!target) return;
    const { teamId, number } = target;
    const chosen = copyAppearance(draft);
    clearPreview();
    if (!sameAppearance(chosen, original)) {
      apply(teamId, number, chosen);
    }
    close();
  });

  /** Annule : retire l'aperçu, le joueur reprend son apparence d'avant. */
  const cancel = () => {
    if (!target) return false;
    clearPreview();
    close();
    return true;
  };
  for (const button of root.querySelectorAll('[data-customize-cancel]')) {
    button.addEventListener('click', cancel);
  }

  return {
    open({ teamId, number }) {
      if (target) {
        clearPreview();
      }
      target = { teamId, number };
      original = getAppearance(teamId, number);
      draft = { ...original };
      title.textContent = describe(teamId, number);
      render();
      root.hidden = false;
      onToggle(true);
      buttons.find((button) => button.dataset.hairStyle === draft.hair)?.focus({ preventScroll: true });
    },
    cancel,
    get isOpen() {
      return target !== null;
    },
  };
}