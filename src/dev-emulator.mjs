/**
 * Émulation WebXR pour tester l'AR sur PC, sans téléphone (cahier §4.2).
 *
 * L'Immersive Web Emulator prévu au cahier est archivé depuis le 1er octobre 2026 ;
 * on utilise son moteur, IWER (Meta, licence MIT). IWER remplace navigator.xr par un
 * casque Meta Quest 3 simulé, en vue unique comme un téléphone. Vérifié aux sprints 1 à 3 :
 * - une session immersive-ar s'ouvre, avec local-floor et les ancres ;
 * - IWER n'émule ni la liaison WebXR/WebGPU (XRGPUBinding) ni le hit test sans son module
 *   d'environnement synthétique : src/dev-xr-emulation.mjs les ajoute (sprint 3) ;
 * - le DOM Overlay n'est pas émulé : l'interface HTML reste au-dessus grâce à styles.css.
 *
 * Activation : ajouter ?iwer à l'adresse, par exemple http://localhost:8080/?iwer
 * Le module n'est jamais chargé sans ce paramètre, ni quand l'AR native existe déjà.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { isImmersiveArSupported } from './xr-support.mjs';

/** Version épinglée d'IWER (la 2.8.0, publiée la veille du sprint 1, n'a pas été retenue). */
const IWER_MODULE_URL = 'https://cdn.jsdelivr.net/npm/iwer@2.7.0/build/iwer.module.js';

/** Paramètre d'adresse qui active l'émulation. */
const EMULATOR_QUERY_PARAMETER = 'iwer';

/**
 * Installe l'émulateur IWER si l'adresse le demande et que l'AR native est absente.
 * Doit être appelé avant toute autre utilisation de navigator.xr, et avant la création du moteur
 * de rendu (voir src/dev-xr-emulation.mjs).
 * Chrome sur PC expose déjà un navigator.xr natif, mais sans AR : l'installation est
 * donc forcée, ce qui ne remplace jamais un navigateur capable d'AR (vérifié juste avant).
 * @returns {Promise<{xrDevice: object, setCanvas: (canvas: HTMLCanvasElement) => void}|null>}
 *   l'appareil émulé, et de quoi lui donner le canvas WebGPU de l'application ; null sans émulation
 * @see ATTRIBUTION.md, §3 : code adapté du guide de démarrage d'IWER (Meta, licence MIT)
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Développement — chargement de l'émulateur WebXR (IWER)
 */
export async function installEmulatorIfRequested() {
  const requested = new URLSearchParams(window.location.search).has(EMULATOR_QUERY_PARAMETER);
  if (!requested || await isImmersiveArSupported()) {
    return null;
  }
  try {
    const { XRDevice, metaQuest3 } = await import(IWER_MODULE_URL);
    const { installXrEmulationExtras } = await import('./dev-xr-emulation.mjs');
    // L'appareil émulé annonce la fonctionnalité webgpu : IWER accepte alors la session
    // demandée par src/xr-session.mjs, et dev-xr-emulation.mjs fournit XRGPUBinding.
    const xrDevice = new XRDevice({
      ...metaQuest3,
      supportedFeatures: [...metaQuest3.supportedFeatures, 'webgpu'],
    });
    xrDevice.installRuntime({ forceInstall: true });
    const { setCanvas } = installXrEmulationExtras({ xrDevice });
    return { xrDevice, setCanvas };
  } catch (error) {
    console.warn('Émulateur IWER indisponible :', error);
    return null;
  }
}
