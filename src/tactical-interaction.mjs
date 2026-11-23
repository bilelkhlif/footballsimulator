/**
 * Interaction tactique (sprint 5, BF5 à BF7) : la machine à états qui transforme un rayon en action.
 *
 * Elle ne sait pas d'où vient le rayon : la souris ou le doigt hors AR (src/pointer-input.mjs), ou
 * une source d'entrée WebXR en AR (src/xr-input.mjs). Elle ne dessine rien : la scène lit son état
 * (src/tactical-view.mjs). Elle ne modifie pas le tableau elle-même : elle crée des commandes, que
 * l'historique exécute (src/commands.mjs, patron Command).
 *
 * Modes et états :
 * - « move » : idle (rien de sélectionné) → toucher un joueur ou le ballon → selected → toucher une
 *   place du terrain → le joueur ou le ballon y va, puis idle. Toucher l'objet sélectionné annule
 *   la sélection ; toucher un autre objet le sélectionne à la place.
 * - « pass » et « run » : arrow-start → toucher le départ → arrow-end → toucher l'arrivée → la flèche
 *   est tracée, puis arrow-start pour la suivante. Un point touché sur un joueur ou le ballon
 *   s'accroche à sa place.
 * - « disabled » : interaction coupée, en AR tant que le terrain n'est pas posé.
 *
 * Une place hors du plateau est refusée ; une place au bord est ramenée sur le plateau, socle
 * compris. Chaque geste produit un retour (événement feedback) pour l'interface.
 *
 * Événements :
 * - statechange : { mode, state, selection, arrowStart } ;
 * - feedback : { kind, message }, kind valant « info », « success » ou « invalid ».
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';
import { EventEmitter } from './events.mjs';
import { intersectPitchPlane, pickTarget } from './raycasting.mjs';
import {
  ARROW_KINDS, BALL_MARGIN, clampToBoard, isOnBoard, MIN_ARROW_LENGTH, PLAYER_MARGIN,
} from './tactics-board.mjs';
import { AddArrowCommand, MoveBallCommand, MovePlayerCommand } from './commands.mjs';
import { TEAMS } from './config.mjs';

/** Modes de l'interaction : déplacer, tracer une passe, tracer une course. */
export const INTERACTION_MODES = Object.freeze({ MOVE: 'move', PASS: ARROW_KINDS.PASS, RUN: ARROW_KINDS.RUN });

/** États de la machine à états. */
export const INTERACTION_STATES = Object.freeze({
  DISABLED: 'disabled',
  IDLE: 'idle',
  SELECTED: 'selected',
  ARROW_START: 'arrow-start',
  ARROW_END: 'arrow-end',
});

/** Messages de retour, affichés dans le bandeau d'aide. */
const MESSAGES = Object.freeze({
  outside: 'Hors du terrain : touchez une place sur le plateau.',
  missed: 'Visez le terrain.',
  nothingSelected: 'Touchez d’abord un joueur ou le ballon.',
  deselected: 'Sélection annulée.',
  tooShort: 'Flèche trop courte : touchez un point plus loin.',
  unchanged: 'Déjà à cette place.',
});

/**
 * Description d'un objet de la scène pour la sélection : un joueur (équipe et numéro) ou le ballon.
 * @param {THREE.Object3D} object
 * @returns {{type: 'player', teamId: string, number: number}|{type: 'ball'}|null}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Interaction tactique — identité des objets sélectionnables
 */
export function describeTarget(object) {
  const { type, teamId, number } = object?.userData ?? {};
  if (type === 'player') {
    return { type, teamId, number };
  }
  return type === 'ball' ? { type } : null;
}

/**
 * Indique si deux sélections désignent le même objet.
 * @param {object|null} a
 * @param {object|null} b
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Interaction tactique — identité des objets sélectionnables
 */
export function sameTarget(a, b) {
  if (!a || !b || a.type !== b.type) {
    return false;
  }
  return a.type === 'ball' || (a.teamId === b.teamId && a.number === b.number);
}

/**
 * Nom court d'un objet sélectionné : « le n° 9 des Bleus » ou « le ballon ».
 * @param {{type: string, teamId?: string, number?: number}} target
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Interaction tactique — retours à l'utilisateur
 */
export function selectionLabel(target) {
  return target.type === 'ball' ? 'le ballon' : `le n° ${target.number} des ${TEAMS[target.teamId]?.label ?? target.teamId}`;
}

/**
 * Machine à états de l'interaction tactique.
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Interaction tactique — machine à états (sélection, déplacement, flèches)
 */
export class TacticalInteraction extends EventEmitter {
  #board;
  #history;
  #pitchGroup;
  #getHitboxes;
  #mode = INTERACTION_MODES.MOVE;
  #enabled = true;
  #selection = null;
  #arrowStart = null;
  #hoverPoint = new THREE.Vector3();
  #hasHover = false;
  #planePoint = new THREE.Vector3();

  /**
   * @param {object} options
   * @param {import('./tactics-board.mjs').TacticsBoard} options.board état tactique
   * @param {import('./commands.mjs').CommandHistory} options.history exécute et garde les commandes
   * @param {THREE.Object3D} options.pitchGroup groupe racine du terrain
   * @param {() => THREE.Object3D[]} options.getHitboxes zones de sélection des joueurs et du ballon
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — machine à états (sélection, déplacement, flèches)
   */
  constructor({ board, history, pitchGroup, getHitboxes }) {
    super();
    this.#board = board;
    this.#history = history;
    this.#pitchGroup = pitchGroup;
    this.#getHitboxes = getHitboxes;
  }

  /**
   * Mode courant : une valeur de INTERACTION_MODES.
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — machine à états (sélection, déplacement, flèches)
   */
  get mode() {
    return this.#mode;
  }

  /**
   * État courant : une valeur de INTERACTION_STATES.
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — machine à états (sélection, déplacement, flèches)
   */
  get state() {
    if (!this.#enabled) {
      return INTERACTION_STATES.DISABLED;
    }
    if (this.#mode === INTERACTION_MODES.MOVE) {
      return this.#selection ? INTERACTION_STATES.SELECTED : INTERACTION_STATES.IDLE;
    }
    return this.#arrowStart ? INTERACTION_STATES.ARROW_END : INTERACTION_STATES.ARROW_START;
  }

  /**
   * Objet sélectionné (copie), ou null.
   * @returns {{type: string, teamId?: string, number?: number}|null}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — machine à états (sélection, déplacement, flèches)
   */
  get selection() {
    return this.#selection ? { ...this.#selection } : null;
  }

  /**
   * Départ de la flèche en cours de tracé (copie, repère du terrain), ou null.
   * @returns {{x: number, z: number}|null}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — machine à états (sélection, déplacement, flèches)
   */
  get arrowStart() {
    return this.#arrowStart ? { ...this.#arrowStart } : null;
  }

  /**
   * Vrai quand un aperçu suit le rayon survolé : pendant le tracé d'une flèche.
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — aperçu des flèches
   */
  get wantsHover() {
    return this.state === INTERACTION_STATES.ARROW_END;
  }

  /**
   * Point survolé pour l'aperçu de la flèche (repère du terrain), ou null. Le vecteur est réutilisé
   * d'une image à l'autre : à lire, pas à garder.
   * @returns {THREE.Vector3|null}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — aperçu des flèches
   */
  get hoverPoint() {
    return this.#hasHover && this.wantsHover ? this.#hoverPoint : null;
  }

  /**
   * Change de mode ; la sélection et la flèche en cours sont abandonnées.
   * @param {string} mode une valeur de INTERACTION_MODES
   * @returns {boolean} vrai si le mode a changé
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — machine à états (sélection, déplacement, flèches)
   */
  setMode(mode) {
    if (!Object.values(INTERACTION_MODES).includes(mode)) {
      throw new RangeError(`Mode inconnu : ${mode}`);
    }
    if (mode === this.#mode) {
      return false;
    }
    this.#mode = mode;
    this.#clearDraft();
    this.#notify();
    return true;
  }

  /**
   * Active ou coupe l'interaction (en AR, coupée tant que le terrain n'est pas posé).
   * @param {boolean} enabled
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — machine à états (sélection, déplacement, flèches)
   */
  setEnabled(enabled) {
    if (enabled === this.#enabled) {
      return;
    }
    this.#enabled = enabled;
    this.#clearDraft();
    this.#notify();
  }

  /**
   * Abandonne la sélection et la flèche en cours, sans changer de mode.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — machine à états (sélection, déplacement, flèches)
   */
  cancel() {
    if (!this.#selection && !this.#arrowStart) {
      return;
    }
    this.#clearDraft();
    this.#notify();
  }

  /**
   * Traite un toucher (ou un clic), décrit par son rayon en coordonnées monde.
   * @param {THREE.Raycaster} raycaster rayon orienté par src/pointer-input.mjs ou src/xr-input.mjs
   * @returns {{action: string, message?: string}} action réalisée : « select », « deselect »,
   *   « move », « arrow-start », « arrow », « invalid » ou « none »
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — machine à états (sélection, déplacement, flèches)
   */
  handleTap(raycaster) {
    if (!this.#enabled) {
      return { action: 'none' };
    }
    // Les objets ont pu bouger depuis la dernière image (ancre, animation) : matrices à jour.
    this.#pitchGroup.updateMatrixWorld(true);
    return this.#mode === INTERACTION_MODES.MOVE ? this.#tapInMoveMode(raycaster) : this.#tapInArrowMode(raycaster);
  }

  /**
   * Suit le rayon survolé pour l'aperçu de la flèche (souris, ou source d'entrée WebXR suivie).
   * @param {THREE.Raycaster|null} raycaster rayon survolé, ou null quand il n'y en a plus
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — aperçu des flèches
   */
  hover(raycaster) {
    if (!raycaster || !this.wantsHover) {
      this.#hasHover = false;
      return;
    }
    this.#pitchGroup.updateMatrixWorld(true);
    const point = this.#arrowPoint(raycaster);
    this.#hasHover = Boolean(point && isOnBoard(point));
    if (this.#hasHover) {
      this.#hoverPoint.set(point.x, 0, point.z);
    }
  }

  /**
   * Toucher en mode « déplacer » : sélection d'un joueur ou du ballon, puis place de destination.
   * @param {THREE.Raycaster} raycaster
   * @returns {{action: string, message?: string}}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — sélection et déplacement (BF5, BF6)
   */
  #tapInMoveMode(raycaster) {
    const picked = pickTarget(raycaster, this.#getHitboxes());
    const target = picked ? describeTarget(picked.object) : null;
    if (target) {
      if (sameTarget(target, this.#selection)) {
        this.#selection = null;
        this.#notify();
        return this.#feedback('deselect', 'info', MESSAGES.deselected);
      }
      this.#selection = target;
      this.#notify();
      const name = selectionLabel(target);
      return this.#feedback('select', 'info', `${name.charAt(0).toUpperCase()}${name.slice(1)} sélectionné : touchez sa nouvelle place.`);
    }

    const point = intersectPitchPlane(raycaster, this.#pitchGroup, this.#planePoint);
    if (!this.#selection) {
      return point && isOnBoard(point)
        ? this.#feedback('none', 'info', MESSAGES.nothingSelected)
        : this.#feedback('invalid', 'invalid', point ? MESSAGES.outside : MESSAGES.missed);
    }
    if (!point) {
      return this.#feedback('invalid', 'invalid', MESSAGES.missed);
    }
    if (!isOnBoard(point)) {
      return this.#feedback('invalid', 'invalid', MESSAGES.outside);
    }

    const selection = this.#selection;
    const isBall = selection.type === 'ball';
    const to = clampToBoard(point, isBall ? BALL_MARGIN : PLAYER_MARGIN);
    const command = isBall
      ? new MoveBallCommand({ board: this.#board, to })
      : new MovePlayerCommand({ board: this.#board, teamId: selection.teamId, number: selection.number, to });
    const moved = this.#history.execute(command);
    this.#selection = null;
    this.#notify();
    return moved
      ? this.#feedback('move', 'success', `${command.label} : fait.`)
      : this.#feedback('none', 'info', MESSAGES.unchanged);
  }

  /**
   * Toucher en mode « passe » ou « course » : départ, puis arrivée de la flèche.
   * @param {THREE.Raycaster} raycaster
   * @returns {{action: string, message?: string}}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — flèches tactiques (BF7)
   */
  #tapInArrowMode(raycaster) {
    const point = this.#arrowPoint(raycaster);
    if (!point) {
      return this.#feedback('invalid', 'invalid', MESSAGES.missed);
    }
    if (!isOnBoard(point)) {
      return this.#feedback('invalid', 'invalid', MESSAGES.outside);
    }
    const kindLabel = this.#mode === INTERACTION_MODES.PASS ? 'passe' : 'course';
    if (!this.#arrowStart) {
      this.#arrowStart = { x: point.x, z: point.z };
      this.#hasHover = false;
      this.#notify();
      return this.#feedback('arrow-start', 'info', `Départ de la ${kindLabel} posé : touchez le point d’arrivée.`);
    }
    const from = this.#arrowStart;
    if (Math.hypot(point.x - from.x, point.z - from.z) < MIN_ARROW_LENGTH) {
      return this.#feedback('invalid', 'invalid', MESSAGES.tooShort);
    }
    const command = new AddArrowCommand({ board: this.#board, arrow: { kind: this.#mode, from, to: { x: point.x, z: point.z } } });
    this.#history.execute(command);
    this.#arrowStart = null;
    this.#hasHover = false;
    this.#notify();
    return this.#feedback('arrow', 'success', `${command.label} : fait.`);
  }

  /**
   * Point d'une flèche visé par le rayon : la place d'un joueur ou du ballon touché, sinon le point
   * du gazon. Les flèches relient ainsi exactement les joueurs.
   * @param {THREE.Raycaster} raycaster
   * @returns {{x: number, z: number}|null} point dans le repère du terrain
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — flèches tactiques (BF7)
   */
  #arrowPoint(raycaster) {
    const picked = pickTarget(raycaster, this.#getHitboxes());
    const target = picked ? describeTarget(picked.object) : null;
    if (target?.type === 'player') {
      return this.#board.getPlayerPosition(target.teamId, target.number);
    }
    if (target?.type === 'ball') {
      return this.#board.getBallPosition();
    }
    return intersectPitchPlane(raycaster, this.#pitchGroup, this.#planePoint);
  }

  /**
   * Abandonne la sélection, la flèche en cours et l'aperçu.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — machine à états (sélection, déplacement, flèches)
   */
  #clearDraft() {
    this.#selection = null;
    this.#arrowStart = null;
    this.#hasHover = false;
  }

  /**
   * Prévient les observateurs (scène, barre d'outils) de l'état courant.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — machine à états (sélection, déplacement, flèches)
   */
  #notify() {
    this.emit('statechange', { mode: this.#mode, state: this.state, selection: this.selection, arrowStart: this.arrowStart });
  }

  /**
   * Émet un retour pour l'interface et le renvoie à l'appelant.
   * @param {string} action
   * @param {'info'|'success'|'invalid'} kind
   * @param {string} message
   * @returns {{action: string, message: string}}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — retours à l'utilisateur
   */
  #feedback(action, kind, message) {
    this.emit('feedback', { kind, message });
    return { action, message };
  }
}
