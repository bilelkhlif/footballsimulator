/**
 * Aide au premier lancement : une carte courte qui présente les trois outils et l'annulation.
 *
 * Elle s'ouvre seule à la première visite, hors AR, et se ferme par « Commencer », par Échap ou par
 * le bouton du guide. Le guide peut être rouvert à tout moment. Il n'est pas modal : la scène reste
 * visible et utilisable autour. Une fois vue, elle ne revient pas seule : le navigateur le retient
 * (localStorage). Si le stockage est refusé (navigation privée, réglages), elle s'ouvre à chaque
 * visite plutôt que de casser le démarrage.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/** Clé du stockage local qui retient que l'aide a été vue. */
export const ONBOARDING_STORAGE_KEY = 'football-simulator:aide-vue';

/**
 * Indique si l'aide a déjà été vue, d'après le stockage local.
 * @param {Storage|null} storage
 * @returns {boolean} faux si le stockage est absent ou refusé
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Interface HTML — aide au premier lancement
 */
export function hasSeenOnboarding(storage) {
  try {
    return storage?.getItem(ONBOARDING_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Retient que l'aide a été vue ; sans effet si le stockage est refusé.
 * @param {Storage|null} storage
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Interface HTML — aide au premier lancement
 */
export function rememberOnboarding(storage) {
  try {
    storage?.setItem(ONBOARDING_STORAGE_KEY, '1');
  } catch {
    // Stockage refusé : l'aide reviendra à la prochaine visite.
  }
}

/**
 * Relie la carte d'aide, son bouton de fermeture et le bouton du guide.
 * @param {object} options
 * @param {HTMLElement} options.card carte d'aide (#onboarding)
 * @param {HTMLButtonElement} options.closeButton « Commencer »
 * @param {HTMLButtonElement} options.toggleButton bouton du guide dans Réglages et aide
 * @param {Storage|null} [options.storage] stockage local
 * @param {boolean} [options.showOnStart] ouvrir la carte si elle n'a jamais été vue
 * @param {() => void} [options.onOpen] rend accessible l'espace qui contient la carte
 * @returns {{open: () => void, close: (options?: {restoreFocus?: boolean}) => void, readonly isOpen: boolean}}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Interface HTML — aide au premier lancement
 */
export function createOnboarding({ card, closeButton, toggleButton, storage = null, showOnStart = true, onOpen = () => {} }) {
  /** Montre ou cache la carte, et tient à jour l'état du bouton « ? ». */
  const setOpen = (open) => {
    card.hidden = !open;
    toggleButton.setAttribute('aria-expanded', String(open));
    if (open) onOpen();
  };
  const controller = {
    get isOpen() {
      return !card.hidden;
    },
    open() {
      setOpen(true);
      closeButton.focus?.({ preventScroll: true });
    },
    close({ restoreFocus = false } = {}) {
      if (card.hidden) {
        return;
      }
      setOpen(false);
      rememberOnboarding(storage);
      if (restoreFocus) {
        const target = typeof document !== 'undefined' && !toggleButton.getClientRects?.().length
          ? document.getElementById('home-toggle') ?? toggleButton : toggleButton;
        target.focus?.({ preventScroll: true });
      }
    },
  };
  closeButton.addEventListener('click', () => controller.close({ restoreFocus: true }));
  toggleButton.addEventListener('click', () => (controller.isOpen ? controller.close() : controller.open()));
  setOpen(false);
  if (showOnStart && !hasSeenOnboarding(storage)) {
    setOpen(true);
  }
  return controller;
}
