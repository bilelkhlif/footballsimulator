/**
 * Serveur statique de développement : sert le dépôt avec les bons types MIME,
 * comme GitHub Pages, éventuellement sous un sous-chemin.
 *
 * Usage : npm start, puis ouvrir http://127.0.0.1:8080 (variable PORT pour changer de port).
 * Les tests l'importent pour démarrer leurs propres serveurs sur des ports libres.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Racine du dépôt : le dossier parent de tests/. */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Types MIME des fichiers servis ; les modules JavaScript exigent text/javascript. */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

/**
 * Démarre un serveur statique.
 * @param {{root?: string, port?: number, basePath?: string}} [options]
 *   root : dossier servi ; port : 0 pour un port libre ;
 *   basePath : sous-chemin de l'application, par exemple « /footballsimulator/ ».
 * @returns {Promise<{url: string, close: () => Promise<void>, setLatency: (ms: number, options?: {only?: string[]}) => void,
 *   setOverride: (file: string, content: string|null) => void}>}
 *   setLatency : retarde chaque réponse, pour simuler un réseau lent (0 : aucun retard) ; avec
 *   only, seulement celles de ces fichiers (chemins relatifs à l'application, sprint 6).
 *   setOverride : sert un autre contenu pour un fichier, pour simuler un nouveau déploiement sans
 *   toucher au dépôt (null : revient au fichier ; sprint 6).
 * @responsable Bilel Khlif
 * @date 2026-11-09
 * @role Tests — serveur statique local
 */
export function startServer({ root = REPO_ROOT, port = 0, basePath = '/' } = {}) {
  let latencyMs = 0;
  /** Fichiers retardés (chemins relatifs à l'application), ou null pour tous. */
  let latencyOnly = null;
  /** Contenus servis à la place de fichiers du dépôt. */
  const overrides = new Map();
  /** Réponses retardées en attente, annulées à l'arrêt du serveur. */
  const delayed = new Set();
  const server = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(basePath.length);
    if (latencyMs <= 0 || (latencyOnly && !latencyOnly.includes(relative))) {
      serveFile(request, response);
      return;
    }
    const timer = setTimeout(() => {
      delayed.delete(timer);
      if (!response.destroyed) {
        serveFile(request, response);
      }
    }, latencyMs);
    delayed.add(timer);
  });

  /**
   * Répond à une requête avec le fichier demandé.
   * @param {http.IncomingMessage} request
   * @param {http.ServerResponse} response
   */
  function serveFile(request, response) {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith(basePath)) {
      response.writeHead(404).end();
      return;
    }
    const relative = pathname.slice(basePath.length);
    if (overrides.has(relative)) {
      response.writeHead(200, { 'content-type': MIME_TYPES[path.extname(relative)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      response.end(overrides.get(relative));
      return;
    }
    let file = path.join(root, relative);
    if (!file.startsWith(root)) {
      response.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html');
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        response.writeHead(404, { 'content-type': 'text/plain' }).end('404');
        return;
      }
      response.writeHead(200, {
        'content-type': MIME_TYPES[path.extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      response.end(data);
    });
  }

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${server.address().port}${basePath}`;
      const close = () => new Promise((done) => {
        delayed.forEach(clearTimeout);
        delayed.clear();
        server.closeAllConnections();
        server.close(done);
      });
      /** Retarde les réponses de ms millisecondes, toutes ou seulement celles de certains fichiers. */
      const setLatency = (ms, { only = null } = {}) => {
        latencyMs = ms;
        latencyOnly = only;
      };
      /** Remplace le contenu servi d'un fichier (null : revient au fichier du dépôt). */
      const setOverride = (file, content) => {
        if (content === null) {
          overrides.delete(file);
        } else {
          overrides.set(file, content);
        }
      };
      resolve({ url, close, setLatency, setOverride });
    });
  });
}

// Lancement direct (npm start) : sert le dépôt jusqu'à l'arrêt avec Ctrl+C.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await startServer({ port: Number(process.env.PORT ?? 8080) });
  console.log(`Football Simulator est servi sur ${url}`);
}
