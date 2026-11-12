/**
 * Tests unitaires de src/render-loop.js : contrôles d'orbite hors AR seulement, et placement
 * du terrain au premier rendu de la session où la pose du téléphone est connue.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderLoop } from '../../src/render-loop.js';

/**
 * Doublures du moteur de rendu, des contrôles et de la vue AR.
 * @param {{presenting: boolean}} options
 */
function createLoop({ presenting }) {
  const referenceSpace = { type: 'local-floor' };
  const counts = { updates: 0, renders: 0 };
  const placements = [];
  const renderer = {
    xr: { isPresenting: presenting, getReferenceSpace: () => referenceSpace },
    render: () => { counts.renders += 1; },
  };
  const controls = { update: () => { counts.updates += 1; } };
  const arView = {
    needsPlacement: presenting,
    placeInFront(transform) {
      placements.push(transform);
      this.needsPlacement = false;
    },
  };
  const loop = createRenderLoop({ renderer, scene: {}, camera: {}, controls, arView });
  return { loop, counts, placements, referenceSpace };
}

/**
 * Doublure d'XRFrame dont getViewerPose renvoie la pose donnée.
 * @param {object|null} pose
 */
function createFrame(pose) {
  const requestedSpaces = [];
  return {
    requestedSpaces,
    getViewerPose(space) {
      requestedSpaces.push(space);
      return pose;
    },
  };
}

test('hors AR : les contrôles d\'orbite sont mis à jour à chaque image', () => {
  const { loop, counts } = createLoop({ presenting: false });

  loop(0);
  loop(16);

  assert.deepEqual(counts, { updates: 2, renders: 2 });
});

test('en AR : les contrôles d\'orbite ne touchent plus à la caméra, le rendu continue', () => {
  const { loop, counts } = createLoop({ presenting: true });
  const frame = createFrame({ transform: { id: 'pose' } });

  loop(0, frame);
  loop(16, frame);
  loop(33, frame);

  assert.deepEqual(counts, { updates: 0, renders: 3 });
});

test('en AR : le terrain est placé une seule fois, d\'après la pose dans l\'espace local-floor', () => {
  const { loop, placements, referenceSpace } = createLoop({ presenting: true });
  const transform = { position: { x: 0, y: 1.6, z: 0 } };
  const frame = createFrame({ transform });

  loop(0, frame);
  loop(16, frame);

  assert.deepEqual(placements, [transform]);
  assert.deepEqual(frame.requestedSpaces, [referenceSpace]);
});

test('en AR, tant que le suivi n\'a pas de pose : pas de placement, mais le rendu continue', () => {
  const { loop, counts, placements } = createLoop({ presenting: true });

  loop(0, createFrame(null));

  assert.deepEqual(placements, []);
  assert.equal(counts.renders, 1);
});
