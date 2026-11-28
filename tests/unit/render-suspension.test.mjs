/**
 * Tests unitaires du rendu suspendu quand l'onglet est masqué (src/render-suspension.mjs) : boucle
 * retirée puis remise, lecture de la séquence mise en pause puis reprise au même instant, rien de
 * suspendu pendant une session AR, masquages répétés sans effet de plus.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { attachRenderSuspension } from '../../src/render-suspension.mjs';
import { PLAYBACK_STATES, SequencePlayer, STEP_DURATION_MS } from '../../src/sequence-player.mjs';
import { TacticalSequence } from '../../src/tactical-sequence.mjs';
import { TacticsBoard } from '../../src/tactics-board.mjs';
import { DEFAULT_FORMATIONS } from '../../src/config.mjs';

/**
 * Document de test : visibilité modifiable et événement visibilitychange.
 * @returns {{visibilityState: string, addEventListener: Function, removeEventListener: Function, set: (state: string) => void}}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests unitaires (rendu suspendu) — doublure du document
 */
function createDocument() {
  const listeners = new Set();
  const target = {
    visibilityState: 'visible',
    addEventListener: (type, listener) => listeners.add(listener),
    removeEventListener: (type, listener) => listeners.delete(listener),
    set(state) {
      target.visibilityState = state;
      listeners.forEach((listener) => listener());
    },
  };
  return target;
}

/**
 * Moteur de rendu de test : garde la boucle installée.
 * @returns {{loop: Function|null, calls: number, xr: {isPresenting: boolean}, setAnimationLoop: Function}}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests unitaires (rendu suspendu) — doublure du moteur
 */
function createRenderer() {
  const renderer = {
    loop: null,
    calls: 0,
    xr: { isPresenting: false },
    setAnimationLoop(loop) {
      renderer.calls += 1;
      renderer.loop = loop;
    },
  };
  return renderer;
}

/**
 * Lecteur de séquence sur deux images clés, le ballon allant du centre à 20 cm.
 * @returns {SequencePlayer}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests unitaires (rendu suspendu) — montage du test
 */
function createPlayer() {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const sequence = new TacticalSequence();
  sequence.add({ players: board.snapshot().players, ball: { x: 0, z: 0 } });
  sequence.add({ players: board.snapshot().players, ball: { x: 0.2, z: 0 } });
  return new SequencePlayer({
    sequence, board, view: { returnToBoard: () => {} }, animator: { clear: () => {} }, targets: [{ object: new THREE.Object3D(), key: 'ball' }],
  });
}

test('onglet masqué : boucle retirée ; visible : la même boucle est remise', () => {
  const renderer = createRenderer();
  const document = createDocument();
  const loop = () => {};
  renderer.setAnimationLoop(loop);
  const changes = [];
  const suspension = attachRenderSuspension({ renderer, loop, target: document, onChange: (value) => changes.push(value) });
  document.set('hidden');
  assert.equal(renderer.loop, null);
  assert.equal(suspension.suspended, true);
  document.set('hidden');
  assert.equal(renderer.calls, 2, 'un second masquage ne fait rien');
  document.set('visible');
  assert.equal(renderer.loop, loop);
  assert.deepEqual(changes, [true, false]);
  suspension.detach();
  document.set('hidden');
  assert.equal(renderer.loop, loop, 'détaché : plus rien n\'est suspendu');
});

test('session AR : rien n\'est suspendu, la boucle appartient à la session WebXR', () => {
  const renderer = createRenderer();
  const document = createDocument();
  const loop = () => {};
  renderer.setAnimationLoop(loop);
  renderer.xr.isPresenting = true;
  attachRenderSuspension({ renderer, loop, target: document });
  document.set('hidden');
  assert.equal(renderer.loop, loop);
});

test('lecture en cours : mise en pause au masquage, reprise au même instant, sans saut dû au temps masqué', () => {
  const player = createPlayer();
  const document = createDocument();
  attachRenderSuspension({ renderer: createRenderer(), loop: () => {}, target: document, player });
  player.play();
  player.update(0);
  player.update(STEP_DURATION_MS / 2);
  const { cursor } = player;
  document.set('hidden');
  assert.equal(player.state, PLAYBACK_STATES.PAUSED);
  // Cinq minutes plus tard, l'onglet revient : la lecture reprend d'où elle était.
  document.set('visible');
  assert.equal(player.state, PLAYBACK_STATES.PLAYING);
  player.update(300000);
  assert.equal(player.cursor, cursor, 'première image après la reprise : pas de saut');
  player.update(300000 + 16);
  assert.ok(player.cursor > cursor && player.cursor < cursor + 0.02);
});

test('lecture déjà en pause : elle reste en pause au retour', () => {
  const player = createPlayer();
  const document = createDocument();
  attachRenderSuspension({ renderer: createRenderer(), loop: () => {}, target: document, player });
  player.play();
  player.pause();
  document.set('hidden');
  document.set('visible');
  assert.equal(player.state, PLAYBACK_STATES.PAUSED);
});
