/**
 * Version de contenu de la coquille de l'application (sprint 6), écrite dans sw.mjs.
 *
 * SHELL_VERSION est une empreinte SHA-256 du contenu des fichiers de APP_SHELL. Quand l'un d'eux
 * change, l'empreinte change, donc sw.mjs aussi : le navigateur installe la nouvelle version
 * complète de l'application. Un test unitaire (tests/unit/service-worker.test.mjs) échoue si
 * l'empreinte écrite ne correspond plus au contenu.
 *
 * Usage : npm run shell-version (recalcule et écrit) ; npm run shell-version -- --check (vérifie).
 *
 * Fins de ligne : .gitattributes impose LF dans le dépôt, mais un fichier créé ou collé sous
 * Windows peut rester en CRLF dans la copie de travail (git ne le convertit qu'au commit). Les
 * fichiers texte sont donc lus avec leurs fins de ligne ramenées à LF : l'empreinte calculée sur un
 * poste Windows est celle du contenu enregistré dans le dépôt, donc celle de l'intégration
 * continue et des fichiers publiés. Les fichiers binaires (images) sont lus tels quels.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Racine du dépôt : le dossier parent de tests/. */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Extensions des fichiers texte de la coquille, dont les fins de ligne sont ramenées à LF. */
export const TEXT_EXTENSIONS = Object.freeze(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.webmanifest', '.txt']);

/**
 * Contenu d'un fichier de la coquille tel que le dépôt l'enregistre : fins de ligne CRLF ramenées
 * à LF pour un fichier texte (.gitattributes : « text=auto eol=lf »), octets inchangés sinon.
 * @param {string} file chemin du fichier
 * @returns {Buffer}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role PWA — version de contenu de la coquille
 */
export function readShellFile(file) {
  const bytes = readFileSync(file);
  if (!TEXT_EXTENSIONS.includes(path.extname(file).toLowerCase())) {
    return bytes;
  }
  return Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
}

/**
 * Lit la liste APP_SHELL de sw.mjs.
 * @param {string} [root] racine du dépôt
 * @returns {string[]} chemins relatifs, par exemple « ./src/main.mjs »
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role PWA — version de contenu de la coquille
 */
export function readAppShell(root = REPO_ROOT) {
  const source = readFileSync(path.join(root, 'sw.mjs'), 'utf8');
  const list = source.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  if (!list) {
    throw new Error('APP_SHELL introuvable dans sw.mjs');
  }
  return [...list[1].matchAll(/'([^']+)'/g)].map(([, file]) => file);
}

/**
 * Lit SHELL_VERSION dans sw.mjs.
 * @param {string} [root]
 * @returns {string|null}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role PWA — version de contenu de la coquille
 */
export function readShellVersion(root = REPO_ROOT) {
  return readFileSync(path.join(root, 'sw.mjs'), 'utf8').match(/const SHELL_VERSION = '([^']*)';/)?.[1] ?? null;
}

/**
 * Calcule l'empreinte du contenu de la coquille : chemin et octets de chaque fichier, dans l'ordre
 * alphabétique ; les 16 premiers chiffres hexadécimaux du SHA-256. Les fichiers texte sont lus
 * avec des fins de ligne LF (readShellFile) : la même empreinte sous Windows, Linux et macOS.
 * @param {string} [root]
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role PWA — version de contenu de la coquille
 */
export function computeShellVersion(root = REPO_ROOT) {
  const hash = createHash('sha256');
  for (const file of readAppShell(root).filter((entry) => entry !== './').sort()) {
    hash.update(`${file}\0`);
    hash.update(readShellFile(path.join(root, file)));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * Écrit l'empreinte dans sw.mjs.
 * @param {string} version
 * @param {string} [root]
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role PWA — version de contenu de la coquille
 */
export function writeShellVersion(version, root = REPO_ROOT) {
  const file = path.join(root, 'sw.mjs');
  const source = readFileSync(file, 'utf8');
  const updated = source.replace(/const SHELL_VERSION = '[^']*';/, `const SHELL_VERSION = '${version}';`);
  if (updated === source && readShellVersion(root) !== version) {
    throw new Error('SHELL_VERSION introuvable dans sw.mjs');
  }
  writeFileSync(file, updated);
}

// Lancement direct : recalcule et écrit l'empreinte, ou la vérifie avec --check.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = computeShellVersion();
  if (process.argv.includes('--check')) {
    const written = readShellVersion();
    console.log(written === version ? `SHELL_VERSION à jour : ${version}` : `SHELL_VERSION périmée : ${written}, attendue ${version}`);
    process.exitCode = written === version ? 0 : 1;
  } else {
    writeShellVersion(version);
    console.log(`SHELL_VERSION = ${version}`);
  }
}