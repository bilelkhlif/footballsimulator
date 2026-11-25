/**
 * Prépare un dossier statique isolé pour revue, sans changer Pages ni publier de fichier.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './shell-version.mjs';
import { createHash } from 'node:crypto';

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
  const registerPath = path.join(root, 'demo/media-licenses.json');
  const reviewed = existsSync(registerPath) ? JSON.parse(readFileSync(registerPath, 'utf8')).matches : {};
  for (const entry of catalog.matches) {
    if (!/^matches\/[a-z0-9-]+\/$/.test(entry.path)) throw new Error('Dossier de démonstration invalide.');
  }
  for (const entry of catalog.matches.filter((match) => match.kind !== 'synthetic')) {
    const approval = reviewed?.[entry.id];
    if (!approval || !['CC-BY-SA-4.0', 'CC-BY-3.0', 'CC-BY-4.0', 'CC0-1.0'].includes(approval.spdx)
      || !entry.path.startsWith('matches/') || !/^[a-z0-9/-]+$/.test(entry.path)) {
      throw new Error('Une démo réelle demande une revue explicite des droits avant préparation publique.');
    }
    const manifest = JSON.parse(readFileSync(path.join(root, 'demo', entry.path, 'manifest.json'), 'utf8'));
    if (['author', 'license', 'licenseUrl', 'sourceUrl', 'changes'].some((key) => !approval[key] || manifest.provenance?.media?.[key] !== approval[key])) {
      throw new Error(`Crédits différents du registre relu : ${entry.id}`);
    }
    for (const [file, expected] of Object.entries(approval.files ?? {})) {
      if (!/^[a-z0-9.-]+$/.test(file) || createHash('sha256').update(readFileSync(path.join(root, 'demo', entry.path, file))).digest('hex') !== expected) {
        throw new Error(`Octets média différents du registre relu : ${entry.id}`);
      }
    }
    if (approval.files?.[manifest.video.file] !== manifest.video.sha256 || !existsSync(path.join(root, 'demo', entry.path, 'SOURCE.md'))) {
      throw new Error(`Notice ou vidéo approuvée absente : ${entry.id}`);
    }
  }
  const destination = output ? path.resolve(output) : mkdtempSync(path.join(os.tmpdir(), 'football-pages-preview-'));
  if (output) {
    if (existsSync(destination)) throw new Error('Le dossier de destination existe déjà ; aucun fichier écrasé.');
    mkdirSync(destination, { recursive: true });
  }
  for (const file of ['index.html', 'visualizer.html', 'manifest.json', 'sw.js', 'sw.mjs', 'THIRD_PARTY_NOTICES.md', 'ATTRIBUTION.md',
    'LICENSING.md', 'REUSE.toml']) {
    cpSync(path.join(root, file), path.join(destination, file));
  }
  // Une œuvre sous AGPL est livrée avec le texte de sa licence (LICENSES/) et la correspondance des fichiers.
  for (const directory of ['src', 'assets', 'LICENSES']) {
    cpSync(path.join(root, directory), path.join(destination, directory), { recursive: true });
  }
  mkdirSync(path.join(destination, 'demo'));
  cpSync(path.join(root, 'demo/index.json'), path.join(destination, 'demo/index.json'));
  if (existsSync(registerPath)) cpSync(registerPath, path.join(destination, 'demo/media-licenses.json'));
  for (const entry of catalog.matches) {
    const bundle = path.join(root, 'demo', entry.path);
    const manifest = JSON.parse(readFileSync(path.join(bundle, 'manifest.json'), 'utf8'));
    const files = ['manifest.json', manifest.video.file, manifest.storage.tracks.file,
      ...manifest.storage.chunks.map((chunk) => chunk.file), ...Object.keys(manifest.files ?? {})];
    if (existsSync(path.join(bundle, 'SOURCE.md'))) files.push('SOURCE.md');
    for (const file of files) {
      if (!/^(?:[a-z0-9-]+\/)*[a-zA-Z0-9.-]+$/.test(file) || file.split('/').includes('..')
        || !/\.(?:json|mp4|webm|jpg|png|md)$/i.test(file)) throw new Error('Fichier non public dans la démonstration.');
      const target = path.join(destination, 'demo', entry.path, file);
      mkdirSync(path.dirname(target), { recursive: true });
      cpSync(path.join(bundle, file), target);
    }
  }
  return destination;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Prévisualisation statique : ${preparePages({ output: process.argv[2] })}`);
  console.log('Aucune publication ni modification de la configuration GitHub Pages.');
}
