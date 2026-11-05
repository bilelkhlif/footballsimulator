/**
 * Émulation WebXR pour tester l'AR sur PC, sans téléphone (cahier §4.2).
 *
 * L'Immersive Web Emulator prévu au cahier est archivé depuis le 1er octobre 2026 ;
 * on utilise son moteur, IWER (Meta, licence MIT). IWER remplace navigator.xr par un
 * casque Meta Quest 3 simulé. Vérifié au sprint 1 :
 * - une session immersive-ar s'ouvre, avec local-floor et les ancres (suffisant au sprint 2) ;
 * - le hit test exige en plus le module d'environnement synthétique @iwer/sem (sprint 3) ;
 * - le DOM Overlay n'est pas émulé : l'interface HTML se teste dans la vue 3D.
 *
 * Activation : ajouter ?iwer à l'adresse, par exemple http://localhost:8080/?iwer
 * Le module n'est jamais chargé sans ce paramètre, ni quand l'AR native existe déjà.
 */
import { isImmersiveArSupported } from './xr-support.js';

/** Version épinglée d'IWER (la 2.8.0, publiée la veille du sprint 1, n'a pas été retenue). */
const IWER_MODULE_URL = 'https://cdn.jsdelivr.net/npm/iwer@2.7.0/build/iwer.module.js';

/** Paramètre d'adresse qui active l'émulation. */
const EMULATOR_QUERY_PARAMETER = 'iwer';

/**
 * Installe l'émulateur IWER si l'adresse le demande et que l'AR native est absente.
 * Doit être appelé avant toute autre utilisation de navigator.xr.
 * Chrome sur PC expose déjà un navigator.xr natif, mais sans AR : l'installation est
 * donc forcée, ce qui ne remplace jamais un navigateur capable d'AR (vérifié juste avant).
 * @returns {Promise<boolean>} vrai si l'émulateur a été installé
 */
export async function installEmulatorIfRequested() {
  const requested = new URLSearchParams(window.location.search).has(EMULATOR_QUERY_PARAMETER);
  if (!requested || await isImmersiveArSupported()) {
    return false;
  }
  try {
    const { XRDevice, metaQuest3 } = await import(IWER_MODULE_URL);
    const xrDevice = new XRDevice(metaQuest3);
    xrDevice.installRuntime({ forceInstall: true });
    return true;
  } catch (error) {
    console.warn('Émulateur IWER indisponible :', error);
    return false;
  }
}
