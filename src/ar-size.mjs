/**
 * Taille du terrain en réalité augmentée (phase 6) : terrain de table (60 cm, la maquette de la vue
 * 3D), grande table (1 m) ou terrain au sol (2 m), pour travailler debout autour, avec l'équipe.
 *
 * La taille est la longueur du terrain, lignes de but comprises ; l'échelle appliquée au groupe du
 * terrain en découle (2 m : × 3,33). Elle se choisit avant d'entrer en AR, ou pendant la session,
 * avant ou après la pose, depuis l'espace Réalité augmentée ; le choix est gardé sur l'appareil.
 * La tactique, dans le repère du terrain, ne change pas : seule la vue AR est agrandie.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { PITCH_LENGTH } from './config.mjs';

/** Tailles proposées : identifiant, longueur du terrain en mètres, libellé. */
export const AR_PITCH_SIZES = Object.freeze([
  Object.freeze({ id: 'table', length: 0.6, label: 'Table · 60 cm' }),
  Object.freeze({ id: 'large', length: 1, label: 'Grande table · 1 m' }),
  Object.freeze({ id: 'floor', length: 2, label: 'Sol · 2 m' }),
]);

/** Clé du choix gardé dans le stockage local. */
export const AR_SIZE_STORAGE_KEY = 'football-simulator:taille-ar';

/**
 * Échelle du terrain pour une taille : sa longueur rapportée à celle de la maquette (60 cm).
 * @param {string} id identifiant d'une taille de AR_PITCH_SIZES
 * @returns {number}
 * @throws {RangeError} si la taille est inconnue
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Réalité augmentée — taille du terrain posé
 */
export function scaleForSize(id) {
  const size = AR_PITCH_SIZES.find((candidate) => candidate.id === id);
  if (!size) {
    throw new RangeError(`Taille de terrain inconnue : ${id}`);
  }
  return size.length / PITCH_LENGTH;
}

/**
 * Relie les boutons [data-ar-size] à la vue AR : le bouton choisi est marqué (aria-pressed),
 * l'échelle est appliquée, et le choix est gardé (un stockage refusé n'empêche rien).
 * @param {object} options
 * @param {Iterable<HTMLButtonElement>} options.buttons boutons portant data-ar-size
 * @param {{setScale: (scale: number) => void}} options.arView vue AR (src/ar-view.mjs)
 * @param {Storage|null} [options.storage] stockage local, ou null
 * @param {(size: {id: string, length: number, label: string}) => void} [options.onChange]
 * @returns {{select: (id: string) => void, readonly current: string}}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Réalité augmentée — taille du terrain posé
 */
export function createArSizeControl({ buttons, arView, storage = null, onChange = () => {} }) {
  const list = [...buttons];
  let current = 'table';

  /** Applique une taille ; announce : prévenir l'interface (pas au lancement). */
  const apply = (id, announce) => {
    arView.setScale(scaleForSize(id));
    current = id;
    for (const button of list) {
      button.setAttribute('aria-pressed', String(button.dataset.arSize === id));
    }
    if (announce) {
      try {
        storage?.setItem(AR_SIZE_STORAGE_KEY, id);
      } catch {
        // Stockage refusé : le choix vaut pour cette visite.
      }
      onChange(AR_PITCH_SIZES.find((size) => size.id === id));
    }
  };

  let saved = null;
  try {
    saved = storage?.getItem(AR_SIZE_STORAGE_KEY) ?? null;
  } catch {
    saved = null;
  }
  apply(AR_PITCH_SIZES.some((size) => size.id === saved) ? saved : 'table', false);
  for (const button of list) {
    button.addEventListener('click', () => apply(button.dataset.arSize, true));
  }
  return {
    select: (id) => apply(id, true),
    get current() {
      return current;
    },
  };
}
