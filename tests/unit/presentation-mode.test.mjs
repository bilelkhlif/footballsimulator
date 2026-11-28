/**
 * Tests unitaires du mode présentation « vestiaire » (src/presentation-mode.mjs) : numéros agrandis
 * puis rendus à leur taille, interaction coupée puis rétablie, plein écran demandé (et son refus
 * toléré), sortie par le navigateur, aucun changement de la tactique.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_SIZE } from '../../src/config.mjs';
import { PresentationMode, PRESENTATION_LABEL_SCALE, scalePlayerLabels } from '../../src/presentation-mode.mjs';
import { createTacticalFixture } from './tactical-fixtures.mjs';

/**
 * Plein écran de test : demandé, quitté, et un état que le test peut changer.
 * @param {{refuse?: boolean}} [options]
 * @returns {{request: Function, exit: Function, isActive: Function, active: boolean, calls: string[]}}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests unitaires (mode présentation) — doublure du plein écran
 */
function createFullscreen({ refuse = false } = {}) {
  const fullscreen = {
    active: false,
    calls: [],
    request() {
      fullscreen.calls.push('request');
      if (refuse) return Promise.reject(new Error('refusé'));
      fullscreen.active = true;
      return Promise.resolve();
    },
    exit() {
      fullscreen.calls.push('exit');
      fullscreen.active = false;
    },
    isActive: () => fullscreen.active,
  };
  return fullscreen;
}

test('entrer : numéros agrandis et relevés, interaction coupée, plein écran demandé ; sortir rend tout', () => {
  const fixture = createTacticalFixture();
  const root = { dataset: {} };
  const fullscreen = createFullscreen();
  const presentation = new PresentationMode({ root, teamGroups: fixture.teamGroups, interaction: fixture.interaction, fullscreen });
  const before = JSON.stringify(fixture.board.snapshot());
  const label = fixture.teamGroups.blue.children[0].children.find((child) => child.isSprite);
  const events = [];
  presentation.on('change', ({ active }) => events.push(active));
  assert.equal(presentation.enter(), true);
  assert.equal(presentation.enter(), false, 'déjà ouverte');
  assert.equal(root.dataset.presentation, 'on');
  assert.ok(Math.abs(label.scale.x - PLAYER_SIZE.labelSize * PRESENTATION_LABEL_SCALE) < 1e-12);
  assert.ok(label.position.y > PLAYER_SIZE.height + PLAYER_SIZE.labelSize, 'au-dessus de la tête');
  assert.equal(fixture.interaction.state, 'disabled');
  assert.deepEqual(fullscreen.calls, ['request']);
  assert.equal(presentation.exit(), true);
  assert.equal(presentation.exit(), false, 'Échap passe alors à l\'action suivante');
  assert.equal(root.dataset.presentation, undefined);
  assert.ok(Math.abs(label.scale.x - PLAYER_SIZE.labelSize) < 1e-12);
  assert.notEqual(fixture.interaction.state, 'disabled');
  assert.deepEqual(fullscreen.calls, ['request', 'exit']);
  assert.deepEqual(events, [true, false]);
  assert.equal(JSON.stringify(fixture.board.snapshot()), before, 'la tactique ne change pas');
});

test('plein écran refusé : la présentation reste ouverte ; quitté par le navigateur : elle se ferme', async () => {
  const fixture = createTacticalFixture();
  const refused = new PresentationMode({ root: { dataset: {} }, teamGroups: fixture.teamGroups, interaction: fixture.interaction, fullscreen: createFullscreen({ refuse: true }) });
  refused.enter();
  await Promise.resolve();
  refused.onFullscreenChange();
  assert.equal(refused.active, true, 'sans plein écran, rien ne la ferme');
  refused.exit();
  const fullscreen = createFullscreen();
  const presentation = new PresentationMode({ root: { dataset: {} }, teamGroups: fixture.teamGroups, interaction: fixture.interaction, fullscreen });
  presentation.enter();
  presentation.onFullscreenChange();
  assert.equal(presentation.active, true, 'entrée en plein écran : la présentation continue');
  fullscreen.active = false;
  presentation.onFullscreenChange();
  assert.equal(presentation.active, false);
  assert.equal(scalePlayerLabels(fixture.teamGroups, 1), 22, 'un numéro par joueur');
});

test('interaction déjà coupée (AR avant la pose) : elle le reste à la sortie', () => {
  const fixture = createTacticalFixture();
  fixture.interaction.setEnabled(false);
  const presentation = new PresentationMode({ root: { dataset: {} }, teamGroups: fixture.teamGroups, interaction: fixture.interaction });
  presentation.enter();
  presentation.exit();
  assert.equal(fixture.interaction.state, 'disabled');
});
