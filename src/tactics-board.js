/**
 * Tableau tactique (sprint 4) : la formation en place de chaque équipe (BF4, cahier §2.2).
 *
 * C'est le sujet du patron Observer (cahier §3.4) : il ne connaît ni la scène 3D ni l'interface
 * HTML. Quand une formation change, il émet l'événement formationchange ; la scène y répond en
 * déplaçant les joueurs, l'interface en mettant à jour ses boutons et ses pastilles.
 *
 * setFormation renvoie la formation précédente : au sprint 5, l'annulation (patron Command) n'aura
 * qu'à la rétablir.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { EventEmitter } from './events.js';
import { getFormation } from './formations.js';

/**
 * Formations en place des deux équipes.
 *
 * Événement :
 * - formationchange : { teamId, formation, previous } quand la formation d'une équipe change.
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Logique métier — tableau tactique (sujet du patron Observer)
 */
export class TacticsBoard extends EventEmitter {
  /** @type {Map<string, import('./formations.js').FormationStrategy>} */
  #formations = new Map();

  /**
   * @param {Record<string, string>} initialFormations nom de la formation de départ de chaque
   *   équipe, par exemple { blue: '4-3-3', red: '4-4-2' }
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Logique métier — tableau tactique (sujet du patron Observer)
   */
  constructor(initialFormations) {
    super();
    for (const [teamId, name] of Object.entries(initialFormations)) {
      this.#formations.set(teamId, getFormation(name));
    }
  }

  /**
   * Identifiants des équipes, dans l'ordre de départ.
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Logique métier — tableau tactique (sujet du patron Observer)
   */
  get teamIds() {
    return [...this.#formations.keys()];
  }

  /**
   * Formation en place d'une équipe.
   * @param {string} teamId
   * @returns {import('./formations.js').FormationStrategy}
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Logique métier — tableau tactique (sujet du patron Observer)
   */
  getFormation(teamId) {
    const formation = this.#formations.get(teamId);
    if (!formation) {
      throw new Error(`Équipe inconnue : ${teamId}`);
    }
    return formation;
  }

  /**
   * Change la formation d'une équipe et prévient les observateurs. Sans effet si la formation
   * demandée est déjà en place.
   * @param {string} teamId
   * @param {string} name nom d'une formation de FORMATIONS, par exemple « 4-4-2 »
   * @returns {import('./formations.js').FormationStrategy} la formation précédente
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Logique métier — tableau tactique (sujet du patron Observer)
   */
  setFormation(teamId, name) {
    const previous = this.getFormation(teamId);
    const formation = getFormation(name);
    if (formation !== previous) {
      this.#formations.set(teamId, formation);
      this.emit('formationchange', { teamId, formation, previous });
    }
    return previous;
  }
}
