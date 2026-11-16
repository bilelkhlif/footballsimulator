/**
 * Lecture d'une séquence tactique (sprint 6, bonus BF9) : les joueurs et le ballon vont d'une
 * image clé à la suivante, en 1,5 s par étape à vitesse normale.
 *
 * La lecture est une tâche de la boucle de rendu existante (update) : pas de seconde boucle. À
 * chaque image, le temps écoulé depuis l'image précédente, multiplié par la vitesse, fait avancer
 * un curseur c (0 sur la première image clé, n - 1 sur la dernière). Entre les images clés k et
 * k + 1, avec t = c - k adouci par la même courbe que les transitions de formation :
 *
 *   place = place_k · (1 - e) + place_k+1 · e,   avec e = easeInOutCubic(t)
 *
 * Les places sont celles du repère du terrain : la lecture suit le terrain ancré, en AR comme en
 * vue 3D. Elles sont écrites directement sur les objets three.js, depuis des tableaux préparés au
 * lancement : aucune allocation par image.
 *
 * La lecture ne touche pas au tableau tactique : elle n'entre pas dans l'historique. Toute
 * modification du tableau (déplacement, annulation, formation) ou de la séquence l'arrête, et la
 * scène rejoint alors l'état du tableau. Il ne peut donc pas y avoir de conflit avec les commandes.
 *
 * Événement :
 * - statechange : { state, ended, step, steps, speed } au lancement, à la pause, à l'arrêt, à la fin
 *   et à chaque nouvelle étape.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { EventEmitter } from './events.js';
import { easeInOutCubic } from './formation-transition.js';

/** États de la lecture. */
export const PLAYBACK_STATES = Object.freeze({ STOPPED: 'stopped', PLAYING: 'playing', PAUSED: 'paused' });

/** Durée d'une étape (d'une image clé à la suivante) à vitesse normale, en millisecondes. */
export const STEP_DURATION_MS = 1500;

/** Vitesses de lecture proposées. */
export const PLAYBACK_SPEEDS = Object.freeze([0.5, 1, 2]);

/**
 * Lecteur de séquence.
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Animation — lecture de la séquence (BF9)
 */
export class SequencePlayer extends EventEmitter {
  #sequence;
  #view;
  #animator;
  /** @type {Array<{object: {position: {x: number, z: number}}, key: string}>} */
  #targets;
  #state = PLAYBACK_STATES.STOPPED;
  #speed = 1;
  #cursor = 0;
  #lastTime = null;
  #ended = false;
  #step = -1;
  /** @type {Float64Array[]|null} une ligne par image clé : x, z de chaque objet, dans l'ordre de #targets */
  #frames = null;

  /**
   * @param {object} options
   * @param {import('./tactical-sequence.js').TacticalSequence} options.sequence
   * @param {import('./tactics-board.js').TacticsBoard} options.board ses changements arrêtent la lecture
   * @param {{returnToBoard: () => void}} options.view vue tactique : la scène y rejoint le tableau
   * @param {{clear: () => void}} options.animator déplacements en cours, interrompus au lancement
   * @param {Array<{object: object, key: string}>} options.targets joueurs (clé « équipe:numéro ») et
   *   ballon (clé « ball »)
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Animation — lecture de la séquence (BF9)
   */
  constructor({ sequence, board, view, animator, targets }) {
    super();
    this.#sequence = sequence;
    this.#view = view;
    this.#animator = animator;
    this.#targets = targets;
    board.on('change', () => this.stop());
    sequence.on('change', () => this.stop());
  }

  /**
   * État de la lecture : une valeur de PLAYBACK_STATES.
   * @returns {string}
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Animation — lecture de la séquence (BF9)
   */
  get state() {
    return this.#state;
  }

  /**
   * Vitesse de lecture.
   * @returns {number}
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Animation — lecture de la séquence (BF9)
   */
  get speed() {
    return this.#speed;
  }

  /**
   * Curseur de lecture : 0 sur la première image clé, n - 1 sur la dernière.
   * @returns {number}
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Animation — lecture de la séquence (BF9)
   */
  get cursor() {
    return this.#cursor;
  }

  /**
   * Lance ou reprend la lecture. Depuis l'arrêt ou la fin, elle repart de la première image clé.
   * @returns {boolean} faux s'il y a moins de deux images clés
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Animation — lecture de la séquence (BF9)
   */
  play() {
    if (this.#sequence.length < 2) {
      return false;
    }
    if (this.#state === PLAYBACK_STATES.STOPPED || this.#ended) {
      this.#prepare();
    }
    this.#animator.clear();
    this.#state = PLAYBACK_STATES.PLAYING;
    this.#lastTime = null;
    this.#notify();
    return true;
  }

  /**
   * Met la lecture en pause : la scène garde l'instant affiché.
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Animation — lecture de la séquence (BF9)
   */
  pause() {
    if (this.#state === PLAYBACK_STATES.PLAYING) {
      this.#state = PLAYBACK_STATES.PAUSED;
      this.#notify();
    }
  }

  /**
   * Recommence la lecture depuis la première image clé.
   * @returns {boolean} faux s'il y a moins de deux images clés
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Animation — lecture de la séquence (BF9)
   */
  restart() {
    if (this.#sequence.length < 2) {
      return false;
    }
    this.#prepare();
    this.#apply();
    return this.play();
  }

  /**
   * Arrête la lecture : la scène rejoint l'état du tableau tactique.
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Animation — lecture de la séquence (BF9)
   */
  stop() {
    if (this.#state === PLAYBACK_STATES.STOPPED) {
      return;
    }
    this.#state = PLAYBACK_STATES.STOPPED;
    this.#frames = null;
    this.#ended = false;
    this.#view.returnToBoard();
    this.#notify();
  }

  /**
   * Change la vitesse de lecture.
   * @param {number} speed une valeur de PLAYBACK_SPEEDS
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Animation — lecture de la séquence (BF9)
   */
  setSpeed(speed) {
    if (!PLAYBACK_SPEEDS.includes(speed)) {
      throw new RangeError(`Vitesse inconnue : ${speed}`);
    }
    if (speed !== this.#speed) {
      this.#speed = speed;
      this.#notify();
    }
  }

  /**
   * Travail d'une image (tâche de la boucle de rendu) : fait avancer le curseur du temps écoulé,
   * puis place joueurs et ballon.
   * @param {number} time instant de l'image, en millisecondes
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Animation — lecture de la séquence (BF9)
   */
  update(time) {
    if (this.#state !== PLAYBACK_STATES.PLAYING) {
      return;
    }
    if (this.#lastTime === null) {
      this.#lastTime = time;
      this.#apply();
      return;
    }
    const elapsed = time - this.#lastTime;
    this.#lastTime = time;
    if (elapsed <= 0) {
      return;
    }
    const last = this.#frames.length - 1;
    this.#cursor = Math.min(last, this.#cursor + (elapsed * this.#speed) / STEP_DURATION_MS);
    this.#apply();
    if (this.#cursor >= last) {
      this.#state = PLAYBACK_STATES.PAUSED;
      this.#ended = true;
      this.#notify();
    }
  }

  /**
   * Prépare les tableaux de places des images clés, et revient à la première.
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Animation — lecture de la séquence (BF9)
   */
  #prepare() {
    this.#frames = this.#sequence.keyframes.map(({ players, ball }) => {
      const row = new Float64Array(this.#targets.length * 2);
      this.#targets.forEach(({ key }, index) => {
        const place = key === 'ball' ? ball : players[key];
        row[index * 2] = place.x;
        row[index * 2 + 1] = place.z;
      });
      return row;
    });
    this.#cursor = 0;
    this.#ended = false;
    this.#step = -1;
  }

  /**
   * Place chaque objet à l'instant du curseur, sans allocation.
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Animation — lecture de la séquence (BF9)
   */
  #apply() {
    const last = this.#frames.length - 1;
    const step = Math.min(Math.floor(this.#cursor), last - 1);
    const eased = easeInOutCubic(Math.min(1, this.#cursor - step));
    const from = this.#frames[step];
    const to = this.#frames[step + 1];
    // Forme a·(1 - e) + b·e : exacte aux deux bouts (e = 0 ou 1), sans erreur d'arrondi.
    const keep = 1 - eased;
    for (let index = 0; index < this.#targets.length; index += 1) {
      const position = this.#targets[index].object.position;
      const x = index * 2;
      position.x = from[x] * keep + to[x] * eased;
      position.z = from[x + 1] * keep + to[x + 1] * eased;
    }
    if (step !== this.#step) {
      this.#step = step;
      this.#notify();
    }
  }

  /**
   * Prévient les observateurs (panneau) de l'état de la lecture.
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Animation — lecture de la séquence (BF9)
   */
  #notify() {
    const steps = this.#frames ? this.#frames.length - 1 : Math.max(0, this.#sequence.length - 1);
    this.emit('statechange', {
      state: this.#state,
      ended: this.#ended,
      step: Math.max(0, this.#step) + 1,
      steps,
      speed: this.#speed,
    });
  }
}
