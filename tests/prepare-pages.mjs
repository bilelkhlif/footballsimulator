/**
 * Prépare un dossier statique isolé pour revue, sans changer Pages ni publier de fichier.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './shell-version.mjs';

/**
 * Copie uniquement les composants publics, dans un nouveau dossier qui ne peut écraser un existant.
 * @param {{output?: string, root?: string}} [options] root : dépôt à préparer (le dépôt courant par défaut)
 * @returns {string} dossier à servir sous /footballsimulator/ pour la recette
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Livraison — séparation de la démo statique et du serveur privé
 */
export function preparePages({ output, root = REPO_ROOT } = {}) {
  const catalog = JSON.parse(readFileSync(path.join(root, 'demo/index.json'), 'utf8'));
  if (catalog.matches.some((entry) => entry.kind !== 'synthetic')) {
    throw new Error('Une démo réelle demande une revue explicite des droits avant préparation publique.');
  }
  const destination = output ? path.resolve(output) : mkdtempSync(path.join(os.tmpdir(), 'football-pages-preview-'));
  if (output) {
    if (existsSync(destination)) throw new Error('Le dossier de destination existe déjà ; aucun fichier écrasé.');
    mkdirSync(destination, { recursive: true });
  }
  for (const file of ['index.html', 'visualizer.html', 'manifest.json', 'sw.js', 'sw.mjs', 'THIRD_PARTY_NOTICES.md', 'ATTRIBUTION.md']) {
    cpSync(path.join(root, file), path.join(destination, file));
  }
  for (const directory of ['src', 'assets', 'demo']) {
    cpSync(path.join(root, directory), path.join(destination, directory), { recursive: true });
  }
  return destination;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Prévisualisation statique : ${preparePages({ output: process.argv[2] })}`);
  console.log('Aucune publication ni modification de la configuration GitHub Pages.');
}
