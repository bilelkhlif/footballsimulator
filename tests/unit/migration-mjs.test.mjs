/**
 * Tests unitaires de la migration des modules en .mjs (docs/migration-mjs.md) : plus aucun fichier
 * JavaScript du projet en .js, hors bibliothèques tierces et script de migration sw.js ; chaque
 * import relatif pointe vers un fichier existant ; la page charge src/main.mjs ; le Service Worker
 * s'enregistre en module ; sw.js fait passer une ancienne installation à sw.mjs.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { registerServiceWorker, SERVICE_WORKER_URL } from '../../src/pwa.mjs';

/** Racine du dépôt. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Dossiers ignorés : dépendances, historique git, bibliothèques tierces copiées dans le dépôt. */
const IGNORED = new Set(['node_modules', '.git', '.audit', path.join('src', 'vendor'),
  path.join('analysis', '.venv'), path.join('analysis', 'data')]);

/**
 * Fichiers du dépôt, relatifs à la racine, hors dossiers ignorés.
 * @param {string} [directory]
 * @returns {string[]}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests unitaires (migration .mjs) — outil de vérification
 */
function listFiles(directory = '') {
  return readdirSync(path.join(ROOT, directory)).flatMap((name) => {
    const relative = path.join(directory, name);
    if (IGNORED.has(relative)) {
      return [];
    }
    return statSync(path.join(ROOT, relative)).isDirectory() ? listFiles(relative) : [relative.split(path.sep).join('/')];
  });
}

/**
 * Spécificateurs des import et export statiques, et des import() dynamiques, d'un module.
 * @param {string} source
 * @returns {string[]}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests unitaires (migration .mjs) — outil de vérification
 */
function importSpecifiers(source) {
  const statics = [...source.matchAll(/(?:^|\n)\s*(?:import|export)\s(?:[^'";]*?\sfrom\s)?\s*['"]([^'"]+)['"]/g)];
  const dynamics = [...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)];
  return [...statics, ...dynamics].map(([, specifier]) => specifier);
}

test('plus aucun module du projet en .js : seuls restent les fichiers tiers et le script de migration sw.js', () => {
  const javascript = listFiles().filter((file) => file.endsWith('.js'));
  assert.deepEqual(javascript, ['sw.js']);
  const modules = listFiles('src').filter((file) => file.endsWith('.mjs'));
  assert.ok(modules.length >= 36, `${modules.length} modules .mjs dans src/`);
  assert.ok(existsSync(path.join(ROOT, 'sw.mjs')));
});

test('chaque import relatif du projet pointe vers un fichier .mjs existant', () => {
  const sources = listFiles().filter((file) => file.endsWith('.mjs'));
  const problems = [];
  for (const file of sources) {
    for (const specifier of importSpecifiers(readFileSync(path.join(ROOT, file), 'utf8'))) {
      if (!specifier.startsWith('.')) {
        continue; // « three », « node:… », « playwright-core » : carte d'import ou paquets
      }
      const target = path.resolve(path.dirname(path.join(ROOT, file)), specifier);
      if (!existsSync(target)) {
        problems.push(`${file} → ${specifier} (absent)`);
      } else if (!specifier.endsWith('.mjs')) {
        problems.push(`${file} → ${specifier} (pas en .mjs)`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('la page charge src/main.mjs comme module, et la carte d\'import ne vise que three.js (tiers)', () => {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"[^>]*>/g)].map(([tag, src]) => ({ tag, src }));
  assert.deepEqual(scripts.map(({ src }) => src), ['src/main.mjs']);
  assert.match(scripts[0].tag, /type="module"/);
  const imports = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  assert.ok(Object.values(imports).every((target) => target.startsWith('./src/vendor/')));
});

test('le Service Worker s\'enregistre en module à l\'adresse sw.mjs', async () => {
  const calls = [];
  const container = { register: async (url, options) => { calls.push([url, options]); return { scope: './' }; } };
  const previous = globalThis.isSecureContext;
  globalThis.isSecureContext = true;
  try {
    assert.deepEqual(await registerServiceWorker(container), { scope: './' });
  } finally {
    globalThis.isSecureContext = previous;
  }
  assert.equal(SERVICE_WORKER_URL, './sw.mjs');
  assert.deepEqual(calls, [['./sw.mjs', { type: 'module' }]]);
});

test('navigateur sans Service Worker en module : sw.mjs s\'enregistre en script classique ; autre erreur : pas de nouvel essai', async () => {
  const previous = globalThis.isSecureContext;
  const warn = console.warn;
  globalThis.isSecureContext = true;
  console.warn = () => {};
  try {
    const calls = [];
    const refusesModules = {
      register: async (url, options) => {
        calls.push(options.type);
        if (options.type === 'module') {
          throw new TypeError('module workers unsupported');
        }
        return { scope: './' };
      },
    };
    assert.deepEqual(await registerServiceWorker(refusesModules), { scope: './' });
    assert.deepEqual(calls, ['module', 'classic']);

    const insecure = [];
    const refused = { register: async (url, options) => { insecure.push(options.type); throw new Error('SecurityError'); } };
    assert.equal(await registerServiceWorker(refused), null);
    assert.deepEqual(insecure, ['module']);
  } finally {
    globalThis.isSecureContext = previous;
    console.warn = warn;
  }
});

test('sw.mjs n\'importe rien : il s\'exécute aussi en script classique', () => {
  const source = readFileSync(path.join(ROOT, 'sw.mjs'), 'utf8');
  assert.deepEqual(importSpecifiers(source), []);
  assert.doesNotThrow(() => new vm.Script(source), 'syntaxe de script classique');
});

test('sw.js, script de migration : supprime les caches de l\'application, se désinscrit et recharge les pages', async () => {
  const log = [];
  const listeners = {};
  const pages = [
    { url: 'https://exemple.test/app/?debug', navigate: async (url) => { log.push(`navigate ${url}`); } },
    { url: 'https://exemple.test/app/', navigate: async (url) => { log.push(`navigate ${url}`); } },
  ];
  const sandbox = {
    self: {
      addEventListener: (type, listener) => { listeners[type] = listener; },
      skipWaiting: async () => { log.push('skipWaiting'); },
      registration: { unregister: async () => { log.push('unregister'); return true; } },
      clients: { matchAll: async (options) => { log.push(`matchAll ${options.type}`); return pages; } },
    },
    caches: {
      keys: async () => ['football-simulator-0cabdc0abc04da44', 'autre-site'],
      delete: async (name) => { log.push(`delete ${name}`); return true; },
    },
  };
  vm.runInNewContext(readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), sandbox);
  assert.deepEqual(Object.keys(listeners).sort(), ['activate', 'install'], 'aucun gestionnaire fetch : tout passe par le réseau');

  /** Événement de cycle de vie : attend la promesse confiée à waitUntil. */
  const dispatch = async (type) => {
    let pending = Promise.resolve();
    listeners[type]({ waitUntil: (promise) => { pending = promise; } });
    await pending;
  };
  await dispatch('install');
  await dispatch('activate');
  assert.deepEqual(log, [
    'skipWaiting',
    'delete football-simulator-0cabdc0abc04da44',
    'matchAll window',
    'unregister',
    'navigate https://exemple.test/app/?debug',
    'navigate https://exemple.test/app/',
  ]);
});
