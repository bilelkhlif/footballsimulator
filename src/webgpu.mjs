/**
 * Moteur de rendu WebGPU, sans repli WebGL (sprint 3, demande de l'enseignant).
 *
 * three.js r187 fournit WebGPURenderer, qui bascule de lui-même sur WebGL 2 quand WebGPU
 * manque. L'application ne veut pas de ce repli : son moteur de rendu est construit ici à
 * partir de la classe de base Renderer, avec le seul backend WebGPU (WebGPUBackend) et sans
 * fonction de repli (getFallback: null). Si WebGPU manque, le démarrage échoue avec une cause
 * précise, que main.mjs affiche à la place du terrain.
 *
 * Le code du backend WebGL de three.js reste présent dans three.webgpu.js, mais rien ne
 * l'instancie : les tests de bout en bout vérifient qu'aucun contexte WebGL n'est créé.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { Renderer, StandardNodeLibrary, WebGPUBackend } from 'three/webgpu';

/** Causes d'échec du démarrage du rendu, portées par WebGpuUnavailableError.reason. */
export const WEBGPU_ERROR_REASONS = Object.freeze({
  NO_API: 'no-api', // navigator.gpu absent : navigateur sans WebGPU, ou page servie en HTTP
  NO_ADAPTER: 'no-adapter', // WebGPU présent, mais aucun processeur graphique utilisable
  WRONG_BACKEND: 'wrong-backend', // garde-fou : le moteur de rendu ne tourne pas sur WebGPU
});

/**
 * Erreur de démarrage du rendu WebGPU, avec sa cause (une valeur de WEBGPU_ERROR_REASONS).
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Rendu WebGPU — moteur sans repli WebGL
 */
export class WebGpuUnavailableError extends Error {
  /**
   * @param {string} reason une valeur de WEBGPU_ERROR_REASONS
   * @param {string} message
   * @param {{cause?: unknown}} [options]
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Rendu WebGPU — moteur sans repli WebGL
   */
  constructor(reason, message, options) {
    super(message, options);
    this.name = 'WebGpuUnavailableError';
    this.reason = reason;
  }
}

/**
 * Moteur de rendu three.js limité au backend WebGPU.
 * C'est WebGPURenderer sans sa ligne de repli : même backend, même bibliothèque de nœuds.
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Rendu WebGPU — moteur sans repli WebGL
 */
export class WebGpuOnlyRenderer extends Renderer {
  /**
   * @param {object} [parameters] paramètres de Renderer et de WebGPUBackend (antialias, alpha…)
   * @see ATTRIBUTION.md, §3 : code adapté du constructeur de WebGPURenderer (three.js r187, MIT)
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Rendu WebGPU — moteur sans repli WebGL
   */
  constructor(parameters = {}) {
    // getFallback: null : en cas d'échec de WebGPU, init() rejette au lieu de passer en WebGL.
    super(new WebGPUBackend(parameters), { ...parameters, getFallback: null });
    // Traduit les matériaux classiques (MeshStandardMaterial…) en matériaux à nœuds,
    // compilés en WGSL, le langage de shaders de WebGPU.
    this.library = new StandardNodeLibrary();
    this.isWebGPURenderer = true;
  }
}

/**
 * Indique si le navigateur expose l'API WebGPU. Comme WebXR, elle exige un contexte sécurisé.
 * @param {Navigator} [nav]
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Rendu WebGPU — moteur sans repli WebGL
 */
export function hasWebGpuApi(nav = globalThis.navigator) {
  return Boolean(nav?.gpu);
}

/**
 * Vérifie que le moteur de rendu tourne bien sur WebGPU (garde-fou contre tout repli).
 * @param {{backend?: {isWebGPUBackend?: boolean}}} renderer
 * @throws {WebGpuUnavailableError} si le backend n'est pas WebGPU
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Rendu WebGPU — moteur sans repli WebGL
 */
export function assertWebGpuBackend(renderer) {
  if (renderer?.backend?.isWebGPUBackend !== true) {
    throw new WebGpuUnavailableError(WEBGPU_ERROR_REASONS.WRONG_BACKEND, 'Le moteur de rendu ne tourne pas sur WebGPU.');
  }
}

/**
 * Décrit le processeur graphique en quelques mots, pour le badge de l'interface.
 * @param {{vendor?: string, architecture?: string, description?: string}|undefined} adapterInfo
 *   GPUAdapterInfo, lu sur device.adapterInfo
 * @returns {string} par exemple « nvidia ampere », ou « GPU » si le navigateur ne dit rien
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Rendu WebGPU — moteur sans repli WebGL
 */
export function describeAdapter(adapterInfo) {
  const words = [adapterInfo?.vendor, adapterInfo?.architecture].filter(Boolean);
  if (words.length) {
    return words.join(' ');
  }
  return adapterInfo?.description || 'GPU';
}

/**
 * Crée et initialise le moteur de rendu WebGPU.
 * @param {object} [options]
 * @param {boolean} [options.xrEnabled=true] active WebXR ; à fixer avant init(), car WebGPUBackend
 *   demande alors un adaptateur compatible XR (option xrCompatible de requestAdapter)
 * @returns {Promise<WebGpuOnlyRenderer>}
 * @throws {WebGpuUnavailableError} si WebGPU est absent ou inutilisable
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Rendu WebGPU — moteur sans repli WebGL
 */
export async function createWebGpuRenderer({ xrEnabled = true } = {}) {
  if (!hasWebGpuApi()) {
    throw new WebGpuUnavailableError(WEBGPU_ERROR_REASONS.NO_API, 'WebGPU est absent de ce navigateur.');
  }
  // alpha : fond transparent, pour superposer la scène à l'image de la caméra en AR.
  const renderer = new WebGpuOnlyRenderer({ antialias: true, alpha: true });
  renderer.xr.enabled = xrEnabled;
  try {
    // Demande l'adaptateur et le périphérique WebGPU, puis configure le canvas.
    await renderer.init();
  } catch (error) {
    throw new WebGpuUnavailableError(WEBGPU_ERROR_REASONS.NO_ADAPTER, 'Aucun processeur graphique WebGPU utilisable.', { cause: error });
  }
  assertWebGpuBackend(renderer);
  return renderer;
}
