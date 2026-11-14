/**
 * Application installable (PWA, cahier §2.3 et §3.3) : Service Worker, installation,
 * nouvelle version et état du réseau.
 *
 * - Le Service Worker (sw.js) met l'application en cache pour qu'elle se lance hors-ligne.
 * - Le bouton « Installer l'application » apparaît quand le navigateur propose l'installation
 *   (événement beforeinstallprompt, Chrome et Edge) ; il disparaît une fois l'application installée.
 * - Quand une nouvelle version du Service Worker prend le relais, un message propose de recharger.
 * - Le badge « Hors-ligne » s'affiche quand le réseau est coupé.
 *
 * Le navigateur n'accepte un Service Worker qu'en HTTPS, ou sur localhost.
 */

/**
 * Enregistre le Service Worker situé à la racine de l'application.
 * Son emplacement fixe sa portée : il contrôle toutes les pages du dossier.
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register('./sw.js');
  } catch (error) {
    console.warn('Service Worker non enregistré :', error);
    return null;
  }
}

/**
 * Prévient quand une nouvelle version du Service Worker prend le contrôle de la page.
 * À la toute première visite, le Service Worker prend aussi le contrôle (clients.claim) : ce n'est
 * pas une nouvelle version, et rien n'est signalé.
 * @param {() => void} onUpdate appelé une fois, quand une nouvelle version est active
 */
export function watchForUpdates(onUpdate) {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  const hadController = Boolean(navigator.serviceWorker.controller);
  let notified = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !notified) {
      notified = true;
      onUpdate();
    }
  });
}

/**
 * Indique si l'application tourne déjà comme application installée (sans barre d'adresse).
 * @returns {boolean}
 */
export function isInstalled() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

/**
 * Branche le bouton d'installation sur l'invite d'installation du navigateur.
 * @param {HTMLButtonElement} button bouton masqué au départ
 */
export function setUpInstallButton(button) {
  /** Invite d'installation mise de côté, en attendant le clic de l'utilisateur. */
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Le navigateur afficherait sinon sa propre bannière : on garde l'invite pour notre bouton.
    event.preventDefault();
    if (isInstalled()) {
      return;
    }
    deferredPrompt = event;
    button.hidden = false;
  });

  button.addEventListener('click', async () => {
    if (!deferredPrompt) {
      return;
    }
    const prompt = deferredPrompt;
    deferredPrompt = null; // une invite ne peut servir qu'une fois
    button.hidden = true;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome !== 'accepted') {
      console.info('Installation refusée par l’utilisateur.');
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    button.hidden = true;
  });
}

/**
 * Affiche le badge « Hors-ligne » quand le réseau est coupé.
 * @param {HTMLElement} badge
 */
export function watchNetworkStatus(badge) {
  const update = () => {
    badge.hidden = navigator.onLine;
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}
