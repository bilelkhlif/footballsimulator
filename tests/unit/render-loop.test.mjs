/**
 * Tests unitaires de src/render-loop.js : contrôles d'orbite hors AR seulement, pose du terrain
 * mise à jour à chaque image de la session, et cible de rendu XR alignée sur le nombre de vues.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderLoop, matchXrTargetToViews } from '../../src/render-loop.js';

/**
 * Doublure de la cible de rendu XR de three.js r187 : deux couches au départ, une par œil.
 * @param {number} [depth]
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests unitaires (src/render-loop.js) — doublure
 */
function createXrTarget(depth = 2) {
  return {
    width: 1080,
    height: 2340,
    depth,
    resizes: [],
    setSize(width, height, newDepth) {
      this.resizes.push([width, height, newDepth]);
      this.depth = newDepth;
    },
  };
}

/**
 * Doublures du moteur de rendu, des contrôles et de la pose du terrain.
 * @param {{presenting: boolean, viewCount?: number, target?: object|null, placement?: object|null}} options
 * @responsable Bilel Khlif
 * @date 2026-11-10
 * @role Tests unitaires (src/render-loop.js) — doublure
 */
function createLoop({ presenting, viewCount = 1, target = null, placement = null }) {
  const log = [];
  const renderer = {
    backend: { isWebGPUBackend: true },
    xr: { isPresenting: presenting, getCamera: () => ({ cameras: new Array(viewCount).fill({}) }) },
    getOutputRenderTarget: () => target,
    render: () => {
      log.push(`render(couches : ${target?.depth ?? '-'})`);
    },
  };
  const controls = { update: () => log.push('controls.update') };
  const loop = createRenderLoop({ renderer, scene: {}, camera: {}, controls, getArPlacement: () => placement });
  return { loop, log, renderer };
}

/**
 * Doublure de la pose du terrain (src/ar-surface.js) : enregistre les images reçues.
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests unitaires (src/render-loop.js) — doublure
 */
function createPlacement() {
  return {
    frames: [],
    update(frame) {
      this.frames.push(frame);
    },
  };
}

test('hors AR : les contrôles d\'orbite sont mis à jour à chaque image, puis la scène est rendue', () => {
  const { loop, log } = createLoop({ presenting: false });

  loop(0);
  loop(16);

  assert.deepEqual(log, ['controls.update', 'render(couches : -)', 'controls.update', 'render(couches : -)']);
});

test('en AR : les contrôles d\'orbite ne touchent plus à la caméra, et la pose du terrain reçoit chaque image', () => {
  const placement = createPlacement();
  const { loop, log } = createLoop({ presenting: true, target: createXrTarget(1), placement });
  const frames = [{ id: 1 }, { id: 2 }, { id: 3 }];

  frames.forEach((frame, i) => loop(i * 16, frame));

  assert.equal(log.includes('controls.update'), false);
  assert.equal(log.filter((entry) => entry.startsWith('render')).length, 3);
  assert.deepEqual(placement.frames, frames);
});

test('en AR, sans pose du terrain ou sans image WebXR : le rendu continue', () => {
  const placement = createPlacement();
  const withoutPlacement = createLoop({ presenting: true, target: createXrTarget(1), placement: null });
  withoutPlacement.loop(0, { id: 1 });
  assert.equal(withoutPlacement.log.at(-1), 'render(couches : 1)');

  const withoutFrame = createLoop({ presenting: true, target: createXrTarget(1), placement });
  withoutFrame.loop(0);
  assert.deepEqual(placement.frames, []);
  assert.equal(withoutFrame.log.at(-1), 'render(couches : 1)');
});

test('téléphone (une vue) : la cible XR à deux couches de three.js r187 passe à une couche avant le rendu', () => {
  const target = createXrTarget(2);
  const { loop, log } = createLoop({ presenting: true, viewCount: 1, target });

  loop(0, {});
  loop(16, {});

  assert.deepEqual(target.resizes, [[1080, 2340, 1]], 'un seul redimensionnement, à la première image');
  assert.deepEqual(log, ['render(couches : 1)', 'render(couches : 1)']);
});

test('alignement de la cible XR : rien à faire pour un casque (deux vues) ni hors session', () => {
  const backend = { isWebGPUBackend: true };
  const stereoTarget = createXrTarget(2);
  const stereo = { backend, getOutputRenderTarget: () => stereoTarget, xr: { getCamera: () => ({ cameras: [{}, {}] }) } };
  assert.equal(matchXrTargetToViews(stereo), false);
  assert.deepEqual(stereoTarget.resizes, []);

  const noTarget = { backend, getOutputRenderTarget: () => null, xr: { getCamera: () => ({ cameras: [{}] }) } };
  assert.equal(matchXrTargetToViews(noTarget), false);

  const monoTarget = createXrTarget(2);
  const noViewYet = { backend, getOutputRenderTarget: () => monoTarget, xr: { getCamera: () => ({ cameras: [] }) } };
  assert.equal(matchXrTargetToViews(noViewYet), false);
  assert.deepEqual(monoTarget.resizes, []);
});

test('mode test WebGL : la cible XR de three.js n\'est jamais modifiée', () => {
  const target = createXrTarget(2);
  const webgl = { backend: { isWebGLBackend: true }, getOutputRenderTarget: () => target, xr: { getCamera: () => ({ cameras: [{}] }) } };

  assert.equal(matchXrTargetToViews(webgl), false);
  assert.deepEqual(target.resizes, []);
});

test('les déplacements de joueurs avancent à chaque image, en 3D comme en AR, avant le rendu', () => {
  for (const presenting of [false, true]) {
    const log = [];
    const renderer = {
      backend: { isWebGPUBackend: true },
      xr: { isPresenting: presenting, getCamera: () => ({ cameras: [{}] }) },
      getOutputRenderTarget: () => null,
      render: () => log.push('render'),
    };
    const animator = { update: () => log.push('animator.update') };
    const loop = createRenderLoop({ renderer, scene: {}, camera: {}, controls: { update() {} }, animator, getArPlacement: () => null });

    loop(0, {});
    loop(16, {});

    assert.deepEqual(log, ['animator.update', 'render', 'animator.update', 'render'], presenting ? 'en AR' : 'hors AR');
  }
});

test('sprint 5 : les tâches de l\'image passent après les déplacements et avant le rendu, avec l\'instant et le XRFrame', () => {
  const log = [];
  const frame = { id: 'xr-frame' };
  const renderer = {
    backend: { isWebGPUBackend: true },
    xr: { isPresenting: true, getCamera: () => ({ cameras: [{}] }) },
    getOutputRenderTarget: () => createXrTarget(1),
    render: () => log.push('render'),
  };
  const animator = { update: () => log.push('animator') };
  const tasks = ['saisie AR', 'vue tactique', 'diagnostic'].map((name) => ({
    update: (time, received) => log.push(`${name}(${time}, ${received?.id ?? '-'})`),
  }));
  const loop = createRenderLoop({ renderer, scene: {}, camera: {}, controls: { update: () => {} }, animator, getArPlacement: () => null, tasks });

  loop(16, frame);

  assert.deepEqual(log, ['animator', 'saisie AR(16, xr-frame)', 'vue tactique(16, xr-frame)', 'diagnostic(16, xr-frame)', 'render']);
});

test('sprint 5 : afterRender des tâches passe juste après le rendu, quand les statistiques de l\'image sont prêtes', () => {
  const log = [];
  const renderer = {
    backend: { isWebGPUBackend: false },
    xr: { isPresenting: false },
    render: () => log.push('render'),
  };
  const tasks = [
    { update: () => log.push('vue tactique') },
    { update: () => log.push('diagnostic.update'), afterRender: (time) => log.push(`diagnostic.afterRender(${time})`) },
  ];
  const loop = createRenderLoop({ renderer, scene: {}, camera: {}, controls: { update: () => {} }, getArPlacement: () => null, tasks });
  loop(32);
  assert.deepEqual(log, ['vue tactique', 'diagnostic.update', 'render', 'diagnostic.afterRender(32)']);
});
