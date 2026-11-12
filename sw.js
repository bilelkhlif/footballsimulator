/**
 * Service Worker de Football Simulator (cahier §2.3 et §3.3).
 * Il met l'application en cache à l'installation, pour qu'elle se lance
 * hors-ligne après une première visite.
 *
 * Stratégies :
 * - bibliothèques (src/vendor) et ressources (assets) : cache d'abord, car elles ne changent pas ;
 * - page, code et styles : réseau d'abord, avec repli sur le cache hors-ligne, ou quand le
 *   réseau met plus de NETWORK_TIMEOUT_MS à répondre (connexion lente ou instable).
 *
 * Tout nouveau fichier de l'application doit être ajouté à APP_SHELL. Incrémenter
 * CACHE_VERSION quand une bibliothèque ou une ressource change.
 */
const CACHE_VERSION = 1;
const CACHE_PREFIX = 'football-simulator-';
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
  './src/events.js',
  './src/xr-session.js',
  './src/ar-placement.js',
  './src/ar-view.js',
  './src/render-loop.js',
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
 * Délai d'attente du réseau, en millisecondes, quand le cache peut répondre à sa place.
 * Sur une connexion lente, le navigateur peut attendre plus d'une minute avant d'abandonner
 * une requête : sans ce délai, la page resterait bloquée sur « Chargement du terrain… ».
 */
const NETWORK_TIMEOUT_MS = 3000;

/**
 * Après un réseau trop lent ou coupé, durée pendant laquelle le cache répond directement,
 * sans attendre le réseau : les autres fichiers de la même page arrivent sans nouveau délai,
 * et la page reste cohérente, puisque tous ses fichiers viennent alors du cache.
 */
const SLOW_NETWORK_WINDOW_MS = 15000;

/** Instant jusqu'auquel le réseau est jugé trop lent (0 : réseau normal). */
let slowNetworkUntil = 0;

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
 * Télécharge un fichier et met à jour sa copie dans le cache.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function fetchAndCache(request) {
  const response = await fetch(request);
  await storeInCache(request, response);
  return response;
}

/**
 * Cherche la copie d'un fichier dans le cache. Pour une navigation, les paramètres de l'adresse
 * (« ?iwer », « ?debug ») sont ignorés, et la page d'accueil sert de repli.
 * @param {Request} request
 * @returns {Promise<Response|undefined>}
 */
async function findInCache(request) {
  const isNavigation = request.mode === 'navigate';
  const cached = await caches.match(request, { ignoreSearch: isNavigation });
  if (cached || !isNavigation) {
    return cached;
  }
  return caches.match('./index.html');
}

/**
 * Attend une promesse au plus `ms` millisecondes, puis la rejette.
 * @param {Promise<any>} promise
 * @param {number} ms
 * @returns {Promise<any>}
 */
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`réseau trop lent (plus de ${ms} ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Stratégie « réseau d'abord » : sert la version la plus récente du fichier.
 * Le cache répond à sa place si le réseau est coupé, s'il met plus de NETWORK_TIMEOUT_MS à
 * répondre, ou s'il vient d'être jugé trop lent. Le téléchargement continue alors en arrière-plan
 * et met le cache à jour pour le prochain lancement.
 * Sans copie en cache (première visite), la réponse du réseau est attendue sans limite.
 * @param {Request} request
 * @param {Promise<Response>} network téléchargement déjà lancé par fetchAndCache
 * @returns {Promise<Response>}
 */
async function networkFirst(request, network) {
  const cached = await findInCache(request);
  if (!cached) {
    return network;
  }
  if (Date.now() < slowNetworkUntil) {
    return cached;
  }
  try {
    return await withTimeout(network, NETWORK_TIMEOUT_MS);
  } catch {
    slowNetworkUntil = Date.now() + SLOW_NETWORK_WINDOW_MS;
    return cached;
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
  if (isImmutable) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // Le téléchargement est lancé ici pour que waitUntil garde le Service Worker actif
  // jusqu'à la mise à jour du cache, même quand le cache a déjà répondu à la page.
  const network = fetchAndCache(request);
  event.waitUntil(network.catch(() => undefined));
  event.respondWith(networkFirst(request, network));
});
