/**
 * Tests unitaires de src/xr-input.js (sprint 5) : destination d'un toucher en AR, rayon lu dans le
 * targetRaySpace de la source d'entrée (et non dans la pose du téléphone), aperçu guidé à chaque
 * image, et fin de session.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { routeXrSelect, SELECT_ROUTES, XrTacticalInput } from '../../src/xr-input.js';

const REFERENCE_SPACE = { type: 'local-floor' };
const TARGET_RAY_SPACE = { type: 'target-ray' };
const VIEWER_SPACE = { type: 'viewer' };

/** Rayon d'un toucher : depuis le téléphone, vers le bas et l'avant (rotation de -45° autour de X). */
const TOUCH_POSE = {
  transform: {
    position: { x: 0.1, y: 1.2, z: 0.05 },
    orientation: { x: Math.sin(-Math.PI / 8), y: 0, z: 0, w: Math.cos(-Math.PI / 8) },
  },
};

/** Pose du téléphone : regard horizontal, qu'il ne faut pas confondre avec le rayon du toucher. */
const VIEWER_POSE = { transform: { position: { x: 0, y: 1.35, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } };

/**
 * Doublure de l'interaction : enregistre les rayons reçus.
 * @param {{wantsHover?: boolean}} [options]
 * @returns {object}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (src/xr-input.js) — doublure
 */
function createFakeInteraction({ wantsHover = false } = {}) {
  return {
    wantsHover,
    taps: [],
    hovers: [],
    handleTap(raycaster) {
      this.taps.push({ origin: raycaster.ray.origin.clone(), direction: raycaster.ray.direction.clone() });
      return { action: 'select' };
    },
    hover(raycaster) {
      this.hovers.push(raycaster ? raycaster.ray.origin.clone() : null);
    },
  };
}

/**
 * Doublure de XRFrame : pose de chaque espace, dans l'espace de référence seulement.
 * @param {Map<object, object>} poses
 * @returns {object}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (src/xr-input.js) — doublure
 */
function createFakeFrame(poses) {
  return {
    requests: [],
    getPose(space, baseSpace) {
      this.requests.push(space);
      return baseSpace === REFERENCE_SPACE ? poses.get(space) ?? null : null;
    },
    getViewerPose(space) {
      return space === REFERENCE_SPACE ? VIEWER_POSE : null;
    },
  };
}

/**
 * Crée la saisie AR d'une session de test.
 * @param {object} interaction
 * @param {object[]} [inputSources]
 * @returns {XrTacticalInput}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (src/xr-input.js) — montage du test
 */
function createInput(interaction, inputSources = [{ targetRaySpace: TARGET_RAY_SPACE }]) {
  return new XrTacticalInput({
    session: { inputSources },
    referenceSpace: REFERENCE_SPACE,
    interaction,
    raycaster: new THREE.Raycaster(),
  });
}

test('destination d\'un toucher : pose du terrain avant qu\'il soit posé, interaction tactique ensuite', () => {
  assert.equal(routeXrSelect(null), SELECT_ROUTES.IGNORED);
  assert.equal(routeXrSelect({ pitchReady: false }), SELECT_ROUTES.PLACEMENT);
  assert.equal(routeXrSelect({ pitchReady: true }), SELECT_ROUTES.TACTICS);
});

test('toucher en AR : le rayon vient du targetRaySpace de la source, dans l\'espace de référence', () => {
  const interaction = createFakeInteraction();
  const input = createInput(interaction);
  const frame = createFakeFrame(new Map([[TARGET_RAY_SPACE, TOUCH_POSE], [VIEWER_SPACE, VIEWER_POSE]]));

  assert.equal(input.handleSelect({ frame, inputSource: { targetRaySpace: TARGET_RAY_SPACE } }), true);
  assert.deepEqual(frame.requests, [TARGET_RAY_SPACE]);
  const [{ origin, direction }] = interaction.taps;
  assert.deepEqual(origin.toArray(), [0.1, 1.2, 0.05]);
  assert.ok(Math.abs(direction.y + Math.SQRT1_2) < 1e-9 && Math.abs(direction.z + Math.SQRT1_2) < 1e-9, 'vers le bas et l\'avant, pas le regard horizontal');
});

test('suivi perdu au moment du toucher, ou événement incomplet : rien n\'est transmis', () => {
  const interaction = createFakeInteraction();
  const input = createInput(interaction);
  assert.equal(input.handleSelect({ frame: createFakeFrame(new Map()), inputSource: { targetRaySpace: TARGET_RAY_SPACE } }), false);
  assert.equal(input.handleSelect({ inputSource: { targetRaySpace: TARGET_RAY_SPACE } }), false);
  assert.deepEqual(interaction.taps, []);
});

test('aperçu à chaque image : aucun travail hors du tracé ; la manette qui a posé le départ le guide, pas l\'autre', () => {
  const idle = createFakeInteraction({ wantsHover: false });
  const idleFrame = createFakeFrame(new Map([[TARGET_RAY_SPACE, TOUCH_POSE]]));
  createInput(idle).update(idleFrame);
  assert.deepEqual(idleFrame.requests, [], 'pas de pose demandée sans flèche en cours');

  const otherSpace = { type: 'manette gauche' };
  const left = { targetRayMode: 'tracked-pointer', targetRaySpace: otherSpace };
  const right = { targetRayMode: 'tracked-pointer', targetRaySpace: TARGET_RAY_SPACE };
  const poses = new Map([[otherSpace, VIEWER_POSE], [TARGET_RAY_SPACE, TOUCH_POSE]]);
  const drawing = createFakeInteraction({ wantsHover: true });
  const sources = [left, right];
  const input = createInput(drawing, sources);
  input.handleSelect({ frame: createFakeFrame(poses), inputSource: right });
  input.update(createFakeFrame(poses));
  assert.deepEqual(drawing.hovers.map((origin) => origin?.toArray()), [[0.1, 1.2, 0.05]], 'la manette droite, listée en second');

  sources.splice(1, 1); // la manette du départ quitte la session (éteinte, hors champ)
  input.update(createFakeFrame(poses));
  assert.equal(drawing.hovers.at(-1), null, 'manette du départ partie : pas d\'aperçu guidé par l\'autre manette');
});

test('téléphone : le doigt du départ s\'est levé ; un nouveau doigt sur l\'écran guide l\'aperçu pendant qu\'il touche', () => {
  const sources = [];
  const drawing = createFakeInteraction({ wantsHover: true });
  const input = createInput(drawing, sources);
  const firstTouch = { targetRayMode: 'screen', targetRaySpace: TARGET_RAY_SPACE };
  input.handleSelect({ frame: createFakeFrame(new Map([[TARGET_RAY_SPACE, TOUCH_POSE]])), inputSource: firstTouch });

  input.update(createFakeFrame(new Map()));
  assert.equal(drawing.hovers.at(-1), null, 'aucun doigt sur l\'écran');

  const secondSpace = { type: 'second toucher' };
  sources.push({ targetRayMode: 'screen', targetRaySpace: secondSpace });
  input.update(createFakeFrame(new Map([[secondSpace, VIEWER_POSE]])));
  assert.deepEqual(drawing.hovers.at(-1).toArray(), [0, 1.35, 0]);
});

test('fin de session : la saisie se tait, l\'aperçu disparaît, les touchers suivants sont ignorés', () => {
  const interaction = createFakeInteraction({ wantsHover: true });
  const input = createInput(interaction);
  input.stop();
  assert.equal(input.active, false);
  assert.deepEqual(interaction.hovers, [null]);
  const frame = createFakeFrame(new Map([[TARGET_RAY_SPACE, TOUCH_POSE]]));
  assert.equal(input.handleSelect({ frame, inputSource: { targetRaySpace: TARGET_RAY_SPACE } }), false);
  input.update(frame);
  assert.deepEqual(frame.requests, []);
  assert.deepEqual(interaction.taps, []);
});
