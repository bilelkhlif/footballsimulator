/**
 * Tests unitaires de src/ar-surface.js (sprint 3) : hit test, réticule, toucher pour poser,
 * ancre, déplacement du terrain, et secours sans hit test. La session et les images WebXR sont
 * remplacées par des doublures qui suivent la spécification (WebXR Hit Test, WebXR Anchors).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SurfacePlacement, PLACEMENT_STATES } from '../../src/ar-surface.js';
import { computeSurfacePlacement, yawToQuaternion } from '../../src/ar-placement.js';

const REFERENCE_SPACE = { type: 'local-floor' };
const VIEWER_POSE = { transform: { position: { x: 0, y: 1.35, z: 0 }, orientation: { x: -0.3, y: 0, z: 0, w: 0.95 } } };
const HIT_POSE = { transform: { position: { x: 0.1, y: 0.72, z: -0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 }, matrix: 'matrice du point visé' } };

/**
 * Doublure de XRSession : espaces de référence et source de hit test.
 * @param {{features?: string[], failHitTest?: boolean}} [options]
 */
function createFakeSession({ features = ['local-floor', 'webgpu', 'hit-test', 'anchors'], failHitTest = false } = {}) {
  return {
    enabledFeatures: features,
    sources: [],
    async requestReferenceSpace(type) {
      return { type };
    },
    async requestHitTestSource({ space }) {
      if (failHitTest) throw new DOMException('hit test indisponible', 'NotSupportedError');
      const source = { space, cancelled: false, cancel() { this.cancelled = true; } };
      this.sources.push(source);
      return source;
    },
  };
}

/** Doublure de la vue AR : enregistre les appels. */
function createFakeView() {
  return {
    calls: [],
    needsPlacement: true,
    showReticle(transform) {
      this.calls.push(['showReticle', transform]);
    },
    placeInFront(transform) {
      this.calls.push(['placeInFront', transform]);
      this.needsPlacement = false;
    },
    placeAt(placement) {
      this.calls.push(['placeAt', placement]);
      this.needsPlacement = false;
    },
    followAnchor(transform) {
      this.calls.push(['followAnchor', transform]);
    },
    liftPitch() {
      this.calls.push(['liftPitch']);
      this.needsPlacement = true;
    },
  };
}

/** Doublure d'ancre WebXR. */
function createFakeAnchor() {
  return { anchorSpace: { type: 'anchor' }, deleted: false, delete() { this.deleted = true; } };
}

/**
 * Doublure de XRFrame : résultats de hit test, pose du téléphone, ancres.
 * @param {{hit?: object|null, viewer?: object|null, anchorResult?: Promise<object>, tracked?: object[], anchorPose?: object}} [options]
 */
function createFakeFrame({ hit = null, viewer = VIEWER_POSE, anchorResult, tracked = [], anchorPose = null } = {}) {
  return {
    anchorRequests: [],
    trackedAnchors: new Set(tracked),
    getHitTestResults() {
      return hit ? [{ getPose: (space) => (space === REFERENCE_SPACE ? hit : null) }] : [];
    },
    getViewerPose(space) {
      return space === REFERENCE_SPACE ? viewer : null;
    },
    createAnchor(pose, space) {
      this.anchorRequests.push({ pose, space });
      return anchorResult ?? Promise.resolve(createFakeAnchor());
    },
    getPose(space, baseSpace) {
      return space.type === 'anchor' && baseSpace === REFERENCE_SPACE ? anchorPose : null;
    },
  };
}

/**
 * Crée la pose du terrain avec ses doublures, et enregistre ses changements d'état.
 * @param {object} [sessionOptions]
 */
function createPlacement(sessionOptions) {
  const session = createFakeSession(sessionOptions);
  const view = createFakeView();
  const placement = new SurfacePlacement({
    session,
    referenceSpace: REFERENCE_SPACE,
    view,
    createRigidTransform: (position, orientation) => ({ position, orientation }),
  });
  const states = [];
  placement.on('statechange', (detail) => states.push(detail));
  return { session, view, placement, states };
}

/** Laisse s'exécuter les promesses en attente (création d'ancre). */
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('démarrage : hit test demandé depuis l\'espace « viewer », état « searching »', async () => {
  const { session, placement, states } = createPlacement();

  await placement.start();

  assert.equal(session.sources.length, 1);
  assert.deepEqual(session.sources[0].space, { type: 'viewer' });
  assert.equal(placement.state, PLACEMENT_STATES.SEARCHING);
  assert.deepEqual(states, [{ state: 'searching', anchored: false }]);
});

test('visée : réticule sur la surface détectée, masqué sans surface, et l\'état suit', async () => {
  const { view, placement, states } = createPlacement();
  await placement.start();

  placement.update(createFakeFrame({ hit: HIT_POSE }));
  assert.deepEqual(view.calls.at(-1), ['showReticle', HIT_POSE.transform]);
  assert.equal(placement.state, PLACEMENT_STATES.SURFACE);

  placement.update(createFakeFrame({ hit: null }));
  assert.deepEqual(view.calls.at(-1), ['showReticle', null]);
  assert.equal(placement.state, PLACEMENT_STATES.SEARCHING);
  assert.deepEqual(states.map((s) => s.state), ['searching', 'surface', 'searching']);
});

test('un toucher sans surface visée ne pose rien', async () => {
  const { view, placement } = createPlacement();
  await placement.start();

  assert.equal(placement.requestPlacement(), false);
  placement.update(createFakeFrame({ hit: HIT_POSE }));

  assert.equal(view.calls.some(([name]) => name === 'placeAt'), false);
  assert.equal(placement.state, PLACEMENT_STATES.SURFACE);
});

test('toucher sur la surface : terrain posé à l\'image suivante, puis ancré à sa propre pose', async () => {
  const { view, placement, states } = createPlacement();
  await placement.start();
  placement.update(createFakeFrame({ hit: HIT_POSE }));

  assert.equal(placement.requestPlacement(), true);
  const frame = createFakeFrame({ hit: HIT_POSE });
  placement.update(frame);

  const expected = computeSurfacePlacement(HIT_POSE.transform.position, VIEWER_POSE.transform.position);
  assert.deepEqual(view.calls.at(-1), ['placeAt', expected]);
  assert.equal(placement.state, PLACEMENT_STATES.PLACED);
  // L'ancre est demandée pendant l'image active, à la pose exacte du terrain, dans local-floor.
  assert.deepEqual(frame.anchorRequests, [{
    pose: { position: expected.position, orientation: yawToQuaternion(expected.rotationY) },
    space: REFERENCE_SPACE,
  }]);
  assert.equal(placement.anchored, false, 'pas encore : la création de l\'ancre est asynchrone');

  await flush();
  assert.equal(placement.anchored, true);
  assert.deepEqual(states.at(-1), { state: 'placed', anchored: true });
});

test('terrain ancré : il suit la pose de l\'ancre tant qu\'elle est suivie', async () => {
  const { view, placement } = createPlacement();
  const anchor = createFakeAnchor();
  await placement.start();
  placement.update(createFakeFrame({ hit: HIT_POSE }));
  placement.requestPlacement();
  placement.update(createFakeFrame({ hit: HIT_POSE, anchorResult: Promise.resolve(anchor) }));
  await flush();

  const anchorPose = { transform: { position: { x: 0.11, y: 0.729, z: -0.9 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } };
  placement.update(createFakeFrame({ tracked: [anchor], anchorPose }));
  assert.deepEqual(view.calls.at(-1), ['followAnchor', anchorPose.transform]);

  const callsBefore = view.calls.length;
  placement.update(createFakeFrame({ tracked: [], anchorPose })); // ancre perdue un instant
  assert.equal(view.calls.length, callsBefore, 'le terrain garde sa dernière pose');
});

test('« Déplacer le terrain » : l\'ancre est supprimée et la visée reprend', async () => {
  const { view, placement } = createPlacement();
  const anchor = createFakeAnchor();
  await placement.start();
  placement.update(createFakeFrame({ hit: HIT_POSE }));
  placement.requestPlacement();
  placement.update(createFakeFrame({ hit: HIT_POSE, anchorResult: Promise.resolve(anchor) }));
  await flush();

  placement.startOver();

  assert.equal(anchor.deleted, true);
  assert.equal(placement.anchored, false);
  assert.deepEqual(view.calls.at(-1), ['liftPitch']);
  assert.equal(placement.state, PLACEMENT_STATES.SEARCHING);
});

test('une ancre qui arrive après un déplacement du terrain est aussitôt supprimée', async () => {
  const { placement } = createPlacement();
  const lateAnchor = createFakeAnchor();
  let resolveAnchor;
  await placement.start();
  placement.update(createFakeFrame({ hit: HIT_POSE }));
  placement.requestPlacement();
  placement.update(createFakeFrame({ hit: HIT_POSE, anchorResult: new Promise((resolve) => { resolveAnchor = resolve; }) }));

  placement.startOver();
  resolveAnchor(lateAnchor);
  await flush();

  assert.equal(lateAnchor.deleted, true);
  assert.equal(placement.anchored, false);
});

test('ancres refusées par le navigateur : le terrain reste posé, sans ancre', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const { placement } = createPlacement();
  await placement.start();
  placement.update(createFakeFrame({ hit: HIT_POSE }));
  placement.requestPlacement();
  placement.update(createFakeFrame({ hit: HIT_POSE, anchorResult: Promise.reject(new DOMException('refus', 'NotSupportedError')) }));
  await flush();

  assert.equal(placement.state, PLACEMENT_STATES.PLACED);
  assert.equal(placement.anchored, false);
});

test('toucher, puis surface perdue à l\'image suivante : rien n\'est posé, la demande est oubliée', async () => {
  const { view, placement } = createPlacement();
  await placement.start();
  placement.update(createFakeFrame({ hit: HIT_POSE }));
  placement.requestPlacement();

  placement.update(createFakeFrame({ hit: null }));
  placement.update(createFakeFrame({ hit: HIT_POSE }));

  assert.equal(view.calls.some(([name]) => name === 'placeAt'), false);
  assert.equal(placement.state, PLACEMENT_STATES.SURFACE);
});

test('sans hit test accordé : terrain placé devant l\'utilisateur, une seule fois, comme au sprint 2', async () => {
  const { session, view, placement } = createPlacement({ features: ['local-floor', 'webgpu'] });

  await placement.start();
  placement.update(createFakeFrame({ viewer: null })); // suivi pas encore établi
  placement.update(createFakeFrame());
  placement.update(createFakeFrame());

  assert.equal(session.sources.length, 0);
  assert.equal(placement.state, PLACEMENT_STATES.IN_FRONT);
  assert.deepEqual(view.calls, [['placeInFront', VIEWER_POSE.transform]]);
});

test('hit test refusé par le navigateur : même secours, terrain devant l\'utilisateur', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const { placement } = createPlacement({ failHitTest: true });

  await placement.start();

  assert.equal(placement.state, PLACEMENT_STATES.IN_FRONT);
});

test('fin de session : la source de hit test est annulée et l\'ancre supprimée', async () => {
  const { session, placement } = createPlacement();
  const anchor = createFakeAnchor();
  await placement.start();
  placement.update(createFakeFrame({ hit: HIT_POSE }));
  placement.requestPlacement();
  placement.update(createFakeFrame({ hit: HIT_POSE, anchorResult: Promise.resolve(anchor) }));
  await flush();

  placement.stop();

  assert.equal(session.sources[0].cancelled, true);
  assert.equal(anchor.deleted, true);
});
