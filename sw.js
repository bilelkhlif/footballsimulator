/**
 * Script de migration de l'ancien Service Worker (sw.js) vers le nouveau (sw.mjs).
 *
 * Avant la migration en modules .mjs, l'application enregistrait « ./sw.js ». Une application déjà installée
 * se lance depuis son cache (« cache d'abord ») : elle ne voit jamais la nouvelle page, qui
 * enregistre sw.mjs. Le seul lien avec le serveur est la vérification de mise à jour que le
 * navigateur fait sur l'adresse du Service Worker enregistré, ici « ./sw.js ». Ce fichier doit donc
 * rester à cette adresse : sans lui, cette vérification échouerait (erreur 404) et l'ancienne
 * version resterait servie depuis son cache, indéfiniment.
 *
 * Quand le navigateur le trouve, il l'installe comme nouvelle version de l'ancien Service Worker.
 * Il prend alors la main (skipWaiting), supprime les caches de l'application, se désinscrit et
 * recharge les pages ouvertes. Rechargées sans Service Worker, elles viennent du réseau : la
 * nouvelle page enregistre sw.mjs, qui remet l'application en cache pour le hors-ligne.
 *
 * Il n'intercepte aucune requête (pas de gestionnaire fetch) : pendant la migration, tout passe
 * par le réseau. C'est le seul fichier JavaScript du projet resté en .js, hors bibliothèques
 * tierces (docs/migration-mjs.md).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/** Préfixe des caches de l'application, ancienne et nouvelle versions (sw.mjs). */
const CACHE_PREFIX = 'football-simulator-';

/**
 * Supprime les caches de l'application, se désinscrit, puis recharge les pages qu'il contrôle.
 * Les pages viennent alors du réseau et enregistrent le nouveau Service Worker (sw.mjs).
 * @returns {Promise<void>}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role PWA — migration de sw.js vers sw.mjs
 */
async function migrateToModuleWorker() {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name)));
  // Pages contrôlées, relevées avant la désinscription ; elles le restent jusqu'au rechargement.
  const pages = await self.clients.matchAll({ type: 'window' });
  await self.registration.unregister();
  await Promise.all(pages.map((page) => page.navigate(page.url).catch(() => undefined)));
}

/**
 * Installation : prend la place de l'ancien Service Worker sans attendre la fermeture des pages.
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role PWA — migration de sw.js vers sw.mjs
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

/**
 * Activation : migration vers sw.mjs.
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role PWA — migration de sw.js vers sw.mjs
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(migrateToModuleWorker());
});
