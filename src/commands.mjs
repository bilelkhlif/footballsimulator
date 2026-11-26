/**
 * Patron Command (cahier §3.4, sprint 5) : chaque action de l'utilisateur est un objet qui sait
 * s'exécuter et s'annuler (BF8, « Annuler la dernière action »).
 *
 * Les commandes ne modifient que le tableau tactique (src/tactics-board.mjs) : elles ignorent la
 * scène 3D, qui suit le tableau (patron Observer, src/tactical-view.mjs), et les gestes de
 * l'utilisateur, traduits en commandes par src/tactical-interaction.mjs. L'exécution est donc
 * séparée du rendu et de la saisie.
 *
 * Une annulation rétablit l'état tactique exact d'avant la commande : les places voulues de
 * chaque joueur, pas les positions intermédiaires d'une animation en cours. Annuler pendant une
 * transition de formation ramène donc chaque joueur à la place qu'il avait, au millimètre.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { EventEmitter } from './events.mjs';
import { TEAMS } from './config.mjs';
import { PHASE_LABELS } from './formations.mjs';

/** Libellé, dans l'historique, du tracé de chaque type de flèche. */
const ARROW_LABELS = Object.freeze({
  pass: 'Tracer une passe', run: 'Tracer une course', dribble: 'Tracer un dribble', cross: 'Tracer un centre', shot: 'Tracer un tir',
});

/** Nombre maximal d'actions gardées pour l'annulation. */
export const HISTORY_LIMIT = 100;

/**
 * Nom affiché d'une équipe, par exemple « Bleus ».
 * @param {string} teamId
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Logique métier — patron Command : libellés des actions
 */
function teamLabel(teamId) {
  return TEAMS[teamId]?.label ?? teamId;
}

/**
 * Commande de base : une action annulable.
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Logique métier — patron Command : commande de base
 */
export class Command {
  /**
   * Libellé de l'action, affiché dans l'interface (« Annuler : … »).
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : commande de base
   */
  get label() {
    return 'Action';
  }

  /**
   * Exécute l'action.
   * @returns {boolean} vrai si l'état tactique a changé ; une action sans effet n'est pas gardée
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : commande de base
   */
  execute() {
    throw new Error('execute() doit être défini par la commande');
  }

  /**
   * Annule l'action : rétablit l'état d'avant execute().
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : commande de base
   */
  undo() {
    throw new Error('undo() doit être défini par la commande');
  }
}

/**
 * Déplacer un joueur, reconnu par son équipe et son numéro (BF5).
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Logique métier — patron Command : déplacement d'un joueur
 */
export class MovePlayerCommand extends Command {
  #board;
  #teamId;
  #number;
  #to;
  #from = null;

  /**
   * @param {object} options
   * @param {import('./tactics-board.mjs').TacticsBoard} options.board
   * @param {string} options.teamId
   * @param {number} options.number numéro du maillot
   * @param {{x: number, z: number}} options.to nouvelle place, dans le repère du terrain
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : déplacement d'un joueur
   */
  constructor({ board, teamId, number, to }) {
    super();
    this.#board = board;
    this.#teamId = teamId;
    this.#number = number;
    this.#to = { x: to.x, z: to.z };
  }

  /**
   * Libellé : « Déplacer le n° 9 des Bleus ».
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : déplacement d'un joueur
   */
  get label() {
    return `Déplacer le n° ${this.#number} des ${teamLabel(this.#teamId)}`;
  }

  /**
   * Garde la place actuelle, puis déplace le joueur.
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : déplacement d'un joueur
   */
  execute() {
    this.#from = this.#board.getPlayerPosition(this.#teamId, this.#number);
    return this.#board.setPlayerPosition(this.#teamId, this.#number, this.#to);
  }

  /**
   * Ramène le joueur à la place gardée.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : déplacement d'un joueur
   */
  undo() {
    this.#board.setPlayerPosition(this.#teamId, this.#number, this.#from);
  }
}

/**
 * Déplacer le ballon (BF6).
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Logique métier — patron Command : déplacement du ballon
 */
export class MoveBallCommand extends Command {
  #board;
  #to;
  #from = null;

  /**
   * @param {object} options
   * @param {import('./tactics-board.mjs').TacticsBoard} options.board
   * @param {{x: number, z: number}} options.to nouvelle place, dans le repère du terrain
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : déplacement du ballon
   */
  constructor({ board, to }) {
    super();
    this.#board = board;
    this.#to = { x: to.x, z: to.z };
  }

  /**
   * Libellé : « Déplacer le ballon ».
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : déplacement du ballon
   */
  get label() {
    return 'Déplacer le ballon';
  }

  /**
   * Garde la place actuelle, puis déplace le ballon.
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : déplacement du ballon
   */
  execute() {
    this.#from = this.#board.getBallPosition();
    return this.#board.setBallPosition(this.#to);
  }

  /**
   * Ramène le ballon à la place gardée.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : déplacement du ballon
   */
  undo() {
    this.#board.setBallPosition(this.#from);
  }
}

/**
 * Tracer une flèche de passe ou de course (BF7). La flèche garde le même identifiant quand elle
 * est rétablie après une annulation.
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Logique métier — patron Command : flèche tactique
 */
export class AddArrowCommand extends Command {
  #board;
  #arrow;
  #id;

  /**
   * @param {object} options
   * @param {import('./tactics-board.mjs').TacticsBoard} options.board
   * @param {{kind: string, from: {x: number, z: number}, to: {x: number, z: number}}} options.arrow
   *   type (ARROW_KINDS) et extrémités, dans le repère du terrain
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : flèche tactique
   */
  constructor({ board, arrow }) {
    super();
    this.#board = board;
    this.#arrow = { kind: arrow.kind, from: { x: arrow.from.x, z: arrow.from.z }, to: { x: arrow.to.x, z: arrow.to.z } };
    this.#id = undefined;
  }

  /**
   * Libellé : « Tracer une passe » ou « Tracer une course ».
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : flèche tactique
   */
  get label() {
    return ARROW_LABELS[this.#arrow.kind] ?? 'Tracer une flèche';
  }

  /**
   * Identifiant de la flèche, connu après la première exécution.
   * @returns {number|undefined}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : flèche tactique
   */
  get arrowId() {
    return this.#id;
  }

  /**
   * Ajoute la flèche au tableau.
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : flèche tactique
   */
  execute() {
    this.#id = this.#board.addArrow({ ...this.#arrow, id: this.#id }).id;
    return true;
  }

  /**
   * Retire la flèche.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : flèche tactique
   */
  undo() {
    this.#board.removeArrow(this.#id);
  }
}

/**
 * Changer la formation d'une équipe (BF4), de façon annulable : l'annulation rétablit la formation
 * et les places exactes d'avant, y compris celles de joueurs déplacés à la main.
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Logique métier — patron Command : changement de formation
 */
export class ChangeFormationCommand extends Command {
  #board;
  #teamId;
  #formation;
  #snapshot = null;

  /**
   * @param {object} options
   * @param {import('./tactics-board.mjs').TacticsBoard} options.board
   * @param {string} options.teamId
   * @param {string} options.formation nom de la formation, par exemple « 4-4-2 »
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : changement de formation
   */
  constructor({ board, teamId, formation }) {
    super();
    this.#board = board;
    this.#teamId = teamId;
    this.#formation = formation;
  }

  /**
   * Libellé : « Formation 4-4-2 des Rouges ».
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : changement de formation
   */
  get label() {
    return `Formation ${this.#formation} des ${teamLabel(this.#teamId)}`;
  }

  /**
   * Garde l'équipe telle qu'elle est (formation et places voulues), puis change la formation.
   * Sans effet si la formation est déjà en place.
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : changement de formation
   */
  execute() {
    if (this.#board.getFormation(this.#teamId).name === this.#formation) {
      return false;
    }
    this.#snapshot = this.#board.captureTeam(this.#teamId);
    this.#board.setFormation(this.#teamId, this.#formation);
    return true;
  }

  /**
   * Rétablit l'équipe gardée.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : changement de formation
   */
  undo() {
    this.#board.restoreTeam(this.#snapshot);
  }
}

/**
 * Bascule d'une équipe entre la base, la disposition en possession et celle hors possession
 * (le 4-3-3 en 2-3-5 ou en 4-5-1). Annulable : l'annulation rend la phase précédente et les
 * places exactes des joueurs, y compris ceux déplacés à la main.
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Logique métier — patron Command : bascule attaque / défense
 */
export class ChangePhaseCommand extends Command {
  #board;
  #teamId;
  #phase;
  #snapshot = null;

  /**
   * @param {object} options
   * @param {import('./tactics-board.mjs').TacticsBoard} options.board
   * @param {string} options.teamId
   * @param {string} options.phase une valeur de PHASES
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Command : bascule attaque / défense
   */
  constructor({ board, teamId, phase }) {
    super();
    this.#board = board;
    this.#teamId = teamId;
    this.#phase = phase;
  }

  /**
   * @returns {string}
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Command : bascule attaque / défense
   */
  get label() {
    const formation = this.#board.getFormation(this.#teamId);
    return `${PHASE_LABELS[this.#phase]} (${formation.shapeName(this.#phase)}) pour les ${teamLabel(this.#teamId)}`;
  }

  /**
   * @returns {boolean} faux si l'équipe est déjà dans cette phase
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Command : bascule attaque / défense
   */
  execute() {
    if (this.#board.getPhase(this.#teamId) === this.#phase) {
      return false;
    }
    this.#snapshot = this.#board.captureTeam(this.#teamId);
    this.#board.setPhase(this.#teamId, this.#phase);
    return true;
  }

  /**
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Logique métier — patron Command : bascule attaque / défense
   */
  undo() {
    this.#board.restoreTeam(this.#snapshot);
  }
}

/**
 * Réinitialiser le terrain (BF8) : formations de départ, joueurs à leurs places, ballon au centre,
 * flèches effacées. Annulable comme les autres actions.
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Logique métier — patron Command : réinitialisation du terrain
 */
export class ResetBoardCommand extends Command {
  #board;
  #snapshot = null;

  /**
   * @param {object} options
   * @param {import('./tactics-board.mjs').TacticsBoard} options.board
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : réinitialisation du terrain
   */
  constructor({ board }) {
    super();
    this.#board = board;
  }

  /**
   * Libellé : « Réinitialiser le terrain ».
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : réinitialisation du terrain
   */
  get label() {
    return 'Réinitialiser le terrain';
  }

  /**
   * Garde tout le tableau, puis le remet dans son état de départ. Sans effet s'il y est déjà.
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : réinitialisation du terrain
   */
  execute() {
    if (this.#board.isInInitialState()) {
      return false;
    }
    this.#snapshot = this.#board.snapshot();
    return this.#board.reset();
  }

  /**
   * Rétablit le tableau gardé.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : réinitialisation du terrain
   */
  undo() {
    this.#board.restore(this.#snapshot);
  }
}

/**
 * Enregistrer une image clé de la séquence (sprint 6, BF9) : la place de chaque joueur et du
 * ballon, prise dans le tableau tactique. Rétablie après une annulation, c'est la même image.
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Logique métier — patron Command : séquence animée (BF9)
 */
export class AddKeyframeCommand extends Command {
  #sequence;
  #board;
  #keyframe = null;

  /**
   * @param {object} options
   * @param {import('./tactical-sequence.mjs').TacticalSequence} options.sequence
   * @param {import('./tactics-board.mjs').TacticsBoard} options.board
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Logique métier — patron Command : séquence animée (BF9)
   */
  constructor({ sequence, board }) {
    super();
    this.#sequence = sequence;
    this.#board = board;
  }

  /**
   * Libellé : « Ajouter une image clé ».
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Logique métier — patron Command : séquence animée (BF9)
   */
  get label() {
    return 'Ajouter une image clé';
  }

  /**
   * Prend l'image clé la première fois, puis l'ajoute à la séquence.
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Logique métier — patron Command : séquence animée (BF9)
   */
  execute() {
    this.#keyframe ??= { players: this.#board.snapshot().players, ball: this.#board.getBallPosition() };
    this.#sequence.add(this.#keyframe);
    return true;
  }

  /**
   * Retire l'image clé ajoutée, la dernière de la séquence.
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Logique métier — patron Command : séquence animée (BF9)
   */
  undo() {
    this.#sequence.removeLast();
  }
}

/**
 * Effacer la séquence (sprint 6, BF9), de façon annulable.
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Logique métier — patron Command : séquence animée (BF9)
 */
export class ClearSequenceCommand extends Command {
  #sequence;
  #keyframes = null;

  /**
   * @param {{sequence: import('./tactical-sequence.mjs').TacticalSequence}} options
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Logique métier — patron Command : séquence animée (BF9)
   */
  constructor({ sequence }) {
    super();
    this.#sequence = sequence;
  }

  /**
   * Libellé : « Effacer la séquence ».
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Logique métier — patron Command : séquence animée (BF9)
   */
  get label() {
    return 'Effacer la séquence';
  }

  /**
   * Garde les images clés, puis les efface. Sans effet sur une séquence vide.
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Logique métier — patron Command : séquence animée (BF9)
   */
  execute() {
    if (this.#sequence.length === 0) {
      return false;
    }
    this.#keyframes = this.#sequence.clear();
    return true;
  }

  /**
   * Rétablit les images clés gardées.
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Logique métier — patron Command : séquence animée (BF9)
   */
  undo() {
    this.#sequence.restore(this.#keyframes);
  }
}

/**
 * Historique des commandes : annuler (Undo) et rétablir (Redo).
 *
 * Événement :
 * - change : { action, label, canUndo, canRedo } après chaque exécution, annulation ou
 *   rétablissement ; action vaut « execute », « undo », « redo » ou « clear ».
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Logique métier — patron Command : historique (Undo, Redo)
 */
export class CommandHistory extends EventEmitter {
  /** @type {Command[]} */
  #done = [];

  /** @type {Command[]} */
  #undone = [];

  #limit;

  /**
   * @param {{limit?: number}} [options] nombre maximal d'actions gardées
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : historique (Undo, Redo)
   */
  constructor({ limit = HISTORY_LIMIT } = {}) {
    super();
    this.#limit = limit;
  }

  /**
   * Vrai s'il reste une action à annuler.
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : historique (Undo, Redo)
   */
  get canUndo() {
    return this.#done.length > 0;
  }

  /**
   * Vrai s'il reste une action annulée à rétablir.
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : historique (Undo, Redo)
   */
  get canRedo() {
    return this.#undone.length > 0;
  }

  /**
   * Libellé de l'action qu'Annuler défera, ou null.
   * @returns {string|null}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : historique (Undo, Redo)
   */
  get undoLabel() {
    return this.#done.at(-1)?.label ?? null;
  }

  /**
   * Libellé de l'action que Rétablir refera, ou null.
   * @returns {string|null}
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : historique (Undo, Redo)
   */
  get redoLabel() {
    return this.#undone.at(-1)?.label ?? null;
  }

  /**
   * Exécute une commande et la garde, si elle a changé l'état tactique. Une nouvelle action efface
   * les actions annulées : on ne peut plus les rétablir. Si la commande lève une erreur, rien n'est
   * gardé et l'erreur remonte à l'appelant.
   * @param {Command} command
   * @returns {boolean} vrai si la commande a été gardée
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : historique (Undo, Redo)
   */
  execute(command) {
    if (!command.execute()) {
      return false;
    }
    this.#done.push(command);
    if (this.#done.length > this.#limit) {
      this.#done.shift();
    }
    this.#undone.length = 0;
    this.#notify('execute', command);
    return true;
  }

  /**
   * Annule la dernière action.
   * @returns {Command|null} la commande annulée, ou null s'il n'y en a pas
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : historique (Undo, Redo)
   */
  undo() {
    const command = this.#done.pop();
    if (!command) {
      return null;
    }
    command.undo();
    this.#undone.push(command);
    this.#notify('undo', command);
    return command;
  }

  /**
   * Rétablit la dernière action annulée.
   * @returns {Command|null} la commande rétablie, ou null s'il n'y en a pas
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : historique (Undo, Redo)
   */
  redo() {
    const command = this.#undone.pop();
    if (!command) {
      return null;
    }
    command.execute();
    this.#done.push(command);
    this.#notify('redo', command);
    return command;
  }

  /**
   * Oublie toutes les actions.
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : historique (Undo, Redo)
   */
  clear() {
    this.#done.length = 0;
    this.#undone.length = 0;
    this.#notify('clear', null);
  }

  /**
   * Prévient les observateurs (barre d'outils) de l'état de l'historique.
   * @param {string} action
   * @param {Command|null} command
   * @responsable Bilel Khlif
   * @date 2026-11-15
   * @role Logique métier — patron Command : historique (Undo, Redo)
   */
  #notify(action, command) {
    this.emit('change', { action, label: command?.label ?? null, canUndo: this.canUndo, canRedo: this.canRedo });
  }
}
