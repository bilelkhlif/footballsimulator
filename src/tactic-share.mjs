/**
 * Lien de partage d'une tactique (phase 6) : toute la tactique tient dans l'adresse, sans serveur.
 *
 * Le contenu est exactement celui d'un fichier exporté (src/tactic-file.mjs : format, version, nom
 * et tactique avec sa séquence), écrit en JSON compact, compressé par CompressionStream (« deflate »,
 * proposé par Chrome, Edge, Safari et Node.js), puis écrit en base64url (A-Z, a-z, 0-9, « - » et
 * « _ », sans « = ») :
 *
 *   https://…/footballsimulator/#tactique=1.eJztWE1v2zAM…
 *
 * « 1. » est la version du lien. Le tout est dans le fragment de l'adresse (après « # ») : un
 * navigateur ne l'envoie jamais au serveur, ni à GitHub Pages ; la tactique ne quitte donc
 * l'appareil que par le message où l'entraîneur colle le lien.
 *
 * Un lien reçu n'est jamais cru sur parole : longueur bornée, base64url valide, décompression
 * arrêtée au-delà de la taille maximale d'un fichier de tactique (une petite adresse ne peut pas
 * devenir des mégaoctets), texte UTF-8 valide, puis les mêmes vérifications qu'un fichier importé
 * (parseTacticFile, donc isValidTactic contre le tableau en cours). Ce module ne touche ni au
 * document ni au stockage.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { createTacticFile, MAX_TACTIC_FILE_BYTES, parseTacticFile } from './tactic-file.mjs';

/** Clé du fragment de l'adresse qui porte la tactique : « #tactique=… ». */
export const SHARE_HASH_KEY = 'tactique';

/** Version du lien de partage, écrite avant le contenu : à incrémenter si son codage change. */
export const SHARE_LINK_VERSION = 1;

/** Algorithme de CompressionStream : « deflate » (zlib), disponible partout où l'application tourne. */
export const SHARE_COMPRESSION = 'deflate';

/**
 * Longueur maximale du contenu d'un lien, en caractères. Une tactique pleine (12 images clés)
 * en compte quelques milliers ; Chrome accepte des adresses de 2 millions de caractères, mais une
 * messagerie coupe souvent au-delà de quelques dizaines de milliers.
 */
export const MAX_SHARE_PAYLOAD_LENGTH = 64 * 1024;

/**
 * Octets écrits en base64url, sans remplissage.
 * @param {Uint8Array} bytes
 * @returns {string}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Persistance — lien de partage d'une tactique
 */
export function toBase64Url(bytes) {
  let binary = '';
  // Par tranches : String.fromCharCode refuse un trop grand nombre d'arguments.
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Octets d'un texte base64url, ou null s'il contient un caractère étranger ou une longueur
 * impossible.
 * @param {string} text
 * @returns {Uint8Array|null}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Persistance — lien de partage d'une tactique
 */
export function fromBase64Url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) {
    return null;
  }
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  try {
    return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * Compresse des octets par CompressionStream.
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Persistance — lien de partage d'une tactique
 */
async function compress(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream(SHARE_COMPRESSION));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Décompresse des octets, en s'arrêtant dès que le résultat dépasse `limit` octets.
 * @param {Uint8Array} bytes
 * @param {number} limit
 * @returns {Promise<Uint8Array|null>} null si les octets sont illisibles ou trop gros une fois décompressés
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Persistance — lien de partage d'une tactique
 */
async function decompress(bytes, limit) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(SHARE_COMPRESSION)).getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.length;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Contenu d'un lien de partage : « 1. » suivi de la tactique compressée en base64url.
 * @param {{name: string, tactic: object}} options tactic : captureTactic, ou une tactique enregistrée
 * @returns {Promise<string>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Persistance — lien de partage d'une tactique
 */
export async function encodeSharedTactic({ name, tactic }) {
  const text = JSON.stringify(createTacticFile({ name, tactic }));
  return `${SHARE_LINK_VERSION}.${toBase64Url(await compress(new TextEncoder().encode(text)))}`;
}

/**
 * Adresse complète du lien : celle de l'application (sous-chemin compris, sans paramètres ni
 * fragment), avec la tactique dans le fragment.
 * @param {string|URL} appUrl adresse de la page en cours
 * @param {string} payload contenu produit par encodeSharedTactic
 * @returns {string}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Persistance — lien de partage d'une tactique
 */
export function createShareUrl(appUrl, payload) {
  const url = new URL(appUrl);
  url.search = '';
  url.hash = `${SHARE_HASH_KEY}=${payload}`;
  return url.href;
}

/**
 * Contenu d'un lien de partage lu dans le fragment d'une adresse, ou null si le fragment n'en porte pas.
 * @param {string} hash fragment, avec ou sans « # » (location.hash)
 * @returns {string|null}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Persistance — lien de partage d'une tactique
 */
export function readSharePayload(hash) {
  const fragment = typeof hash === 'string' ? hash.replace(/^#/, '') : '';
  const prefix = `${SHARE_HASH_KEY}=`;
  return fragment.startsWith(prefix) ? fragment.slice(prefix.length) : null;
}

/**
 * Lit et vérifie le contenu d'un lien de partage, contre le tableau en cours. Aucune exception :
 * un lien refusé rend un message pour l'utilisateur.
 * @param {string} payload contenu du fragment (readSharePayload)
 * @param {{formations: object, players: object}} reference instantané du tableau en cours
 * @returns {Promise<{ok: true, name: string, tactic: object}|{ok: false, error: string}>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Persistance — lien de partage d'une tactique
 */
export async function decodeSharedTactic(payload, reference) {
  if (typeof payload !== 'string' || payload.length > MAX_SHARE_PAYLOAD_LENGTH) {
    return { ok: false, error: 'Lien de partage trop long pour une tactique : rien n’a été modifié.' };
  }
  const [version, data] = payload.split('.', 2);
  if (version !== String(SHARE_LINK_VERSION) || data === undefined) {
    return Number(version) > SHARE_LINK_VERSION
      ? { ok: false, error: 'Lien créé par une version plus récente de l’application : mettez-la à jour.' }
      : { ok: false, error: 'Lien de partage illisible : rien n’a été modifié.' };
  }
  const bytes = fromBase64Url(data);
  const inflated = bytes && bytes.length ? await decompress(bytes, MAX_TACTIC_FILE_BYTES) : null;
  if (!inflated) {
    return { ok: false, error: 'Lien de partage incomplet ou abîmé : rien n’a été modifié.' };
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(inflated);
  } catch {
    return { ok: false, error: 'Lien de partage illisible : rien n’a été modifié.' };
  }
  const parsed = parseTacticFile(text, reference);
  return parsed.ok ? parsed : { ok: false, error: `Lien de partage refusé. ${parsed.error}` };
}
