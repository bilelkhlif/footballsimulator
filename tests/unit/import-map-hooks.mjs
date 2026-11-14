/**
 * Résolution des imports « three » sous Node.js, d'après la carte d'import de index.html.
 *
 * Le navigateur trouve « three », « three/webgpu », « three/tsl » et « three/addons/… » grâce à
 * la carte d'import de la page. Node.js ne la lit pas : ce crochet de résolution la relit et
 * renvoie les mêmes fichiers de src/vendor/three-r187/. Les tests chargent ainsi exactement le
 * code que charge le navigateur, sans copie de three.js dans node_modules.
 */
import { readFileSync } from 'node:fs';

/** Racine du dépôt. */
const ROOT = new URL('../../', import.meta.url);

/**
 * Lit la carte d'import de index.html.
 * @returns {Record<string, string>} spécificateur ou préfixe → chemin relatif à la racine
 */
function readImportMap() {
  const html = readFileSync(new URL('index.html', ROOT), 'utf8');
  const match = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('Carte d\'import introuvable dans index.html.');
  }
  return JSON.parse(match[1]).imports;
}

const IMPORTS = readImportMap();

/**
 * Crochet de résolution de Node.js (module.register ou module.registerHooks).
 * @param {string} specifier
 * @param {object} context
 * @param {Function} nextResolve
 */
export function resolve(specifier, context, nextResolve) {
  if (Object.hasOwn(IMPORTS, specifier)) {
    return { url: new URL(IMPORTS[specifier], ROOT).href, shortCircuit: true };
  }
  for (const [prefix, target] of Object.entries(IMPORTS)) {
    if (prefix.endsWith('/') && specifier.startsWith(prefix)) {
      return { url: new URL(target + specifier.slice(prefix.length), ROOT).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
