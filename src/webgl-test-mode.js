/**
 * Mode test WebGL : un rendu WebGL 2, réservé aux tests, sur demande explicite (?webgl).
 *
 * Ce n'est pas un repli. Le rendu de l'application est WebGPU, sans repli (src/webgpu.js) :
 * quand WebGPU manque, l'application affiche un message, et rien ne bascule vers WebGL.
 * Ce mode sert seulement à tester l'application, AR comprise, sur un appareil dont le
 * navigateur bloque WebGPU : par exemple un Galaxy S10e sous Android 9, où Chrome 138 refuse
 * WebGPU. Il ne démarre que si l'adresse contient ?webgl, comme ?iwer (émulateur) et ?debug :
 * aucun bouton de l'application n'y mène, et aucun code ne le choisit à la place de l'utilisateur.
 */
import { WebGPURenderer } from 'three/webgpu';

/** Paramètre d'adresse qui demande le mode test WebGL. */
export const WEBGL_TEST_PARAMETER = 'webgl';

/** Modes de rendu de l'application. */
export const RENDER_MODES = Object.freeze({
  WEBGPU: 'webgpu', // le rendu de l'application, partout
  WEBGL_TEST: 'webgl-test', // tests seulement, avec ?webgl dans l'adresse
});

/** Erreur de démarrage du mode test : WebGL 2 est indisponible. */
export class WebGlTestModeUnavailableError extends Error {
  /**
   * @param {string} message
   * @param {{cause?: unknown}} [options]
   */
  constructor(message, options) {
    super(message, options);
    this.name = 'WebGlTestModeUnavailableError';
  }
}

/**
 * Lit le mode de rendu demandé dans l'adresse de la page : WebGPU, sauf ?webgl.
 * @param {string} [search] partie « ?… » de l'adresse
 * @returns {string} une valeur de RENDER_MODES
 */
export function getRequestedRenderMode(search = globalThis.location?.search ?? '') {
  return new URLSearchParams(search).has(WEBGL_TEST_PARAMETER) ? RENDER_MODES.WEBGL_TEST : RENDER_MODES.WEBGPU;
}

/**
 * Crée le moteur de rendu du mode test : WebGPURenderer de three.js, forcé sur son backend
 * WebGL 2 (option forceWebGL). Il n'a, lui non plus, aucune fonction de repli.
 * @param {object} [options]
 * @param {boolean} [options.xrEnabled=true] active WebXR (session AR par une couche WebGL)
 * @returns {Promise<import('three/webgpu').WebGPURenderer>}
 * @throws {WebGlTestModeUnavailableError} si WebGL 2 est indisponible
 */
export async function createWebGlTestRenderer({ xrEnabled = true } = {}) {
  const renderer = new WebGPURenderer({ antialias: true, alpha: true, forceWebGL: true });
  renderer.xr.enabled = xrEnabled;
  try {
    await renderer.init();
  } catch (error) {
    throw new WebGlTestModeUnavailableError('WebGL 2 est indisponible sur ce navigateur.', { cause: error });
  }
  if (renderer.backend.isWebGLBackend !== true) {
    throw new WebGlTestModeUnavailableError('Le mode test ne tourne pas sur WebGL 2.');
  }
  return renderer;
}
