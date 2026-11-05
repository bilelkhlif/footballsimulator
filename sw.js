/**
 * Service Worker d'AR Football Tactics (cahier §2.3 et §3.3).
 * Il met l'application en cache à l'installation, pour qu'elle se lance
 * hors-ligne après une première visite.
 *
 * Stratégies :
 * - bibliothèques (src/vendor) et ressources (assets) : cache d'abord, car elles ne changent pas ;
 * - page, code et styles : réseau d'abord, avec repli sur le cache hors-ligne.
 *
 * Tout nouveau fichier de l'application doit être ajouté à APP_SHELL. Incrémenter
 * CACHE_VERSION quand une bibliothèque ou une ressource change.
 */
const CACHE_VERSION = 1;
const CACHE_PREFIX = 'ar-football-tactics-';
const CACHE_NAME = `${CACHE_PREFIX}v${CACHE_VERSION}`;

/** Fichiers nécessaires au lancement hors-ligne, relatifs à l'emplacement de ce fichier. */
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './src/styles.css',
  './src/main.js',
  './src/config.js',
  './src/scene.js',
  './src/pitch.js',
  './src/formations.js',
  './src/players.js',
  './src/team.js',
  './src/ball.js',
  './src/xr-support.js',
  './src/dev-emulator.js',
  './src/pwa.js',
  './src/vendor/three/build/three.module.js',
  './src/vendor/three/build/three.core.js',
  './src/vendor/three/examples/jsm/controls/OrbitControls.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
];

/** Parties de chemin servies en « cache d'abord ». */
const IMMUTABLE_PATHS = ['/src/vendor/', '/assets/'];

/**
 * Télécharge et met en cache les fichiers de l'application, puis active
 * immédiatement la nouvelle version du Service Worker.
 * @returns {Promise<void>}
 */
async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);
  await self.skipWaiting();
}

/**
 * Supprime les caches des versions précédentes et prend le contrôle des pages ouvertes.
 * @returns {Promise<void>}
 */
async function removeOutdatedCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames
    .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
    .map((name) => caches.delete(name)));
  await self.clients.claim();
}

/**
 * Enregistre une copie de la réponse dans le cache, si elle est valide.
 * @param {Request} request
 * @param {Response} response
 * @returns {Promise<void>}
 */
async function storeInCache(request, response) {
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
}

/**
 * Stratégie « cache d'abord » : répond depuis le cache, sinon télécharge et met en cache.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  await storeInCache(request, response);
  return response;
}

/**
 * Stratégie « réseau d'abord » : télécharge la version la plus récente et met le cache à jour.
 * Hors-ligne, répond depuis le cache, ou avec la page d'accueil pour une navigation.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    await storeInCache(request, response);
    return response;
  } catch (error) {
    const isNavigation = request.mode === 'navigate';
    const cached = await caches.match(request, { ignoreSearch: isNavigation });
    if (cached) {
      return cached;
    }
    if (isNavigation) {
      const home = await caches.match('./index.html');
      if (home) {
        return home;
      }
    }
    throw error;
  }
}

/**
 * Installation : met en cache tous les fichiers de l'application.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell());
});

/**
 * Activation : nettoie les anciens caches.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(removeOutdatedCaches());
});

/**
 * Requêtes : seules les requêtes GET vers l'application elle-même passent par le cache.
 * Le CDN de l'émulateur IWER, utilisé seulement en développement, est ignoré.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }
  const isImmutable = IMMUTABLE_PATHS.some((path) => url.pathname.includes(path));
  event.respondWith(isImmutable ? cacheFirst(request) : networkFirst(request));
});
