/**
 * Tests unitaires de src/webgl-test-mode.js : le mode test WebGL ne démarre qu'avec ?webgl dans
 * l'adresse, et ce n'est pas un repli : son moteur n'a, lui non plus, aucune fonction de repli.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWebGlTestRenderer, getRequestedRenderMode, RENDER_MODES, WebGlTestModeUnavailableError,
} from '../../src/webgl-test-mode.js';

/** Canvas minimal, pour que three.js puisse construire un moteur de rendu sous Node.js. */
function createFakeCanvas() {
  return { style: {}, width: 300, height: 150, getContext: () => null, addEventListener() {}, removeEventListener() {}, setAttribute() {} };
}
globalThis.document ??= { createElementNS: createFakeCanvas, createElement: createFakeCanvas };
globalThis.self ??= globalThis;

test('le rendu est WebGPU, sauf ?webgl dans l\'adresse', () => {
  assert.equal(getRequestedRenderMode(''), RENDER_MODES.WEBGPU);
  assert.equal(getRequestedRenderMode('?debug'), RENDER_MODES.WEBGPU);
  assert.equal(getRequestedRenderMode('?webglx'), RENDER_MODES.WEBGPU, 'seul le paramètre exact compte');
  assert.equal(getRequestedRenderMode('?webgl'), RENDER_MODES.WEBGL_TEST);
  assert.equal(getRequestedRenderMode('?iwer&debug&webgl'), RENDER_MODES.WEBGL_TEST);
});

test('par défaut (sans adresse, comme sous Node.js), le mode est WebGPU', () => {
  assert.equal(getRequestedRenderMode(), RENDER_MODES.WEBGPU);
});

test('sans WebGL 2, le mode test échoue avec une erreur claire, sans autre repli', async () => {
  // Le canvas de Node.js ne fournit aucun contexte : comme un navigateur sans WebGL 2.
  await assert.rejects(createWebGlTestRenderer({ xrEnabled: true }), (error) => {
    assert.ok(error instanceof WebGlTestModeUnavailableError);
    return true;
  });
});
