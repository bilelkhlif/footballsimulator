/**
 * Application installable (PWA) : enregistrement du Service Worker.
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
