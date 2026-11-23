/**
 * Tests unitaires de src/tactical-interaction.mjs (sprint 5) : la machine à états de l'interaction,
 * avec de vrais rayons sur les vraies zones de sélection des joueurs et sur le plan du gazon, en
 * vue 3D et en AR sur un terrain déplacé et tourné par son ancre.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { aimRay, createTacticalFixture, pitchPointToWorld, playerObject } from './tactical-fixtures.mjs';
import { INTERACTION_MODES, INTERACTION_STATES } from '../../src/tactical-interaction.mjs';
import { setRayFromXrPose } from '../../src/raycasting.mjs';
import { BOARD_HALF_EXTENTS, PITCH_HALF_EXTENTS, PLAYER_MARGIN } from '../../src/tactics-board.mjs';
import { PLAYER_SIZE } from '../../src/config.mjs';

/** Hauteur du dessus de la zone de sélection d'un joueur, en mètres. */
const HITBOX_TOP = PLAYER_SIZE.height * 1.5;

/**
 * Égalité à une tolérance près.
 * @param {number} a
 * @param {number} b
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (src/tactical-interaction.mjs) — outil de vérification
 */
function near(a, b) {
  return Math.abs(a - b) <= 1e-9;
}

/**
 * Gestes de test : un point de vue au-dessus du terrain (caméra ou téléphone) d'où partent les
 * rayons, vers un joueur, le ballon ou un point du gazon.
 * @param {ReturnType<typeof createTacticalFixture>} fixture
 * @param {{xr?: boolean}} [options] vrai pour passer par une pose WebXR (targetRaySpace)
 * @returns {{tapPlayer: Function, tapBall: Function, tapPitch: Function, hoverPitch: Function}}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (src/tactical-interaction.mjs) — outil de vérification
 */
function createGestures(fixture, { xr = false } = {}) {
  const raycaster = new THREE.Raycaster();
  const eye = pitchPointToWorld(fixture.pitchGroup, 0.02, 0.03, 0.9);
  /** Oriente le rayon vers un point monde, directement ou par une pose WebXR. */
  const castTo = (world) => {
    if (!xr) {
      return aimRay(raycaster, eye, world);
    }
    const direction = world.clone().sub(eye).normalize();
    const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
    return setRayFromXrPose(raycaster, { position: eye, orientation });
  };
  return {
    tapPlayer: (teamId, number) => fixture.interaction.handleTap(
      castTo(playerObject(fixture, teamId, number).localToWorld(new THREE.Vector3(0, HITBOX_TOP, 0))),
    ),
    tapBall: () => fixture.interaction.handleTap(castTo(fixture.ball.getWorldPosition(new THREE.Vector3()))),
    tapPitch: (x, z) => fixture.interaction.handleTap(castTo(pitchPointToWorld(fixture.pitchGroup, x, z))),
    hoverPitch: (x, z) => fixture.interaction.hover(castTo(pitchPointToWorld(fixture.pitchGroup, x, z))),
  };
}

test('déplacer : toucher un joueur le sélectionne, toucher le gazon l\'y envoie par une commande annulable', () => {
  const fixture = createTacticalFixture();
  const { board, history, interaction } = fixture;
  const gestures = createGestures(fixture);
  const before = board.getPlayerPosition('blue', 9);

  assert.equal(gestures.tapPlayer('blue', 9).action, 'select');
  assert.equal(interaction.state, INTERACTION_STATES.SELECTED);
  assert.deepEqual(interaction.selection, { type: 'player', teamId: 'blue', number: 9 });

  assert.equal(gestures.tapPitch(0.05, -0.1).action, 'move');
  const after = board.getPlayerPosition('blue', 9);
  assert.ok(near(after.x, 0.05) && near(after.z, -0.1), `place (${after.x} ; ${after.z})`);
  assert.equal(interaction.state, INTERACTION_STATES.IDLE, 'la sélection se termine après le déplacement');

  history.undo();
  assert.deepEqual(board.getPlayerPosition('blue', 9), before);
});

test('les deux équipes et le ballon se déplacent indépendamment, chacun reconnu par son identité', () => {
  const fixture = createTacticalFixture();
  const { board } = fixture;
  const gestures = createGestures(fixture);
  const blueFour = board.getPlayerPosition('blue', 4);

  gestures.tapPlayer('red', 4);
  gestures.tapPitch(-0.02, 0.16);
  gestures.tapBall();
  assert.deepEqual(fixture.interaction.selection, { type: 'ball' });
  gestures.tapPitch(0.07, 0.02);

  const redFour = board.getPlayerPosition('red', 4);
  const ball = board.getBallPosition();
  assert.ok(near(redFour.x, -0.02) && near(redFour.z, 0.16));
  assert.ok(near(ball.x, 0.07) && near(ball.z, 0.02));
  assert.deepEqual(board.getPlayerPosition('blue', 4), blueFour, 'le n° 4 bleu ne bouge pas');
});

test('toucher le joueur sélectionné annule la sélection ; toucher un autre joueur la lui donne', () => {
  const fixture = createTacticalFixture();
  const gestures = createGestures(fixture);
  gestures.tapPlayer('blue', 5);
  assert.equal(gestures.tapPlayer('blue', 5).action, 'deselect');
  assert.equal(fixture.interaction.selection, null);
  gestures.tapPlayer('blue', 5);
  gestures.tapPlayer('red', 11);
  assert.deepEqual(fixture.interaction.selection, { type: 'player', teamId: 'red', number: 11 });
  assert.equal(fixture.history.canUndo, false, 'sélectionner n\'est pas une action annulable');
});

test('place hors du plateau : refusée, la sélection reste ; au bord : ramenée sur le plateau, socle compris', () => {
  const fixture = createTacticalFixture();
  const { board, history } = fixture;
  const gestures = createGestures(fixture);
  gestures.tapPlayer('blue', 2);

  const refused = gestures.tapPitch(BOARD_HALF_EXTENTS.x + 0.05, 0);
  assert.equal(refused.action, 'invalid');
  assert.match(refused.message, /Hors du terrain/);
  assert.equal(history.canUndo, false);
  assert.deepEqual(fixture.interaction.selection, { type: 'player', teamId: 'blue', number: 2 });

  gestures.tapPitch(BOARD_HALF_EXTENTS.x - 0.002, -0.05);
  const clamped = board.getPlayerPosition('blue', 2);
  assert.ok(near(clamped.x, BOARD_HALF_EXTENTS.x - PLAYER_MARGIN) && near(clamped.z, -0.05), `place (${clamped.x} ; ${clamped.z})`);
});

test('rien de sélectionné : toucher le gazon ne déplace rien et l\'explique', () => {
  const fixture = createTacticalFixture();
  const feedback = [];
  fixture.interaction.on('feedback', (detail) => feedback.push(detail));
  const result = createGestures(fixture).tapPitch(0.1, 0.1);
  assert.equal(result.action, 'none');
  assert.deepEqual(feedback, [{ kind: 'info', message: 'Touchez d’abord un joueur ou le ballon.' }]);
  assert.equal(fixture.history.canUndo, false);
});

test('passe : elle part du ballon et s\'accroche au receveur ; un joueur sans le ballon ne peut pas la commencer', () => {
  const fixture = createTacticalFixture();
  const { board, interaction, history } = fixture;
  const gestures = createGestures(fixture);
  interaction.setMode(INTERACTION_MODES.PASS);
  assert.equal(interaction.state, INTERACTION_STATES.ARROW_START);

  const refused = gestures.tapPlayer('blue', 6);
  assert.deepEqual([refused.action, refused.message], ['invalid', 'Une passe part du ballon : touchez le ballon ou son porteur.']);
  assert.equal(interaction.state, INTERACTION_STATES.ARROW_START, 'refusé : rien ne commence');

  assert.equal(gestures.tapBall().action, 'arrow-start');
  assert.deepEqual(interaction.arrowStart, board.getBallPosition(), 'départ au ballon');
  const done = gestures.tapPlayer('blue', 6);
  assert.deepEqual([done.action, done.message], ['arrow', 'Passe vers le n° 6 des Bleus tracée.']);
  const [arrow] = board.getArrows();
  assert.equal(arrow.kind, 'pass');
  assert.deepEqual(arrow.from, { x: 0, z: 0 });
  assert.deepEqual(arrow.to, board.getPlayerPosition('blue', 6), 'arrivée accrochée au receveur');
  assert.equal(interaction.state, INTERACTION_STATES.ARROW_START, 'prêt pour la flèche suivante');
  assert.equal(history.undoLabel, 'Tracer une passe');
});

test('course : elle part d\'un joueur ; gazon, trop courte ou hors des lignes : refusées, sans rien dans l\'historique', () => {
  const fixture = createTacticalFixture();
  const { board, interaction, history } = fixture;
  const gestures = createGestures(fixture);
  interaction.setMode(INTERACTION_MODES.RUN);

  assert.match(gestures.tapPitch(0, 0.15).message, /course part d’un joueur/);
  assert.match(gestures.tapBall().message, /course part d’un joueur/, 'le ballon ne court pas : c\'est une passe');
  assert.equal(interaction.state, INTERACTION_STATES.ARROW_START);

  assert.equal(gestures.tapPlayer('red', 9).action, 'arrow-start');
  const nine = board.getPlayerPosition('red', 9);
  assert.match(gestures.tapPitch(nine.x - 0.017, nine.z).message, /trop courte/);
  assert.match(gestures.tapPitch(-(PITCH_HALF_EXTENTS.x + 0.012), nine.z).message, /hors du terrain/);
  assert.equal(interaction.state, INTERACTION_STATES.ARROW_END, 'le départ reste posé après un refus');
  assert.equal(board.getArrows().length, 0);
  assert.equal(history.canUndo, false, 'aucune action refusée n\'entre dans l\'historique');

  assert.equal(gestures.tapPitch(nine.x - 0.1, nine.z + 0.05).action, 'arrow');
  assert.deepEqual(board.getArrows()[0].from, nine, 'départ au pied du joueur');
});

test('passe vers un adversaire du porteur : refusée ; ballon libre : tout receveur possible', () => {
  const fixture = createTacticalFixture();
  const { board, interaction } = fixture;
  const gestures = createGestures(fixture);
  const nine = board.getPlayerPosition('blue', 9);
  board.setBallPosition({ x: nine.x + 0.016, z: nine.z });
  interaction.setMode(INTERACTION_MODES.PASS);
  assert.match(gestures.tapPlayer('blue', 9).message, /^Passe du n° 9 des Bleus/, 'toucher le porteur part du ballon');
  assert.deepEqual(interaction.draft.passer, { type: 'player', teamId: 'blue', number: 9 });
  assert.match(gestures.tapPlayer('red', 4).message, /adversaire/);
  assert.equal(board.getArrows().length, 0);
  assert.equal(gestures.tapPlayer('blue', 8).action, 'arrow');
});

test('toucher de nouveau le départ, ou le passeur, annule le tracé ; changer d\'outil l\'abandonne et le dit', () => {
  const fixture = createTacticalFixture();
  const { interaction, history } = fixture;
  const feedback = [];
  interaction.on('feedback', ({ message }) => feedback.push(message));
  const gestures = createGestures(fixture);
  interaction.setMode(INTERACTION_MODES.PASS);
  gestures.tapBall();
  assert.equal(gestures.tapBall().action, 'cancel');
  assert.equal(interaction.state, INTERACTION_STATES.ARROW_START);

  interaction.setMode(INTERACTION_MODES.RUN);
  gestures.tapPlayer('red', 2);
  interaction.setMode(INTERACTION_MODES.MOVE);
  assert.equal(interaction.draft, null);
  assert.equal(feedback.at(-1), 'Tracé en cours abandonné.');
  assert.ok(feedback.includes('Tracé annulé.'));
  assert.equal(history.canUndo, false);
});

test('annuler ou rétablir pendant un tracé l\'abandonne : son départ a pu bouger', () => {
  const fixture = createTacticalFixture();
  const { board, interaction, history } = fixture;
  const gestures = createGestures(fixture);
  gestures.tapBall();
  gestures.tapPitch(0.06, 0.04); // le ballon bouge : action annulable
  interaction.setMode(INTERACTION_MODES.PASS);
  gestures.tapBall();
  assert.deepEqual(interaction.arrowStart, board.getBallPosition());
  history.undo(); // le ballon revient au centre
  assert.equal(interaction.state, INTERACTION_STATES.ARROW_START, 'tracé abandonné');
  assert.equal(gestures.tapPitch(0.1, 0.1).action, 'invalid', 'pas de flèche depuis l\'ancienne place du ballon');
  history.redo();
  assert.equal(board.getArrows().length, 0);
});

test('double toucher involontaire : un second toucher au même endroit, en moins de 350 ms, est ignoré', () => {
  let time = 0;
  const fixture = createTacticalFixture({ now: () => time });
  const { interaction } = fixture;
  const gestures = createGestures(fixture);
  interaction.setMode(INTERACTION_MODES.PASS);
  assert.equal(gestures.tapBall().action, 'arrow-start');
  time += 120;
  assert.deepEqual(gestures.tapBall(), { action: 'none', repeated: true }, 'le tracé n\'est pas annulé par le rebond');
  assert.equal(interaction.state, INTERACTION_STATES.ARROW_END);
  time += 400;
  assert.equal(gestures.tapBall().action, 'cancel', 'toucher volontaire, plus tard');
  time += 50;
  assert.equal(gestures.tapPitch(0.1, 0.1).action, 'invalid', 'ailleurs, même aussitôt : traité');
});

test('changer de mode abandonne la sélection ou la flèche en cours ; mode inconnu refusé', () => {
  const fixture = createTacticalFixture();
  const { interaction } = fixture;
  const gestures = createGestures(fixture);
  gestures.tapPlayer('red', 8);
  assert.equal(interaction.setMode(INTERACTION_MODES.RUN), true);
  assert.equal(interaction.selection, null);
  gestures.tapPitch(0, 0);
  interaction.setMode(INTERACTION_MODES.MOVE);
  assert.equal(interaction.arrowStart, null);
  assert.equal(interaction.setMode(INTERACTION_MODES.MOVE), false);
  assert.throws(() => interaction.setMode('dribble'), /Mode inconnu/);
});

test('interaction coupée (AR avant la pose du terrain) : les touchers sont ignorés', () => {
  const fixture = createTacticalFixture();
  fixture.interaction.setEnabled(false);
  const gestures = createGestures(fixture);
  assert.equal(fixture.interaction.state, INTERACTION_STATES.DISABLED);
  assert.equal(gestures.tapPlayer('blue', 9).action, 'none');
  assert.equal(fixture.interaction.selection, null);
});

test('aperçu : jugé comme le toucher (valide, refusé, annulation), dans le repère du terrain', () => {
  const fixture = createTacticalFixture();
  const { interaction } = fixture;
  const gestures = createGestures(fixture);
  assert.equal(interaction.wantsHover, false);
  interaction.setMode(INTERACTION_MODES.PASS);
  gestures.tapBall();
  assert.equal(interaction.wantsHover, true);
  gestures.hoverPitch(0, -0.1); // gazon libre, hors des zones de sélection
  const hover = interaction.hoverPoint;
  assert.ok(near(hover.x, 0) && hover.y === 0 && near(hover.z, -0.1), `survol (${hover.x} ; ${hover.z})`);
  assert.equal(interaction.hoverVerdict.valid, true);

  // Survol d'un joueur : l'aperçu s'accroche à sa place, et le receveur est désigné.
  const raycaster = new THREE.Raycaster();
  const eye = pitchPointToWorld(fixture.pitchGroup, 0.02, 0.03, 0.9);
  interaction.hover(aimRay(raycaster, eye, playerObject(fixture, 'red', 9).localToWorld(new THREE.Vector3(0, HITBOX_TOP, 0))));
  const { x, z } = fixture.board.getPlayerPosition('red', 9);
  assert.deepEqual([interaction.hoverPoint.x, interaction.hoverPoint.z], [x, z]);
  assert.deepEqual(interaction.hoverVerdict.receiver, { type: 'player', teamId: 'red', number: 9 }, 'ballon libre : passeur inconnu');

  // Hors des lignes : l'aperçu reste au point visé, refusé, avec la raison.
  gestures.hoverPitch(PITCH_HALF_EXTENTS.x + 0.01, 0);
  assert.equal(interaction.hoverVerdict.valid, false);
  assert.equal(interaction.hoverVerdict.reason, 'off-pitch');
  assert.ok(near(interaction.hoverPoint.x, PITCH_HALF_EXTENTS.x + 0.01));

  // Sur le départ : toucher annulerait, pas d'aperçu de flèche.
  interaction.hover(aimRay(raycaster, eye, fixture.ball.getWorldPosition(new THREE.Vector3())));
  assert.equal(interaction.hoverVerdict.cancel, true);
  assert.equal(interaction.hoverPoint, null);

  interaction.hover(null);
  assert.equal(interaction.hoverVerdict, null);
});

test('aperçu d\'un déplacement : la place visée, ramenée sur le plateau ; hors du plateau, refusée', () => {
  const fixture = createTacticalFixture();
  const { interaction } = fixture;
  const gestures = createGestures(fixture);
  gestures.tapPlayer('blue', 4);
  assert.equal(interaction.wantsHover, true);
  gestures.hoverPitch(-0.1, 0.12);
  assert.ok(near(interaction.hoverPoint.x, -0.1) && near(interaction.hoverPoint.z, 0.12));
  assert.equal(interaction.hoverVerdict.valid, true);
  gestures.hoverPitch(BOARD_HALF_EXTENTS.x + 0.03, 0);
  assert.equal(interaction.hoverVerdict.valid, false);
});

test('terrain incliné et tourné (ancre sur une surface penchée) : départ et arrivée exacts dans le repère du terrain', () => {
  const fixture = createTacticalFixture({ position: { x: 0.4, y: 0.75, z: -0.6 }, rotation: new THREE.Euler(0.12, THREE.MathUtils.degToRad(-130), -0.08) });
  const { board, interaction } = fixture;
  const gestures = createGestures(fixture, { xr: true });
  interaction.setMode(INTERACTION_MODES.RUN);
  gestures.tapPlayer('red', 7);
  gestures.tapPitch(-0.2, -0.12);
  const [run] = board.getArrows();
  assert.deepEqual(run.from, board.getPlayerPosition('red', 7));
  assert.ok(near(run.to.x, -0.2) && near(run.to.z, -0.12), `arrivée (${run.to.x} ; ${run.to.z})`);
});

test('AR : terrain déplacé et tourné par son ancre, la sélection et le déplacement par rayon WebXR sont exacts', () => {
  const fixture = createTacticalFixture({ position: { x: -0.35, y: 0.728, z: -0.82 }, rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(25), 0) });
  const gestures = createGestures(fixture, { xr: true });
  assert.equal(gestures.tapPlayer('red', 7).action, 'select');
  gestures.tapPitch(-0.08, 0.06);
  const place = fixture.board.getPlayerPosition('red', 7);
  assert.ok(near(place.x, -0.08) && near(place.z, 0.06), `place (${place.x} ; ${place.z}), dans le repère du terrain`);

  fixture.interaction.setMode(INTERACTION_MODES.PASS);
  gestures.tapBall();
  gestures.tapPitch(0.15, -0.1);
  const [arrow] = fixture.board.getArrows();
  assert.deepEqual(arrow.from, { x: 0, z: 0 }, 'départ accroché au ballon');
  assert.ok(near(arrow.to.x, 0.15) && near(arrow.to.z, -0.1));
});

test('statechange décrit l\'état pour l\'interface, à chaque changement', () => {
  const fixture = createTacticalFixture();
  const states = [];
  fixture.interaction.on('statechange', ({ mode, state }) => states.push(`${mode}:${state}`));
  const gestures = createGestures(fixture);
  gestures.tapPlayer('blue', 3);
  gestures.tapPitch(-0.1, -0.1);
  fixture.interaction.setMode(INTERACTION_MODES.RUN);
  gestures.tapPitch(0, 0); // refusé : une course part d'un joueur, l'état ne change pas
  gestures.tapPlayer('blue', 3);
  assert.deepEqual(states, ['move:selected', 'move:idle', 'run:arrow-start', 'run:arrow-end']);
});
