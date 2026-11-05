/**
 * Détection de la réalité augmentée WebXR et affichage de son état dans l'interface.
 * La session immersive-ar elle-même est ouverte au sprint 2. Sans AR, l'application
 * reste utilisable en vue 3D (ajustement issu de l'état de l'art).
 */

/** Textes du badge d'état, selon le résultat de la détection. */
const STATUS_TEXT = Object.freeze({
  checking: 'Vérification de l’AR…',
  supported: 'AR disponible',
  emulated: 'AR émulée (IWER)',
  unsupported: 'AR indisponible : vue 3D',
});

/**
 * Indique si le navigateur peut ouvrir une session immersive-ar.
 * WebXR exige un contexte sécurisé : HTTPS, ou localhost pendant le développement.
 * @returns {Promise<boolean>}
 */
export async function isImmersiveArSupported() {
  if (!window.isSecureContext || !navigator.xr) {
    return false;
  }
  try {
    return await navigator.xr.isSessionSupported('immersive-ar');
  } catch {
    return false;
  }
}

/**
 * Met à jour le badge d'état de l'AR.
 * @param {HTMLElement} statusElement
 * @param {'checking'|'supported'|'emulated'|'unsupported'} state
 */
export function showXrStatus(statusElement, state) {
  statusElement.dataset.state = state;
  statusElement.textContent = STATUS_TEXT[state];
}
