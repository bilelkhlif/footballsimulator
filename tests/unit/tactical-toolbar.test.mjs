/**
 * Tests unitaires de src/tactical-toolbar.mjs (sprint 5) : aide de chaque état de l'interaction, et
 * bandeau d'aide qui montre un retour quelques instants avant de revenir à l'aide.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHintController, describeGuidance, FEEDBACK_DURATION_MS } from '../../src/tactical-toolbar.mjs';

/**
 * Minuterie manuelle : les rappels ne partent que sur demande.
 * @returns {{setTimer: Function, clearTimer: Function, fire: () => void, pending: () => number}}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (src/tactical-toolbar.mjs) — doublure
 */
function createManualTimers() {
  const timers = new Map();
  let next = 1;
  return {
    setTimer: (callback, ms) => {
      timers.set(next, { callback, ms });
      next += 1;
      return next - 1;
    },
    clearTimer: (id) => timers.delete(id),
    fire: () => {
      for (const [id, { callback }] of [...timers]) {
        timers.delete(id);
        callback();
      }
    },
    pending: () => timers.size,
  };
}

test('aide : ce qu\'il faut faire dans chaque état, en vue 3D et en AR', () => {
  assert.match(describeGuidance({ mode: 'move', state: 'idle' }), /Touchez un joueur.*glissez pour tourner/);
  assert.doesNotMatch(describeGuidance({ mode: 'move', state: 'idle' }, { inAr: true }), /glissez/);
  assert.equal(
    describeGuidance({ mode: 'move', state: 'selected', selection: { type: 'player', teamId: 'red', number: 9 } }),
    'Le n° 9 des Rouges sélectionné : touchez sa nouvelle place.',
  );
  assert.equal(describeGuidance({ mode: 'move', state: 'selected', selection: { type: 'ball' } }), 'Le ballon sélectionné : touchez sa nouvelle place.');
  assert.match(describeGuidance({ mode: 'pass', state: 'arrow-start' }), /^Passe : touchez le ballon ou son porteur/);
  assert.equal(describeGuidance({ mode: 'run', state: 'arrow-start' }), 'Course : touchez le joueur qui court.');
  assert.equal(
    describeGuidance({ mode: 'run', state: 'arrow-end', draft: { kind: 'run', actor: { type: 'player', teamId: 'red', number: 7 }, passer: null } }),
    'Course du n° 7 des Rouges : touchez son point d’arrivée.',
  );
  assert.equal(
    describeGuidance({ mode: 'pass', state: 'arrow-end', draft: { kind: 'pass', actor: { type: 'ball' }, passer: null } }),
    'Passe depuis le ballon : touchez un partenaire ou un espace libre.',
  );
  assert.equal(describeGuidance({ mode: 'move', state: 'disabled' }), '');
});

test('bandeau d\'aide : un retour s\'affiche 2,5 s avec sa couleur, puis l\'aide revient, mise à jour entre-temps', () => {
  const element = { textContent: 'Aide de départ', dataset: {} };
  const timers = createManualTimers();
  const hint = createHintController(element, timers);

  hint.flash('Hors du terrain : touchez une place sur le plateau.', 'invalid');
  assert.equal(element.dataset.feedback, 'invalid');
  hint.setBase('Nouvelle aide');
  assert.equal(element.textContent, 'Hors du terrain : touchez une place sur le plateau.', 'le retour reste affiché');

  timers.fire();
  assert.equal(element.textContent, 'Nouvelle aide');
  assert.equal(element.dataset.feedback, undefined);
  assert.equal(FEEDBACK_DURATION_MS, 2500);
});

test('bandeau d\'aide : un changement de contexte (pose du terrain, sortie de l\'AR) remplace le retour en cours', () => {
  const element = { textContent: '', dataset: {} };
  const timers = createManualTimers();
  const hint = createHintController(element, timers);
  hint.flash('Terrain posé.', 'success');
  hint.setBase('Visez la table : un cercle doré apparaît sur la surface détectée.', { force: true });
  assert.equal(element.textContent, 'Visez la table : un cercle doré apparaît sur la surface détectée.');
  assert.equal(timers.pending(), 0, 'le retour annulé ne reviendra pas');
});
