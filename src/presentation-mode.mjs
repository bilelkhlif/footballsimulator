/**
 * Mode présentation « vestiaire » (phase 6) : pour montrer la tactique à l'équipe sur un écran ou un
 * vidéoprojecteur. L'interface est masquée (navigation, panneaux, barres), le terrain occupe tout
 * l'écran, si possible en plein écran, et les numéros au-dessus des joueurs sont agrandis pour être
 * lus du fond de la pièce. Seuls restent la légende de la lecture (notes de l'entraîneur) et un
 * petit bouton de sortie.
 *
 * Pendant la présentation, la tactique ne peut pas être modifiée par mégarde : l'interaction
 * tactique est coupée, la vue se tourne et se zoome toujours. Espace lance ou met en pause la
 * séquence ; Échap, le bouton de sortie, ou la sortie du plein écran par le navigateur, quittent la
 * présentation. C'est un mode d'affichage : rien n'entre dans l'historique, et tout revient comme
 * avant à la sortie.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { EventEmitter } from './events.mjs';
import { PLAYER_SIZE } from './config.mjs';

/** Agrandissement des numéros au-dessus des joueurs pendant la présentation. */
export const PRESENTATION_LABEL_SCALE = 2.2;

/**
 * Met à l'échelle les numéros (sprites) au-dessus des joueurs, et les relève d'autant pour qu'ils
 * restent au-dessus de la tête.
 * @param {Record<string, {children: Array<{children: object[]}>}>} teamGroups groupes des équipes (createTeam)
 * @param {number} factor 1 pour la taille normale
 * @returns {number} nombre de numéros mis à l'échelle
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Scène 3D — mode présentation
 */
export function scalePlayerLabels(teamGroups, factor) {
  let count = 0;
  for (const group of Object.values(teamGroups)) {
    for (const player of group.children) {
      for (const label of player.children.filter((child) => child.isSprite)) {
        const size = PLAYER_SIZE.labelSize * factor;
        label.scale.setScalar(size);
        label.position.y = PLAYER_SIZE.height + size * 0.62;
        count += 1;
      }
    }
  }
  return count;
}

/**
 * Mode présentation.
 *
 * Événement :
 * - change : { active } à l'entrée et à la sortie.
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Interface HTML — mode présentation
 */
export class PresentationMode extends EventEmitter {
  #root;
  #teamGroups;
  #interaction;
  #fullscreen;
  #active = false;
  #wasEnabled = true;
  /** Vrai quand la présentation a obtenu le plein écran : sa sortie par le navigateur la ferme. */
  #inFullscreen = false;

  /**
   * @param {object} options
   * @param {{dataset: object}} options.root élément qui porte l'état (document.body)
   * @param {Record<string, object>} options.teamGroups groupes des équipes, pour les numéros
   * @param {{setEnabled: (enabled: boolean) => void, state: string}} options.interaction interaction
   *   tactique, coupée pendant la présentation
   * @param {{request: () => Promise<void>|void, exit: () => Promise<void>|void, isActive: () => boolean}} [options.fullscreen]
   *   plein écran du navigateur ; facultatif (refusé, ou absent sur iPhone)
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Interface HTML — mode présentation
   */
  constructor({ root, teamGroups, interaction, fullscreen = null }) {
    super();
    this.#root = root;
    this.#teamGroups = teamGroups;
    this.#interaction = interaction;
    this.#fullscreen = fullscreen;
  }

  /**
   * Vrai pendant la présentation.
   * @returns {boolean}
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Interface HTML — mode présentation
   */
  get active() {
    return this.#active;
  }

  /**
   * Entre en présentation : interface masquée, numéros agrandis, interaction coupée, plein écran
   * demandé (un refus n'empêche pas la présentation).
   * @returns {boolean} faux si elle était déjà ouverte
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Interface HTML — mode présentation
   */
  enter() {
    if (this.#active) {
      return false;
    }
    this.#active = true;
    this.#inFullscreen = false;
    this.#wasEnabled = this.#interaction.state !== 'disabled';
    this.#interaction.setEnabled(false);
    scalePlayerLabels(this.#teamGroups, PRESENTATION_LABEL_SCALE);
    this.#root.dataset.presentation = 'on';
    try {
      Promise.resolve(this.#fullscreen?.request()).catch(() => {});
    } catch {
      // Plein écran refusé : la présentation reste dans la fenêtre.
    }
    this.emit('change', { active: true });
    return true;
  }

  /**
   * Quitte la présentation : tout revient comme avant.
   * @returns {boolean} faux si elle n'était pas ouverte (Échap passe alors à l'action suivante)
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Interface HTML — mode présentation
   */
  exit() {
    if (!this.#active) {
      return false;
    }
    this.#active = false;
    delete this.#root.dataset.presentation;
    scalePlayerLabels(this.#teamGroups, 1);
    this.#interaction.setEnabled(this.#wasEnabled);
    if (this.#fullscreen?.isActive()) {
      try {
        Promise.resolve(this.#fullscreen.exit()).catch(() => {});
      } catch {
        // Déjà sorti du plein écran.
      }
    }
    this.emit('change', { active: false });
    return true;
  }

  /**
   * Changement de plein écran (fullscreenchange). Quand le navigateur quitte le plein écran que la
   * présentation avait obtenu (Échap y est souvent gardé par lui), la présentation se ferme aussi,
   * pour ne pas laisser une interface masquée dans une fenêtre normale. Un plein écran refusé ne
   * ferme rien.
   * @responsable Ghassen588
   * @date 2026-11-28
   * @role Interface HTML — mode présentation
   */
  onFullscreenChange() {
    if (!this.#active || !this.#fullscreen) {
      return;
    }
    if (this.#fullscreen.isActive()) {
      this.#inFullscreen = true;
    } else if (this.#inFullscreen) {
      this.exit();
    }
  }
}
