/**
 * Interaction tactique (sprint 5, BF5 à BF7) : la machine à états qui transforme un rayon en action.
 *
 * Elle ne sait pas d'où vient le rayon : la souris ou le doigt hors AR (src/pointer-input.mjs), ou
 * une source d'entrée WebXR en AR (src/xr-input.mjs). Elle ne dessine rien : la scène lit son état
 * (src/tactical-view.mjs). Elle ne modifie pas le tableau elle-même : elle crée des commandes, que
 * l'historique exécute (src/commands.mjs, patron Command). Les règles des flèches viennent de
 * src/arrow-rules.mjs (docs/regles-des-fleches.md) : une flèche refusée ne devient jamais une
 * commande, et n'entre donc jamais dans l'historique.
 *
 * Modes et états :
 * - « move » : idle (rien de sélectionné) → toucher un joueur ou le ballon → selected → toucher une
 *   place du plateau → le joueur ou le ballon y va, puis idle. Toucher l'objet sélectionné annule
 *   la sélection ; toucher un autre objet le sélectionne à la place.
 * - « pass » et « run » : arrow-start → toucher le départ (le ballon ou son porteur pour une passe,
 *   un joueur pour une course) → arrow-end → toucher l'arrivée → la flèche est tracée, puis
 *   arrow-start pour la suivante. Toucher de nouveau le départ annule le tracé. Un départ ou une
 *   arrivée refusés laissent l'état inchangé et expliquent pourquoi.
 * - « disabled » : interaction coupée, en AR tant que le terrain n'est pas posé.
 *
 * Pendant le choix d'une destination (selected, arrow-end), le rayon survolé (souris, doigt posé,
 * source d'entrée WebXR) donne un aperçu, jugé par les mêmes règles que le toucher : valide ou
 * refusé, avec sa raison. Changer de mode, ou un changement du tableau (annuler, rétablir,
 * réinitialiser) pendant un tracé, abandonne ce tracé : son départ pourrait ne plus exister. Un
 * second toucher au même endroit dans les 350 ms (double toucher involontaire) est ignoré.
 *
 * Événements :
 * - statechange : { mode, state, selection, arrowStart, draft } ;
 * - feedback : { kind, message }, kind valant « info », « success » ou « invalid ».
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';
import { EventEmitter } from './events.mjs';
import { findTargetOnRay, intersectPitchPlane, pickTarget } from './raycasting.mjs';
import { ARROW_KINDS, BALL_MARGIN, clampToBoard, isOnBoard, PLAYER_MARGIN } from './tactics-board.mjs';
import {
  BALL_ARROW_KINDS, readTacticalState, resolveArrowEnd, resolveArrowStart, sameTarget, targetLabel,
} from './arrow-rules.mjs';
import { AddArrowCommand, MarkPlayerCommand, MoveBallCommand, MovePlayerCommand } from './commands.mjs';

export { sameTarget, targetLabel as selectionLabel } from './arrow-rules.mjs';

/** Modes de l'interaction : déplacer, tracer une passe, tracer une course. */
export const INTERACTION_MODES = Object.freeze({
  MOVE: 'move', PASS: ARROW_KINDS.PASS, RUN: ARROW_KINDS.RUN, DRIBBLE: ARROW_KINDS.DRIBBLE, CROSS: ARROW_KINDS.CROSS, SHOT: ARROW_KINDS.SHOT,
  MARK: 'mark',
});

/** États de la machine à états. */
export const INTERACTION_STATES = Object.freeze({
  DISABLED: 'disabled',
  IDLE: 'idle',
  SELECTED: 'selected',
  ARROW_START: 'arrow-start',
  ARROW_END: 'arrow-end',
});

/** Délai sous lequel un second toucher au même endroit est un double toucher involontaire, en ms. */
export const REPEAT_TAP_MS = 350;

/** Écart d'angle sous lequel deux rayons visent le même endroit, en radians (environ 1°). */
const REPEAT_TAP_ANGLE = 0.02;

/** Messages de retour, affichés dans le bandeau d'aide. */
const MESSAGES = Object.freeze({
  outside: 'Hors du terrain : touchez une place sur le plateau.',
  missed: 'Visez le terrain.',
  nothingSelected: 'Touchez d’abord un joueur ou le ballon.',
  deselected: 'Sélection annulée.',
  unchanged: 'Déjà à cette place.',
  draftCancelled: 'Tracé annulé.',
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
 * Complément « de … » d'un objet : « du n° 9 des Bleus », « du ballon ».
 * @param {{type: string, teamId?: string, number?: number}} target
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Interaction tactique — retours à l'utilisateur
 */
export function ofLabel(target) {
  return targetLabel(target).replace(/^le /, 'du ');
}

/**
 * Met la première lettre d'un texte en majuscule.
 * @param {string} text
 * @returns {string}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Interaction tactique — retours à l'utilisateur
 */
function capitalize(text) {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/**
 * Consigne affichée quand le départ d'une flèche est posé.
 * @param {{kind: string, actor: object, passer: object|null}} draft
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Interaction tactique — retours à l'utilisateur
 */
export function describeDraft({ kind, actor, passer }) {
  if (kind === INTERACTION_MODES.MARK) {
    return `Marquage ${ofLabel(actor)} : touchez l’adversaire qu’il prend en charge.`;
  }
  if (kind === ARROW_KINDS.RUN) {
    return `Course ${ofLabel(actor)} : touchez son point d’arrivée.`;
  }
  const from = passer ? ofLabel(passer) : 'depuis le ballon';
  switch (kind) {
    case ARROW_KINDS.DRIBBLE:
      return `Dribble ${from} : touchez l’endroit où il emmène le ballon.`;
    case ARROW_KINDS.CROSS:
      return `Centre ${from} : touchez un point de la surface de réparation.`;
    case ARROW_KINDS.SHOT:
      return `Tir ${from} : touchez le but, entre les poteaux.`;
    default:
      return `Passe ${from} : touchez un partenaire ou un espace libre.`;
  }
}

/**
 * Retour affiché quand une flèche est tracée.
 * @param {string} kind
 * @param {{type: string, teamId?: string, number?: number}|null} receiver
 * @param {{type: string, teamId?: string, number?: number}} actor
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Interaction tactique — retours à l'utilisateur
 */
export function describeArrowDone(kind, receiver, actor) {
  if (kind === ARROW_KINDS.RUN) {
    return `Course ${ofLabel(actor)} tracée.`;
  }
  if (kind === ARROW_KINDS.DRIBBLE) {
    return 'Dribble tracé.';
  }
  if (kind === ARROW_KINDS.CROSS) {
    return receiver ? `Centre pour ${targetLabel(receiver)} tracé.` : 'Centre dans la surface tracé.';
  }
  if (kind === ARROW_KINDS.SHOT) {
    return 'Tir tracé.';
  }
  return receiver ? `Passe vers ${targetLabel(receiver)} tracée.` : 'Passe dans l’espace tracée.';
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
  #now;
  #mode = INTERACTION_MODES.MOVE;
  #enabled = true;
  #selection = null;
  /** @type {{kind: string, start: {x: number, z: number}, actor: object, passer: object|null}|null} */
  #draft = null;
  /** @type {ReturnType<typeof readTacticalState>|null} état des règles, relu après chaque changement */
  #rulesState = null;
  #hoverPoint = new THREE.Vector3();
  /** @type {{hasPoint: boolean, valid: boolean, cancel: boolean, reason: string|null, message: string|null, receiver: object|null}|null} */
  #hover = null;
  #planePoint = new THREE.Vector3();
  #lastTap = { time: -Infinity, origin: new THREE.Vector3(), direction: new THREE.Vector3() };

  /**
   * @param {object} options
   * @param {import('./tactics-board.mjs').TacticsBoard} options.board état tactique
   * @param {import('./commands.mjs').CommandHistory} options.history exécute et garde les commandes
   * @param {THREE.Object3D} options.pitchGroup groupe racine du terrain
   * @param {() => THREE.Object3D[]} options.getHitboxes zones de sélection des joueurs et du ballon
   * @param {() => number} [options.now] horloge en millisecondes, remplacée dans les tests
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — machine à états (sélection, déplacement, flèches)
   */
  constructor({ board, history, pitchGroup, getHitboxes, now = () => globalThis.performance?.now() ?? Date.now() }) {
    super();
    this.#board = board;
    this.#history = history;
    this.#pitchGroup = pitchGroup;
    this.#getHitboxes = getHitboxes;
    this.#now = now;
    board.on('change', () => this.#onBoardChange());
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
    return this.#draft ? INTERACTION_STATES.ARROW_END : INTERACTION_STATES.ARROW_START;
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
    return this.#draft ? { ...this.#draft.start } : null;
  }

  /**
   * Flèche en cours de tracé (copie) : type, départ, objet de départ et passeur, ou null.
   * @returns {{kind: string, start: {x: number, z: number}, actor: object, passer: object|null}|null}
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Interaction tactique — flèches tactiques (BF7)
   */
  get draft() {
    if (!this.#draft) {
      return null;
    }
    const { kind, start, actor, passer } = this.#draft;
    return { kind, start: { ...start }, actor: { ...actor }, passer: passer ? { ...passer } : null };
  }

  /**
   * Vrai quand un aperçu suit le rayon survolé : pendant le choix d'une destination (joueur ou
   * ballon sélectionné, ou arrivée d'une flèche).
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — aperçu des flèches
   */
  get wantsHover() {
    const { state } = this;
    // Un marquage relie deux joueurs : pas d'aperçu de flèche entre les deux touchers.
    if (this.#mode === INTERACTION_MODES.MARK) {
      return false;
    }
    return state === INTERACTION_STATES.ARROW_END || state === INTERACTION_STATES.SELECTED;
  }

  /**
   * Point survolé pour l'aperçu (repère du terrain), ou null : arrivée de la flèche telle que les
   * règles la placeraient, ou destination du déplacement. Le vecteur est réutilisé d'une image à
   * l'autre : à lire, pas à garder.
   * @returns {THREE.Vector3|null}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — aperçu des flèches
   */
  get hoverPoint() {
    return this.#hover?.hasPoint && this.wantsHover ? this.#hoverPoint : null;
  }

  /**
   * Jugement de l'aperçu : valide ou refusé, avec la raison et le message du refus, le receveur
   * d'une passe, ou cancel si le rayon vise le départ (toucher annulerait le tracé). Null sans aperçu.
   * @returns {{valid: boolean, cancel: boolean, reason: string|null, message: string|null, receiver: object|null}|null}
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Interaction tactique — aperçu des flèches
   */
  get hoverVerdict() {
    if (!this.#hover || !this.wantsHover) {
      return null;
    }
    const { valid, cancel, reason, message, receiver } = this.#hover;
    return { valid, cancel, reason, message, receiver };
  }

  /**
   * État des règles des flèches : ballon, joueurs et flèches en données simples, relu seulement
   * après un changement du tableau.
   * @returns {ReturnType<typeof readTacticalState>}
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Interaction tactique — règles des flèches
   */
  get rulesState() {
    this.#rulesState ??= readTacticalState(this.#board);
    return this.#rulesState;
  }

  /**
   * Change de mode ; la sélection et la flèche en cours sont abandonnées, et l'interface le dit.
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
    const abandoned = this.#draft ? 'Tracé en cours abandonné.' : (this.#selection ? 'Sélection abandonnée.' : null);
    this.#mode = mode;
    this.#forgetLastTap();
    this.#clearDraft();
    this.#notify();
    if (abandoned) {
      this.#feedback('none', 'info', abandoned);
    }
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
   * @returns {boolean} vrai s'il y avait quelque chose à abandonner
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — machine à états (sélection, déplacement, flèches)
   */
  cancel() {
    if (!this.#selection && !this.#draft) {
      return false;
    }
    this.#forgetLastTap();
    this.#clearDraft();
    this.#notify();
    return true;
  }

  /**
   * Traite un toucher (ou un clic), décrit par son rayon en coordonnées monde.
   * @param {THREE.Raycaster} raycaster rayon orienté par src/pointer-input.mjs ou src/xr-input.mjs
   * @returns {{action: string, message?: string, repeated?: boolean}} action réalisée : « select »,
   *   « deselect », « move », « arrow-start », « arrow », « cancel », « invalid » ou « none »
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — machine à états (sélection, déplacement, flèches)
   */
  handleTap(raycaster) {
    if (!this.#enabled) {
      return { action: 'none' };
    }
    if (this.#isRepeatedTap(raycaster)) {
      return { action: 'none', repeated: true };
    }
    // Les objets ont pu bouger depuis la dernière image (ancre, animation) : matrices à jour.
    this.#pitchGroup.updateMatrixWorld(true);
    if (this.#mode === INTERACTION_MODES.MARK) {
      return this.#tapInMarkMode(raycaster);
    }
    return this.#mode === INTERACTION_MODES.MOVE ? this.#tapInMoveMode(raycaster) : this.#tapInArrowMode(raycaster);
  }

  /**
   * Suit le rayon survolé pour l'aperçu (souris, doigt posé, ou source d'entrée WebXR), et le juge
   * par les règles du toucher.
   * @param {THREE.Raycaster|null} raycaster rayon survolé, ou null quand il n'y en a plus
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — aperçu des flèches
   */
  hover(raycaster) {
    if (!raycaster || !this.wantsHover) {
      this.#hover = null;
      return;
    }
    this.#pitchGroup.updateMatrixWorld(true);
    const { target, point } = this.#aim(raycaster);
    if (this.#draft) {
      const decision = resolveArrowEnd({ draft: this.#draft, target, point }, this.rulesState);
      const end = decision.ok || !decision.cancel ? decision.end ?? null : null;
      this.#setHover(end, {
        valid: decision.ok,
        cancel: Boolean(decision.cancel),
        reason: decision.reason ?? null,
        message: decision.message ?? null,
        receiver: decision.receiver ?? null,
      });
      return;
    }
    // Déplacement : un autre objet visé serait sélectionné, pas déplacé ; pas d'aperçu.
    if (target) {
      this.#setHover(null, { valid: false, cancel: sameTarget(target, this.#selection), reason: null, message: null, receiver: null });
      return;
    }
    const onBoard = Boolean(point) && isOnBoard(point);
    const destination = onBoard ? clampToBoard(point, this.#selection.type === 'ball' ? BALL_MARGIN : PLAYER_MARGIN) : point;
    this.#setHover(destination, {
      valid: onBoard, cancel: false, reason: onBoard ? null : 'outside', message: onBoard ? null : MESSAGES.outside, receiver: null,
    });
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
    const { target, point } = this.#aim(raycaster);
    if (target) {
      if (sameTarget(target, this.#selection)) {
        this.#selection = null;
        this.#hover = null;
        this.#notify();
        return this.#feedback('deselect', 'info', MESSAGES.deselected);
      }
      this.#selection = target;
      this.#hover = null;
      this.#notify();
      const name = targetLabel(target);
      return this.#feedback('select', 'info', `${name.charAt(0).toUpperCase()}${name.slice(1)} sélectionné : touchez sa nouvelle place.`);
    }

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
    this.#selection = null;
    this.#hover = null;
    const moved = this.#history.execute(command);
    this.#notify();
    return moved
      ? this.#feedback('move', 'success', `${command.label} : fait.`)
      : this.#feedback('none', 'info', MESSAGES.unchanged);
  }

  /**
   * Toucher en mode « passe » ou « course » : départ, puis arrivée de la flèche, chacun décidé par
   * les règles des flèches (src/arrow-rules.mjs).
   * @param {THREE.Raycaster} raycaster
   * @returns {{action: string, message?: string}}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — flèches tactiques (BF7)
   */
  #tapInArrowMode(raycaster) {
    const { target, point } = this.#aim(raycaster);
    if (!this.#draft) {
      let decision = resolveArrowStart({ kind: this.#mode, target, point }, this.rulesState);
      // Vu de côté (AR, téléphone près de la table), un joueur peut cacher le ballon : si l'objet
      // le plus proche ne peut pas commencer la passe et que le rayon traverse aussi le ballon,
      // c'est le ballon qui était visé.
      if (!decision.ok && BALL_ARROW_KINDS.includes(this.#mode) && target?.type !== 'ball'
        && findTargetOnRay(raycaster, this.#getHitboxes(), (object) => object.userData?.type === 'ball')) {
        decision = resolveArrowStart({ kind: this.#mode, target: { type: 'ball' }, point }, this.rulesState);
      }
      if (!decision.ok) {
        return this.#feedback('invalid', 'invalid', decision.message);
      }
      this.#draft = { kind: this.#mode, start: decision.start, actor: decision.actor, passer: decision.passer };
      this.#hover = null;
      this.#notify();
      return this.#feedback('arrow-start', 'info', describeDraft(this.#draft));
    }
    const draft = this.#draft;
    const decision = resolveArrowEnd({ draft, target, point }, this.rulesState);
    if (decision.cancel) {
      this.#clearDraft();
      this.#notify();
      return this.#feedback('cancel', 'info', MESSAGES.draftCancelled);
    }
    if (!decision.ok) {
      return this.#feedback('invalid', 'invalid', decision.message);
    }
    // Le tracé se termine avant la commande : le changement du tableau qu'elle provoque ne
    // l'abandonne pas une seconde fois.
    this.#clearDraft();
    this.#history.execute(new AddArrowCommand({ board: this.#board, arrow: { kind: draft.kind, from: draft.start, to: decision.end } }));
    this.#notify();
    return this.#feedback('arrow', 'success', describeArrowDone(draft.kind, decision.receiver, draft.actor));
  }

  /**
   * Toucher en mode « marquage » : le défenseur, puis l'adversaire qu'il prend en charge, par une
   * commande annulable. Toucher de nouveau le défenseur abandonne ; un partenaire est refusé.
   * @param {THREE.Raycaster} raycaster
   * @returns {{action: string, message?: string}}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Interaction tactique — marquage individuel
   */
  #tapInMarkMode(raycaster) {
    const { target } = this.#aim(raycaster);
    if (!this.#draft) {
      if (target?.type !== 'player') {
        return this.#feedback('invalid', 'invalid', 'Un marquage part d’un joueur : touchez le défenseur.');
      }
      const start = this.#board.getPlayerPosition(target.teamId, target.number);
      this.#draft = { kind: INTERACTION_MODES.MARK, start, actor: { ...target }, passer: null };
      this.#notify();
      return this.#feedback('arrow-start', 'info', describeDraft(this.#draft));
    }
    const draft = this.#draft;
    if (sameTarget(target, draft.actor)) {
      this.#clearDraft();
      this.#notify();
      return this.#feedback('cancel', 'info', MESSAGES.draftCancelled);
    }
    if (target?.type !== 'player' || target.teamId === draft.actor.teamId) {
      return this.#feedback('invalid', 'invalid', 'Un marquage relie deux adversaires : touchez un joueur de l’autre équipe.');
    }
    this.#clearDraft();
    const command = new MarkPlayerCommand({ board: this.#board, defender: draft.actor, attacker: target });
    this.#history.execute(command);
    this.#notify();
    const message = command.removed
      ? `Marquage retiré : ${targetLabel(draft.actor)} ne marque plus ${targetLabel(target)}.`
      : `${capitalize(targetLabel(draft.actor))} marque ${targetLabel(target)}.`;
    return this.#feedback('mark', 'success', message);
  }

  /**
   * Ce que vise un rayon : l'objet touché (joueur ou ballon) et le point du gazon, dans le repère
   * du terrain.
   * @param {THREE.Raycaster} raycaster
   * @returns {{target: object|null, point: {x: number, z: number}|null}}
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Interaction tactique — cible d'un rayon
   */
  #aim(raycaster) {
    const picked = pickTarget(raycaster, this.#getHitboxes());
    const ground = intersectPitchPlane(raycaster, this.#pitchGroup, this.#planePoint);
    return {
      target: picked ? describeTarget(picked.object) : null,
      point: ground ? { x: ground.x, z: ground.z } : null,
    };
  }

  /**
   * Indique si un toucher répète le précédent : même endroit visé, moins de REPEAT_TAP_MS après.
   * Le toucher est retenu pour la comparaison suivante.
   * @param {THREE.Raycaster} raycaster
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Interaction tactique — touchers répétés
   */
  #isRepeatedTap(raycaster) {
    const now = this.#now();
    const { ray } = raycaster;
    const last = this.#lastTap;
    const repeated = now - last.time < REPEAT_TAP_MS
      && ray.origin.distanceTo(last.origin) < 0.01
      && ray.direction.angleTo(last.direction) < REPEAT_TAP_ANGLE;
    last.time = now;
    last.origin.copy(ray.origin);
    last.direction.copy(ray.direction);
    return repeated;
  }

  /**
   * Oublie le dernier toucher : après un changement d'outil ou un abandon, le toucher suivant est
   * une nouvelle intention, jamais un double toucher.
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Interaction tactique — touchers répétés
   */
  #forgetLastTap() {
    this.#lastTap.time = -Infinity;
  }

  /**
   * Enregistre l'aperçu courant.
   * @param {{x: number, z: number}|null} point point de l'aperçu, ou null
   * @param {{valid: boolean, cancel: boolean, reason: string|null, message: string|null, receiver: object|null}} verdict
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Interaction tactique — aperçu des flèches
   */
  #setHover(point, verdict) {
    const hasPoint = Boolean(point) && Number.isFinite(point.x) && Number.isFinite(point.z);
    if (hasPoint) {
      this.#hoverPoint.set(point.x, 0, point.z);
    }
    this.#hover = { hasPoint, ...verdict };
  }

  /**
   * Un changement du tableau (commande, annulation, rétablissement) périme l'état des règles, et
   * abandonne une flèche en cours : son départ a pu bouger ou disparaître.
   * @responsable Bilel Khlif
   * @date 2026-11-23
   * @role Interaction tactique — règles des flèches
   */
  #onBoardChange() {
    this.#rulesState = null;
    if (this.#draft) {
      this.#clearDraft();
      this.#notify();
      this.#feedback('none', 'info', 'Tracé abandonné : le terrain a changé.');
    }
  }

  /**
   * Abandonne la sélection, la flèche en cours et l'aperçu.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — machine à états (sélection, déplacement, flèches)
   */
  #clearDraft() {
    this.#selection = null;
    this.#draft = null;
    this.#hover = null;
  }

  /**
   * Prévient les observateurs (scène, barre d'outils) de l'état courant.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Interaction tactique — machine à états (sélection, déplacement, flèches)
   */
  #notify() {
    this.emit('statechange', {
      mode: this.#mode, state: this.state, selection: this.selection, arrowStart: this.arrowStart, draft: this.draft,
    });
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
