/**
 * Navigation des espaces : état d'interface indépendant du tableau tactique.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { EventEmitter } from './events.mjs';

/** Registre commun au contrôleur et à l'interface, sans création de scène. */
export const WORKSPACES = Object.freeze({
  home: 'Accueil · Terrain',
  formations: 'Équipes et formations',
  tactics: 'Outils tactiques',
  animation: 'Animation et séquences',
  ar: 'Réalité augmentée',
  more: 'Plus d’outils',
  settings: 'Réglages et aide',
});

/**
 * Un espace actif et au plus un panneau ouvert ; aucune dépendance au moteur tactique.
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Interface HTML — contrôleur central des espaces (Observer)
 */
export class WorkspaceController extends EventEmitter {
  #active = 'home';
  #open = false;
  #unavailable = new Set();

  /**
   * Copie de l'état de navigation.
   * @returns {{active: string, open: boolean}}
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Interface HTML — état des espaces
   */
  get state() {
    return { active: this.#active, open: this.#open };
  }

  /**
   * Ouvre un espace existant, sans toucher aux commandes ni à une sélection en cours.
   * @param {string} id identifiant du registre
   * @param {{toggle?: boolean}} [options] replie un panneau déjà ouvert
   * @returns {boolean} vrai si la navigation a changé
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Interface HTML — changement d'espace
   */
  open(id, { toggle = false } = {}) {
    if (!Object.hasOwn(WORKSPACES, id)) {
      throw new RangeError(`Espace inconnu : ${id}`);
    }
    if (this.#unavailable.has(id)) return false;
    if (toggle && this.#active === id && this.#open) return this.close();
    if (this.#active === id && this.#open) return false;
    this.#active = id;
    this.#open = true;
    this.emit('change', this.state);
    return true;
  }

  /**
   * Retourne au terrain et replie le panneau ; les données restent dans leurs modules.
   * @returns {boolean} vrai si un panneau était ouvert
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Interface HTML — retour au terrain
   */
  close() {
    if (!this.#open) return false;
    this.#active = 'home';
    this.#open = false;
    this.emit('change', this.state);
    return true;
  }

  /**
   * Suspend les espaces qui demandent un terrain posé pendant la recherche d'une surface AR.
   * @param {string[]} ids espaces indisponibles
   * @responsable Bilel Khlif
   * @date 2026-11-24
   * @role Interface HTML — disponibilité des espaces en AR
   */
  setUnavailable(ids) {
    this.#unavailable = new Set(ids);
    if (this.#unavailable.has(this.#active)) this.close();
    this.emit('availability', { unavailable: [...this.#unavailable] });
  }
}
