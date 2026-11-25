/**
 * Tests unitaires de la documentation du code (cahier §7.1, un en-tête par fonction) : chaque
 * fonction et chaque classe de premier niveau, chaque membre de classe et chaque gestionnaire
 * d'événement de premier niveau porte un en-tête JSDoc avec @responsable, @date et @role, et
 * chaque fichier renvoie à ATTRIBUTION.md. Convention : docs/convention-de-documentation.md.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

/** Racine du dépôt. */
const ROOT = new URL('../../', import.meta.url);

/**
 * Dossiers contrôlés et fichiers retenus ; src/vendor (bibliothèques tierces) n'en fait pas partie.
 * À la racine : sw.mjs, le Service Worker, et sw.js, son script de migration (docs/migration-mjs.md).
 * src/visualizer : visualiseur de match, aux mêmes règles que l'application.
 */
const SCOPE = [['', /^sw\.m?js$/], ['src/', /\.mjs$/], ['src/visualizer/', /\.mjs$/], ['tests/', /\.mjs$/], ['tests/unit/', /\.mjs$/]];

/** Fichiers sans fonction, dont l'en-tête renvoie aussi à ATTRIBUTION.md. */
const OTHER_SOURCES = ['index.html', 'src/styles.css', 'visualizer.html', 'src/visualizer/visualizer.css'];

/** Déclaration de premier niveau : fonction, classe, fonction fléchée nommée ou gestionnaire. */
const TOP_LEVEL = new RegExp('^(?:export\\s+)?(?:default\\s+)?(?:'
  + '(?:async\\s+)?function\\*?\\s*([\\w$]+)'
  + '|class\\s+([\\w$]+)'
  + '|const\\s+([\\w$]+)\\s*=\\s*(?:async\\s+)?(?:function\\b|\\([^)]*\\)\\s*=>|[\\w$]+\\s*=>)'
  + "|(?:self|window|document)\\.addEventListener\\('([\\w-]+)')");

/** Membre d'une classe de premier niveau, indenté de deux espaces : méthode, accesseur, champ fléché. */
const CLASS_MEMBER = /^ {2}(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?(#?[\w$]+)\s*(?:\(|=\s*(?:async\s+)?(?:\([^)]*\)|[\w$]+)\s*=>)/;

/**
 * Fichiers JavaScript du projet, relatifs à la racine du dépôt.
 * @returns {string[]}
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests unitaires (documentation) — outil de vérification
 */
function listProjectFiles() {
  return SCOPE.flatMap(([directory, pattern]) => readdirSync(new URL(directory || '.', ROOT))
    .filter((name) => pattern.test(name))
    .map((name) => `${directory}${name}`));
}

/**
 * Bloc JSDoc placé juste au-dessus d'une ligne, ou null.
 * @param {string[]} lines
 * @param {number} index indice de la ligne déclarée
 * @returns {string|null}
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests unitaires (documentation) — outil de vérification
 */
function blockAbove(lines, index) {
  let start = index - 1;
  if (start < 0 || !lines[start].trim().endsWith('*/')) {
    return null;
  }
  while (start >= 0 && !lines[start].includes('/**')) {
    start -= 1;
  }
  return start < 0 ? null : lines.slice(start, index).join('\n');
}

/**
 * Indique ce qui manque à un en-tête : responsable, date de création valide (AAAA-MM-JJ), rôle.
 * @param {string|null} block
 * @returns {string[]} balises absentes ou invalides, vide si l'en-tête est complet
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests unitaires (documentation) — outil de vérification
 */
function missingTags(block) {
  if (!block) {
    return ['en-tête JSDoc'];
  }
  const missing = [];
  if (!/@responsable\s+\S/.test(block)) {
    missing.push('@responsable');
  }
  const date = block.match(/@date\s+(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (!date || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    missing.push('@date');
  }
  if (!/@role\s+\S/.test(block)) {
    missing.push('@role');
  }
  return missing;
}

/**
 * Unités documentées d'un fichier source : fonctions et classes de premier niveau, membres des
 * classes de premier niveau et gestionnaires d'événements de premier niveau.
 * @param {string} source
 * @returns {{line: number, name: string, missing: string[]}[]}
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests unitaires (documentation) — outil de vérification
 */
function findUnits(source) {
  const lines = source.split('\n');
  const units = [];
  let currentClass = null;
  lines.forEach((line, index) => {
    if (currentClass && line === '}') {
      currentClass = null;
      return;
    }
    const topLevel = line.match(TOP_LEVEL);
    const member = currentClass ? line.match(CLASS_MEMBER) : null;
    let name = null;
    if (topLevel) {
      const [, functionName, className, constName, eventName] = topLevel;
      name = functionName ?? className ?? constName ?? `addEventListener('${eventName}')`;
      // Une classe ouverte sur cette ligne (pas « class X {} ») : ses membres suivent.
      currentClass = className && !line.trimEnd().endsWith('}') ? className : null;
    } else if (member) {
      name = `${currentClass}.${member[1]}`;
    }
    if (name) {
      units.push({ line: index + 1, name, missing: missingTags(blockAbove(lines, index)) });
    }
  });
  return units;
}

test('le contrôle repère les fonctions, classes, membres et gestionnaires sans en-tête complet', () => {
  const source = [
    '/** En-tête du fichier. Voir ATTRIBUTION.md. */',
    "import { x } from './x.js';",
    '/**',
    ' * Fonction documentée.',
    ' * @responsable Bilel Khlif',
    ' * @date 2026-11-14',
    ' * @role Test',
    ' */',
    'export function documented() {}',
    '/** Sans balises. */',
    'function bare() {}',
    'export class Box {',
    '  /** Champ : pas une fonction. */',
    '  #size = 1;',
    '  /** Sans balises. */',
    '  open() {}',
    '}',
    "self.addEventListener('fetch', () => {});",
    '/**',
    ' * Date impossible.',
    ' * @responsable Bilel Khlif',
    ' * @date 2026-13-40',
    ' * @role Test',
    ' */',
    'const arrow = () => 1;',
  ].join('\n');

  const units = findUnits(source);

  assert.deepEqual(units.map(({ name }) => name),
    ['documented', 'bare', 'Box', 'Box.open', "addEventListener('fetch')", 'arrow']);
  assert.deepEqual(units.filter((unit) => unit.missing.length === 0).map(({ name }) => name), ['documented']);
  assert.deepEqual(units.find(({ name }) => name === 'bare').missing, ['@responsable', '@date', '@role']);
  assert.deepEqual(units.find(({ name }) => name === 'arrow').missing, ['@date']);
});

test('chaque fichier du projet renvoie à ATTRIBUTION.md dans son en-tête', () => {
  const withoutReference = [...listProjectFiles(), ...OTHER_SOURCES].filter((path) => {
    const source = readFileSync(new URL(path, ROOT), 'utf8');
    const headerEnd = path.endsWith('.html') ? source.indexOf('-->') : source.indexOf('*/');
    return headerEnd === -1 || !source.slice(0, headerEnd).includes('ATTRIBUTION.md');
  });
  assert.deepEqual(withoutReference, []);
});

test('chaque fonction, classe, membre de classe et gestionnaire porte @responsable, @date et @role', () => {
  const units = listProjectFiles().flatMap((path) => findUnits(readFileSync(new URL(path, ROOT), 'utf8'))
    .map((unit) => ({ ...unit, where: `${path}:${unit.line} ${unit.name}` })));

  // Le contrôle voit bien les unités du projet (premier niveau, membre de classe, gestionnaire).
  const names = units.map(({ where }) => where.replace(/:\d+ /, ' '));
  for (const expected of ['src/render-loop.mjs createRenderLoop', 'src/tactics-board.mjs TacticsBoard.setFormation',
    "sw.mjs addEventListener('fetch')", 'tests/unit/documentation.test.mjs findUnits']) {
    assert.ok(names.includes(expected), `unité non trouvée : ${expected}`);
  }
  assert.deepEqual(units.filter((unit) => unit.missing.length > 0)
    .map(({ where, missing }) => `${where} : ${missing.join(', ')}`), []);
});
