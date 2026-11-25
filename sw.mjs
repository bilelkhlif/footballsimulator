/**
 * Service Worker de Football Simulator (cahier §2.3 et §3.3, finalisé au sprint 6).
 * Il met l'application en cache à l'installation, pour qu'elle se lance hors-ligne après une
 * première visite.
 *
 * Coquille à version de contenu (sprint 6). Tous les fichiers de l'application (APP_SHELL) sont
 * téléchargés d'un bloc à l'installation, sans passer par le cache HTTP du navigateur, dans un
 * cache nommé d'après SHELL_VERSION, une empreinte de leur contenu. cache.addAll est atomique : la
 * version arrive en entier, ou pas du tout. Ils sont ensuite servis depuis ce cache (« cache
 * d'abord ») : une page ne mélange jamais deux versions, même sur un réseau lent ou coupé, et se
 * lance sans attendre le réseau.
 *
 * Mise à jour : quand un fichier de la coquille change, « npm run shell-version » recalcule
 * SHELL_VERSION. sw.mjs change donc ; le navigateur installe le nouveau Service Worker, qui
 * télécharge la nouvelle version complète, prend la main et supprime l'ancien cache ; la page
 * affiche « Nouvelle version installée ». Un test unitaire vérifie que SHELL_VERSION correspond au
 * contenu, et qu'aucun fichier chargé par l'application ne manque à APP_SHELL.
 *
 * Les autres requêtes de la même origine (module de l'émulateur, autres pages du dépôt) passent
 * par le réseau d'abord, avec repli sur le cache ; le CDN de l'émulateur IWER est ignoré.
 * Les requêtes Range restent au navigateur : une réponse complète du cache ne remplace jamais
 * une plage d'octets. Les réponses partielles 206 ne sont pas stockées. Hors coquille, une panne
 * du cache ne doit pas empêcher la transmission d'une réponse réseau valide.
 *
 * Module ES (migration .mjs, docs/migration-mjs.md) : src/pwa.mjs l'enregistre avec le type
 * « module ». Il n'importe rien, pour s'exécuter aussi en script classique dans un navigateur qui
 * refuse les Service Workers en module. Les installations antérieures, qui enregistraient sw.js,
 * passent à ce fichier par le script de migration sw.js ; le préfixe des caches est le même, et
 * l'activation supprime le cache de l'ancienne version.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
/** Empreinte du contenu de la coquille, écrite par « npm run shell-version » (tests/shell-version.mjs). */
const SHELL_VERSION = 'd8d1fcf84bd5635f';
const CACHE_PREFIX = 'football-simulator-';
const CACHE_NAME = `${CACHE_PREFIX}${SHELL_VERSION}`;

/** Fichiers nécessaires au lancement hors-ligne, relatifs à l'emplacement de ce fichier. */
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './src/styles.css',
  './src/main.mjs',
  './src/config.mjs',
  './src/scene.mjs',
  './src/pitch.mjs',
  './src/formations.mjs',
  './src/players.mjs',
  './src/team.mjs',
  './src/ball.mjs',
  './src/xr-support.mjs',
  './src/dev-emulator.mjs',
  './src/pwa.mjs',
  './src/events.mjs',
  './src/xr-session.mjs',
  './src/ar-placement.mjs',
  './src/ar-view.mjs',
  './src/render-loop.mjs',
  './src/webgpu.mjs',
  './src/webgl-test-mode.mjs',
  './src/reticle.mjs',
  './src/ar-surface.mjs',
  './src/tactics-board.mjs',
  './src/arrow-rules.mjs',
  './src/formation-transition.mjs',
  './src/formation-panel.mjs',
  './src/commands.mjs',
  './src/raycasting.mjs',
  './src/tactical-interaction.mjs',
  './src/tactical-view.mjs',
  './src/tactical-arrows.mjs',
  './src/tactical-toolbar.mjs',
  './src/keyboard-shortcuts.mjs',
  './src/onboarding.mjs',
  './src/workspace-controller.mjs',
  './src/workspace-navigation.mjs',
  './src/pointer-input.mjs',
  './src/xr-input.mjs',
  './src/diagnostics.mjs',
  './src/tactical-sequence.mjs',
  './src/sequence-player.mjs',
  './src/sequence-panel.mjs',
  './src/vendor/three-r187/build/three.webgpu.js',
  './src/vendor/three-r187/build/three.core.js',
  './src/vendor/three-r187/build/three.tsl.js',
  './src/vendor/three-r187/examples/jsm/controls/OrbitControls.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
];

/** Chemins de la coquille, résolus depuis l'emplacement de ce fichier (sous-chemin compris). */
const SHELL_PATHS = new Set(APP_SHELL.map((file) => new URL(file, self.location).pathname));

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
 * immédiatement la nouvelle version du Service Worker. Depuis le sprint 6, le téléchargement
 * contourne le cache HTTP du navigateur (cache: 'reload') : la version mise en cache est celle du
 * serveur, et non un mélange avec des fichiers gardés de la version précédente. cache.addAll échoue
 * en entier si un seul fichier manque : l'ancienne version reste alors en place.
 * @returns {Promise<void>}
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role PWA — Service Worker : installation et mise à jour du cache
 */
async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL.map((file) => new Request(file, { cache: 'reload' })));
  await self.skipWaiting();
}

/**
 * Supprime les caches des versions précédentes et prend le contrôle des pages ouvertes.
 * @returns {Promise<void>}
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role PWA — Service Worker : installation et mise à jour du cache
 */
async function removeOutdatedCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames
    .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
    .map((name) => caches.delete(name)));
  await self.clients.claim();
}

/**
 * Enregistre une copie complète de la réponse dans le cache, si elle est valide.
 * Cache.put refuse les réponses 206 : elles ne représentent qu'une plage du fichier.
 * @param {Request} request
 * @param {Response} response
 * @returns {Promise<void>}
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role PWA — Service Worker : stratégies de cache et hors-ligne
 */
async function storeInCache(request, response) {
  if (response.ok && response.status !== 206 && !/\bno-store\b/i.test(response.headers.get('Cache-Control') ?? '')
    && !/^video\//i.test(response.headers.get('Content-Type') ?? '')) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
}

/**
 * Coquille de l'application : répond depuis le cache de la version installée, sans attendre le
 * réseau ; les paramètres de l'adresse (« ?debug », « ?iwer ») sont ignorés. Un fichier absent du
 * cache est téléchargé, mais pas ajouté au cache de la version : il pourrait venir d'une autre.
 * @param {Request} request
 * @returns {Promise<Response>}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role PWA — Service Worker : coquille à version de contenu
 */
async function fromShell(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  return cached ?? fetch(request);
}

/**
 * Télécharge un fichier et tente de mettre à jour sa copie dans le cache.
 * Un quota dépassé ou un cache indisponible n'invalide pas la réponse du serveur.
 * @param {Request} request
 * @returns {Promise<Response>}
 * @responsable Bilel Khlif
 * @date 2026-11-12
 * @role PWA — Service Worker : stratégies de cache et hors-ligne
 */
async function fetchAndCache(request) {
  const response = await fetch(request);
  try {
    await storeInCache(request, response);
  } catch {
    // Le cache d'exécution est facultatif ; la coquille garde son installation atomique.
  }
  return response;
}

/**
 * Cherche la copie d'un fichier dans le cache. Pour une navigation, les paramètres de l'adresse
 * (« ?iwer », « ?debug ») sont ignorés, et la page d'accueil sert de repli.
 * @param {Request} request
 * @returns {Promise<Response|undefined>}
 * @responsable Bilel Khlif
 * @date 2026-11-12
 * @role PWA — Service Worker : stratégies de cache et hors-ligne
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
 * @responsable Bilel Khlif
 * @date 2026-11-12
 * @role PWA — Service Worker : stratégies de cache et hors-ligne
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
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role PWA — Service Worker : stratégies de cache et hors-ligne
 */
async function networkFirst(request, network) {
  const cached = await findInCache(request).catch(() => undefined);
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
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role PWA — Service Worker : installation et mise à jour du cache
 */
self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell());
});

/**
 * Activation : nettoie les anciens caches.
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role PWA — Service Worker : installation et mise à jour du cache
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(removeOutdatedCaches());
});

/**
 * Requêtes : seules les requêtes GET vers l'application elle-même passent par le cache.
 * Le CDN de l'émulateur IWER, utilisé seulement en développement, est ignoré. Depuis le sprint 6,
 * les fichiers de la coquille viennent tous du cache de la même version.
 * Range et vidéo passent directement au réseau, y compris pour un chemin de la coquille.
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role PWA — Service Worker : interception des requêtes
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('Range')
    || request.destination === 'video' || /\.(?:mp4|m4v|mov|webm|mkv|ogv|avi)$/i.test(url.pathname)) {
    return;
  }
  if (SHELL_PATHS.has(url.pathname)) {
    event.respondWith(fromShell(request));
    return;
  }
  // Le téléchargement est lancé ici pour que waitUntil garde le Service Worker actif
  // jusqu'à la mise à jour du cache, même quand le cache a déjà répondu à la page.
  const network = fetchAndCache(request);
  event.waitUntil(network.catch(() => undefined));
  event.respondWith(networkFirst(request, network));
});
