/**
 * Détection de la réalité augmentée WebXR et affichage de son état dans l'interface.
 * La session immersive-ar est ouverte par src/xr-session.mjs. Sans AR, l'application
 * reste utilisable en vue 3D (ajustement issu de l'état de l'art).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/** Textes du badge d'état, selon le résultat de la détection. */
const STATUS_TEXT = Object.freeze({
  checking: 'Vérification de l’AR…',
  supported: 'AR disponible (WebGPU)',
  'supported-webgl-test': 'AR disponible (WebGL, mode test)',
  emulated: 'AR émulée (IWER)',
  'needs-flag': 'AR : réglage WebGPU à activer',
  unsupported: 'AR indisponible : vue 3D',
});

/**
 * Indique si le navigateur peut ouvrir une session immersive-ar.
 * WebXR exige un contexte sécurisé : HTTPS, ou localhost pendant le développement.
 * @returns {Promise<boolean>}
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Session WebXR — détection de la prise en charge et badge d'état
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
 * @param {'checking'|'supported'|'supported-webgl-test'|'emulated'|'needs-flag'|'unsupported'} state
 *   needs-flag : AR présente, mais sans liaison WebXR/WebGPU (réglage de Chrome à activer) ;
 *   supported-webgl-test : AR disponible en mode test WebGL (?webgl dans l'adresse)
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Session WebXR — détection de la prise en charge et badge d'état
 */
export function showXrStatus(statusElement, state) {
  statusElement.dataset.state = state;
  statusElement.textContent = STATUS_TEXT[state];
}
