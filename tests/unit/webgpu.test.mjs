/**
 * Tests unitaires de src/webgpu.js (sprint 3) : rendu WebGPU sans repli WebGL.
 *
 * Node.js n'a ni WebGPU ni document : c'est justement la situation d'un navigateur sans WebGPU.
 * Un canvas minimal suffit pour construire le moteur de rendu ; son initialisation doit alors
 * échouer, sans jamais basculer sur WebGL comme le ferait WebGPURenderer de three.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebGPURenderer } from 'three/webgpu';
import {
  assertWebGpuBackend, createWebGpuRenderer, describeAdapter, hasWebGpuApi, WebGpuOnlyRenderer,
  WebGpuUnavailableError, WEBGPU_ERROR_REASONS,
} from '../../src/webgpu.js';

/** Canvas minimal, pour que three.js puisse construire un moteur de rendu sous Node.js. */
function createFakeCanvas() {
  return { style: {}, width: 300, height: 150, getContext: () => null, addEventListener() {}, removeEventListener() {}, setAttribute() {} };
}
globalThis.document ??= { createElementNS: createFakeCanvas, createElement: createFakeCanvas };
globalThis.self ??= globalThis;

test('détection de l\'API : navigator.gpu présent ou absent', () => {
  assert.equal(hasWebGpuApi({ gpu: {} }), true);
  assert.equal(hasWebGpuApi({}), false);
  assert.equal(hasWebGpuApi(undefined), false);
});

test('sans navigator.gpu : erreur « no-api », avant même de créer le moteur de rendu', async () => {
  // Sous Node.js, navigator existe mais n'a pas de gpu, comme un navigateur sans WebGPU.
  await assert.rejects(createWebGpuRenderer(), (error) => {
    assert.ok(error instanceof WebGpuUnavailableError);
    assert.equal(error.reason, WEBGPU_ERROR_REASONS.NO_API);
    return true;
  });
});

test('notre moteur de rendu n\'a que le backend WebGPU et aucune fonction de repli', () => {
  const renderer = new WebGpuOnlyRenderer({ antialias: true, alpha: true });

  assert.equal(renderer.backend.isWebGPUBackend, true);
  assert.notEqual(renderer.backend.isWebGLBackend, true);
  assert.equal(renderer._getFallback, null);
  assert.equal(renderer.isWebGPURenderer, true);
  assert.equal(renderer.library.constructor.name, 'StandardNodeLibrary', 'matériaux classiques traduits en WGSL');
});

test('à titre de comparaison, WebGPURenderer de three.js prévoit un repli WebGL', () => {
  const stock = new WebGPURenderer();
  assert.equal(typeof stock._getFallback, 'function');
});

test('WebGPU inutilisable : l\'initialisation échoue, et le moteur reste en WebGPU (pas de bascule WebGL)', async () => {
  const renderer = new WebGpuOnlyRenderer({ antialias: true, alpha: true });
  renderer.xr.enabled = true;

  await assert.rejects(renderer.init());

  assert.equal(renderer.backend.isWebGPUBackend, true);
  assert.notEqual(renderer.backend.isWebGLBackend, true);
});

test('garde-fou : un moteur de rendu qui ne tourne pas sur WebGPU est refusé', () => {
  assert.doesNotThrow(() => assertWebGpuBackend({ backend: { isWebGPUBackend: true } }));
  assert.throws(() => assertWebGpuBackend({ backend: { isWebGLBackend: true } }), (error) => {
    assert.ok(error instanceof WebGpuUnavailableError);
    assert.equal(error.reason, WEBGPU_ERROR_REASONS.WRONG_BACKEND);
    return true;
  });
  assert.throws(() => assertWebGpuBackend(null), WebGpuUnavailableError);
});

test('badge : description courte du processeur graphique', () => {
  assert.equal(describeAdapter({ vendor: 'nvidia', architecture: 'ampere' }), 'nvidia ampere');
  assert.equal(describeAdapter({ vendor: 'arm', architecture: '' }), 'arm');
  assert.equal(describeAdapter({ vendor: '', architecture: '', description: 'Mali-G57 MC2' }), 'Mali-G57 MC2');
  assert.equal(describeAdapter(undefined), 'GPU');
});
