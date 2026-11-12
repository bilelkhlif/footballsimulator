/**
 * Émetteur d'événements minimal : le patron Observer du cahier (§3.4).
 *
 * Un sujet garde, pour chaque type d'événement, la liste de ses observateurs et les
 * prévient quand l'événement se produit. Le sujet ne connaît pas ses observateurs :
 * la session AR, par exemple, ignore tout de l'interface qui réagit à ses événements.
 */
export class EventEmitter {
  /** Observateurs abonnés, par type d'événement. */
  #listeners = new Map();

  /**
   * Abonne un observateur à un type d'événement.
   * @param {string} type nom de l'événement, par exemple « sessionstart »
   * @param {(detail: any) => void} listener fonction appelée avec le détail de l'événement
   * @returns {() => void} fonction qui désabonne l'observateur
   */
  on(type, listener) {
    if (!this.#listeners.has(type)) {
      this.#listeners.set(type, new Set());
    }
    this.#listeners.get(type).add(listener);
    return () => this.off(type, listener);
  }

  /**
   * Désabonne un observateur.
   * @param {string} type
   * @param {(detail: any) => void} listener
   */
  off(type, listener) {
    this.#listeners.get(type)?.delete(listener);
  }

  /**
   * Prévient les observateurs d'un événement. Un observateur en erreur n'empêche pas
   * les suivants d'être prévenus : l'erreur est signalée dans la console.
   * @param {string} type
   * @param {any} [detail] informations transmises aux observateurs
   */
  emit(type, detail) {
    for (const listener of [...(this.#listeners.get(type) ?? [])]) {
      try {
        listener(detail);
      } catch (error) {
        console.error(`Observateur de « ${type} » en erreur :`, error);
      }
    }
  }
}
