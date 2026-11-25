/**
 * Le site préparé doit être autonome et ne jamais embarquer l'environnement d'analyse privé.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { preparePages } from '../prepare-pages.mjs';
import { readAppShell, REPO_ROOT } from '../shell-version.mjs';

/** Modules du visualiseur passés en .mjs par l'intégration (docs/integration-visualiseur.md). */
const MIGRATED = ['analytics', 'api-client', 'auto-placement', 'format', 'overlay-frame', 'overlay-pitch',
  'tracking-store', 'video-annotations', 'visualizer-main'];

/**
 * Fichiers d'un dossier, relatifs à lui, récursivement.
 * @param {string} directory
 * @returns {string[]}
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Tests unitaires — préparation du site statique
 */
function listFiles(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}

/**
 * Imports d'un module ES : statiques, dynamiques et sans liaison.
 * @param {string} source
 * @returns {string[]}
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Tests unitaires — préparation du site statique
 */
function importsOf(source) {
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

test('la préparation Pages contient la coquille et tout le visualiseur, sans serveur, poids ou données privées', () => {
  const output = preparePages();
  try {
    for (const file of [...readAppShell(), 'visualizer.html', 'demo/index.json', 'demo/matches/match-synthetique/video.mp4', 'THIRD_PARTY_NOTICES.md',
      'LICENSING.md', 'REUSE.toml', 'LICENSES/AGPL-3.0-only.txt', 'LICENSES/MIT.txt', 'LICENSES/LicenseRef-Equipe-Droits-Reserves.txt']) {
      assert.ok(existsSync(path.join(output, file)), file);
    }
    assert.deepEqual(listFiles(path.join(output, 'src')), listFiles(path.join(REPO_ROOT, 'src')), 'src/ copié à l\'identique');
    for (const name of MIGRATED) {
      assert.ok(existsSync(path.join(output, 'src/visualizer', `${name}.mjs`)), name);
    }
    for (const privatePath of ['analysis', 'node_modules', '.git', '.audit', 'tests', 'docs']) {
      assert.equal(existsSync(path.join(output, privatePath)), false, privatePath);
    }
    const files = listFiles(output);
    assert.deepEqual(files.filter((file) => /\.(?:pt|pth|onnx|safetensors|sqlite3?|db)$/i.test(file)), [], 'aucun poids ni base');
    assert.deepEqual(files.filter((file) => /\.(?:mp4|webm|mov)$/i.test(file)),
      ['demo/matches/france-allemagne-2018/video.mp4', 'demo/matches/match-synthetique/video.mp4'],
      'seules les vidéos publiques relues sont publiées');
    assert.throws(() => preparePages({ output }), /existe déjà/);
  } finally {
    assert.ok(output.startsWith(path.join(os.tmpdir(), 'football-pages-preview-')));
    rmSync(output, { recursive: true });
  }
});

test('une démonstration non synthétique arrête la préparation avant toute copie', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'football-pages-root-'));
  const parent = mkdtempSync(path.join(os.tmpdir(), 'football-pages-out-'));
  const output = path.join(parent, 'site');
  try {
    mkdirSync(path.join(root, 'demo'));
    writeFileSync(path.join(root, 'demo/index.json'), JSON.stringify({ matches: [{ id: 'reel', path: 'matches/reel/', kind: 'analysis' }] }));
    assert.throws(() => preparePages({ root, output }), /revue explicite des droits/);
    assert.equal(existsSync(output), false, 'aucun dossier créé');
  } finally {
    rmSync(root, { recursive: true });
    rmSync(parent, { recursive: true });
  }
});

test('la préparation refuse une vidéo approuvée dont les octets ont changé', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'football-pages-root-'));
  const output = path.join(root, 'site');
  try {
    cpSync(path.join(REPO_ROOT, 'demo'), path.join(root, 'demo'), { recursive: true });
    writeFileSync(path.join(root, 'demo/matches/france-allemagne-2018/video.mp4'), 'modified');
    assert.throws(() => preparePages({ root, output }), /Octets média différents/);
    assert.equal(existsSync(output), false);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('un clip privé non déclaré dans un export ou dans demo ne rejoint jamais le site préparé', () => {
  const root = preparePages();
  let output;
  try {
    writeFileSync(path.join(root, 'demo/private-broadcast.mp4'), 'private');
    writeFileSync(path.join(root, 'demo/matches/france-allemagne-2018/private-broadcast.mp4'), 'private');
    output = preparePages({ root });
    assert.equal(listFiles(output).some((file) => file.includes('private-broadcast')), false);
  } finally {
    if (output) rmSync(output, { recursive: true });
    rmSync(root, { recursive: true });
  }
});

test('le site préparé résout chaque import relatif et chaque cible des cartes d\'import en lui-même', () => {
  const output = preparePages();
  try {
    const missing = [];
    for (const page of ['index.html', 'visualizer.html']) {
      const html = readFileSync(path.join(output, page), 'utf8');
      const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1]).imports;
      for (const [specifier, target] of Object.entries(map)) {
        if (!existsSync(path.join(output, target))) missing.push(`${page} : ${specifier} → ${target}`);
      }
      for (const [, src] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
        if (!existsSync(path.join(output, src))) missing.push(`${page} : ${src}`);
      }
    }
    const modules = listFiles(path.join(output, 'src')).filter((file) => file.endsWith('.mjs'));
    assert.ok(modules.length >= 40, `${modules.length} modules`);
    for (const module of modules) {
      for (const specifier of importsOf(readFileSync(path.join(output, 'src', module), 'utf8'))) {
        if (specifier.startsWith('.') && !existsSync(path.join(output, 'src', path.dirname(module), specifier))) {
          missing.push(`${module} : ${specifier}`);
        }
      }
    }
    assert.deepEqual(missing, []);
  } finally {
    rmSync(output, { recursive: true });
  }
});
