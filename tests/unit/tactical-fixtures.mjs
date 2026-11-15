/**
 * Montage commun aux tests unitaires du sprint 5 : un vrai terrain tactique three.js (joueurs de
 * la fabrique, avec leurs zones de sélection, et ballon), son tableau, son historique, sa vue et
 * son interaction, avec une horloge manuelle pour les animations.
 *
 * PlayerFactory dessine les numéros sur un canvas : sous Node.js, un document minimal le remplace.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';
import { PlayerFactory } from '../../src/players.js';
import { createTeam } from '../../src/team.js';
import { createBall } from '../../src/ball.js';
import { DEFAULT_FORMATIONS, TEAMS } from '../../src/config.js';
import { TacticsBoard } from '../../src/tactics-board.js';
import { CommandHistory } from '../../src/commands.js';
import { FormationAnimator, TRANSITION_DURATION_MS } from '../../src/formation-transition.js';
import { MOVE_DURATION_MS, TacticalView } from '../../src/tactical-view.js';
import { TacticalInteraction } from '../../src/tactical-interaction.js';

/**
 * Remplace document par un canvas 2D minimal le temps d'un test.
 * @returns {() => void} rétablit le document d'origine
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (sprint 5) — doublure
 */
export function installFakeDocument() {
  const previous = globalThis.document;
  // Contexte 2D : toute méthode de dessin existe et ne fait rien.
  const context2d = new Proxy({}, {
    get: (target, name) => (name in target ? target[name] : () => {}),
    set: (target, name, value) => {
      target[name] = value;
      return true;
    },
  });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context2d }) };
  return () => {
    if (previous === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previous;
    }
  };
}

/**
 * Horloge manuelle, pour faire avancer les animations sans attendre.
 * @returns {{now: () => number, advance: (ms: number) => void}}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (sprint 5) — doublure
 */
export function createClock() {
  let now = 0;
  return { now: () => now, advance: (ms) => { now += ms; } };
}

/**
 * Crée le terrain tactique complet du sprint 5, dans un pitchGroup éventuellement déplacé et tourné
 * comme par une ancre AR.
 * @param {object} [options]
 * @param {{x: number, y: number, z: number}} [options.position] position de pitchGroup
 * @param {THREE.Euler} [options.rotation] orientation de pitchGroup
 * @returns {object} tableau, historique, scène, vue, interaction, animateur et horloge
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (sprint 5) — montage du test
 */
export function createTacticalFixture({ position = null, rotation = null } = {}) {
  const restoreDocument = installFakeDocument();
  try {
    const clock = createClock();
    const board = new TacticsBoard(DEFAULT_FORMATIONS);
    const history = new CommandHistory();
    const animator = new FormationAnimator({ now: clock.now });
    const scene = new THREE.Scene();
    const pitchGroup = new THREE.Group();
    scene.add(pitchGroup);
    if (position) {
      pitchGroup.position.set(position.x, position.y, position.z);
    }
    if (rotation) {
      pitchGroup.rotation.copy(rotation);
    }
    const factory = new PlayerFactory();
    const teamGroups = {};
    for (const team of Object.values(TEAMS)) {
      teamGroups[team.id] = createTeam(team, board.getFormation(team.id), factory);
      pitchGroup.add(teamGroups[team.id]);
    }
    const ball = createBall();
    pitchGroup.add(ball);
    const view = new TacticalView({
      board, pitchGroup, teamGroups, teams: TEAMS, ball, animator,
      moveDuration: MOVE_DURATION_MS, formationDuration: TRANSITION_DURATION_MS,
    });
    const interaction = new TacticalInteraction({ board, history, pitchGroup, getHitboxes: () => view.hitboxes });
    view.bindInteraction(interaction);
    scene.updateMatrixWorld(true);
    return { board, history, animator, clock, scene, pitchGroup, teamGroups, ball, view, interaction };
  } finally {
    restoreDocument();
  }
}

/**
 * Joueur three.js d'une équipe, par son numéro.
 * @param {{teamGroups: Record<string, THREE.Group>}} fixture
 * @param {string} teamId
 * @param {number} number
 * @returns {THREE.Object3D}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (sprint 5) — outil de vérification
 */
export function playerObject(fixture, teamId, number) {
  return fixture.teamGroups[teamId].children.find((player) => player.userData.number === number);
}

/**
 * Oriente un rayon depuis un point de vue vers un point monde.
 * @param {THREE.Raycaster} raycaster
 * @param {THREE.Vector3} from origine
 * @param {THREE.Vector3} to point visé
 * @returns {THREE.Raycaster}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (sprint 5) — outil de vérification
 */
export function aimRay(raycaster, from, to) {
  raycaster.ray.origin.copy(from);
  raycaster.ray.direction.copy(to).sub(from).normalize();
  return raycaster;
}

/**
 * Point monde d'un point du terrain (repère de pitchGroup), à une hauteur donnée.
 * @param {THREE.Object3D} pitchGroup
 * @param {number} x
 * @param {number} z
 * @param {number} [y]
 * @returns {THREE.Vector3}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (sprint 5) — outil de vérification
 */
export function pitchPointToWorld(pitchGroup, x, z, y = 0) {
  pitchGroup.updateMatrixWorld(true);
  return pitchGroup.localToWorld(new THREE.Vector3(x, y, z));
}
