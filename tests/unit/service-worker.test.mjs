/**
 * Tests unitaires de la coquille du Service Worker (sprint 6) : tout fichier chargé par
 * l'application est dans APP_SHELL, chaque entrée existe, et SHELL_VERSION correspond au contenu
 * des fichiers. Une version périmée ferait servir une coquille qui ne correspond plus au code.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { computeShellVersion, readAppShell, readShellVersion, REPO_ROOT } from '../shell-version.mjs';

/**
 * Chemin relatif au dépôt, au format de APP_SHELL (« ./src/main.mjs »).
 * @param {string} absolute
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Tests unitaires (sw.mjs) — outil de vérification
 */
function shellPath(absolute) {
  return `./${path.relative(REPO_ROOT, absolute).split(path.sep).join('/')}`;
}

/**
 * Fichiers chargés au démarrage : page, styles, manifeste, puis tous les modules atteints par des
 * import statiques depuis src/main.mjs, la carte d'import de index.html résolvant « three ». Les
 * import() dynamiques (émulateur, seulement avec ?iwer) n'en font pas partie.
 * @returns {Set<string>}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Tests unitaires (sw.mjs) — outil de vérification
 */
function loadedFiles() {
  const html = readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
  const importMap = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  const files = new Set(['./index.html']);
  for (const [, href] of html.matchAll(/<link[^>]+href="([^"]+)"/g)) {
    files.add(`./${href}`);
  }
  const pending = [path.join(REPO_ROOT, 'src/main.mjs')];
  while (pending.length) {
    const file = pending.pop();
    const relative = shellPath(file);
    if (files.has(relative) && relative !== './src/main.mjs') {
      continue;
    }
    files.add(relative);
    const source = readFileSync(file, 'utf8');
    const specifiers = [...source.matchAll(/(?:^|\n)\s*(?:import|export)\s(?:[^'";]*?\sfrom\s)?\s*['"]([^'"]+)['"]/g)].map(([, spec]) => spec);
    for (const specifier of specifiers) {
      let target;
      if (specifier.startsWith('.')) {
        target = path.resolve(path.dirname(file), specifier);
      } else {
        const prefix = Object.keys(importMap).find((key) => specifier === key || (key.endsWith('/') && specifier.startsWith(key)));
        assert.ok(prefix, `module sans entrée dans la carte d'import : ${specifier}`);
        target = path.join(REPO_ROOT, importMap[prefix] + specifier.slice(prefix.length));
      }
      if (!files.has(shellPath(target))) {
        pending.push(target);
      }
    }
  }
  const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, 'manifest.json'), 'utf8'));
  for (const icon of manifest.icons) {
    files.add(`./${icon.src}`);
  }
  return files;
}

test('chaque fichier chargé par l\'application est dans APP_SHELL : elle se lance hors-ligne', () => {
  const shell = new Set(readAppShell());
  const missing = [...loadedFiles()].filter((file) => !shell.has(file));
  assert.deepEqual(missing, [], 'à ajouter à APP_SHELL dans sw.mjs, puis npm run shell-version');
  assert.ok(shell.has('./src/sequence-player.mjs') && shell.has('./src/vendor/three-r187/build/three.core.js'));
});

test('chaque entrée de APP_SHELL existe : une seule absente ferait échouer toute l\'installation', () => {
  const absent = readAppShell().filter((file) => file !== './' && !existsSync(path.join(REPO_ROOT, file)));
  assert.deepEqual(absent, []);
});

test('SHELL_VERSION correspond au contenu de la coquille', () => {
  assert.equal(readShellVersion(), computeShellVersion(), 'coquille modifiée : lancer « npm run shell-version »');
  assert.match(readShellVersion(), /^[0-9a-f]{16}$/);
});
