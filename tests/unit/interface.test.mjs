/**
 * Tests unitaires de l'interface ajoutée après l'évaluation : raccourcis clavier
 * (src/keyboard-shortcuts.mjs), aide au premier lancement (src/onboarding.mjs) et confirmation de
 * « Réinitialiser » (src/tactical-toolbar.mjs), avec des doublures du DOM.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachKeyboardShortcuts, resolveShortcut } from '../../src/keyboard-shortcuts.mjs';
import { createOnboarding, hasSeenOnboarding, ONBOARDING_STORAGE_KEY } from '../../src/onboarding.mjs';
import { createTacticalToolbar, RESET_CONFIRM_DELAY_MS, RESET_CONFIRM_WINDOW_MS } from '../../src/tactical-toolbar.mjs';
import { createTacticalFixture } from './tactical-fixtures.mjs';
import { MovePlayerCommand } from '../../src/commands.mjs';

/**
 * Doublure d'un élément du DOM : écoute des clics, attributs, jeu de données, focus.
 * @param {object} [fields] propriétés de départ
 * @returns {EventTarget & Record<string, any>}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests unitaires (interface) — doublure
 */
function fakeElement(fields = {}) {
  const element = new EventTarget();
  const attributes = new Map();
  Object.assign(element, {
    hidden: false,
    disabled: false,
    title: '',
    textContent: '',
    dataset: {},
    focused: false,
    children: {},
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: (name) => attributes.get(name) ?? null,
    removeAttribute: (name) => attributes.delete(name),
    focus() {
      this.focused = true;
    },
    click() {
      this.dispatchEvent(new Event('click'));
    },
    querySelector(selector) {
      return this.children[selector] ?? null;
    },
    querySelectorAll(selector) {
      return this.children[selector] ?? [];
    },
  }, fields);
  return element;
}

/**
 * Stockage local de test, éventuellement refusé comme en navigation privée.
 * @param {{refuse?: boolean}} [options]
 * @returns {Storage}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests unitaires (interface) — doublure
 */
function fakeStorage({ refuse = false } = {}) {
  const values = new Map();
  return {
    getItem: (key) => {
      if (refuse) throw new Error('SecurityError');
      return values.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (refuse) throw new Error('SecurityError');
      values.set(key, value);
    },
  };
}

test('raccourcis : D, P, C choisissent l\'outil ; Échap abandonne ; Ctrl+Z annule ; Ctrl+Y et Ctrl+Maj+Z rétablissent', () => {
  assert.deepEqual(resolveShortcut({ key: 'p' }), { type: 'mode', mode: 'pass' });
  assert.deepEqual(resolveShortcut({ key: 'C' }), { type: 'mode', mode: 'run' });
  assert.deepEqual(resolveShortcut({ key: 'd' }), { type: 'mode', mode: 'move' });
  assert.deepEqual(resolveShortcut({ key: 'Escape' }), { type: 'cancel' });
  assert.deepEqual(resolveShortcut({ key: 'z', ctrlKey: true }), { type: 'undo' });
  assert.deepEqual(resolveShortcut({ key: 'z', metaKey: true }), { type: 'undo' }, 'Cmd+Z sur Mac');
  assert.deepEqual(resolveShortcut({ key: 'y', ctrlKey: true }), { type: 'redo' });
  assert.deepEqual(resolveShortcut({ key: 'Z', ctrlKey: true, shiftKey: true }), { type: 'redo' });
});

test('raccourcis ignorés : saisie de texte, touche déjà traitée, appui long, autres combinaisons', () => {
  assert.equal(resolveShortcut({ key: 'p', target: { tagName: 'INPUT' } }), null);
  assert.equal(resolveShortcut({ key: 'p', target: { isContentEditable: true } }), null);
  assert.equal(resolveShortcut({ key: 'p', defaultPrevented: true }), null);
  assert.equal(resolveShortcut({ key: 'z', ctrlKey: true, repeat: true }), null, 'pas d\'annulations en rafale');
  assert.equal(resolveShortcut({ key: 'p', ctrlKey: true }), null, 'Ctrl+P reste au navigateur (impression)');
  assert.equal(resolveShortcut({ key: 'c', altKey: true }), null);
  assert.equal(resolveShortcut({ key: 'q' }), null);
});

test('raccourcis branchés : chaque touche déclenche son action ; Échap sans rien à abandonner reste au navigateur', () => {
  const target = new EventTarget();
  const calls = [];
  let cancellable = true;
  const stop = attachKeyboardShortcuts({
    target,
    actions: {
      mode: (mode) => calls.push(`mode:${mode}`),
      undo: () => calls.push('undo'),
      redo: () => calls.push('redo'),
      cancel: () => {
        calls.push('cancel');
        return cancellable;
      },
    },
  });
  /** Appui de touche de test, dont on lit ensuite preventDefault. */
  const press = (init) => {
    const event = new Event('keydown', { cancelable: true });
    Object.assign(event, { key: init.key, ctrlKey: Boolean(init.ctrlKey), shiftKey: false, altKey: false, metaKey: false, repeat: false });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  assert.equal(press({ key: 'p' }), true);
  assert.equal(press({ key: 'z', ctrlKey: true }), true);
  assert.equal(press({ key: 'Escape' }), true);
  cancellable = false;
  assert.equal(press({ key: 'Escape' }), false);
  stop();
  press({ key: 'c' });
  assert.deepEqual(calls, ['mode:pass', 'undo', 'cancel', 'cancel']);
});

test('aide au premier lancement : ouverte à la première visite, retenue une fois fermée, rouverte par « ? »', () => {
  const storage = fakeStorage();
  const parts = () => ({ card: fakeElement({ hidden: true }), closeButton: fakeElement(), toggleButton: fakeElement() });
  const first = parts();
  const onboarding = createOnboarding({ ...first, storage });
  assert.equal(onboarding.isOpen, true);
  assert.equal(first.toggleButton.getAttribute('aria-expanded'), 'true');
  first.closeButton.click();
  assert.equal(onboarding.isOpen, false);
  assert.equal(first.toggleButton.focused, true, 'le focus revient au bouton « ? »');
  assert.equal(hasSeenOnboarding(storage), true);

  const second = parts();
  const again = createOnboarding({ ...second, storage });
  assert.equal(again.isOpen, false, 'déjà vue : elle ne revient pas seule');
  second.toggleButton.click();
  assert.equal(again.isOpen, true);
  assert.equal(second.closeButton.focused, true, 'le focus va au bouton « Commencer »');
  assert.equal(ONBOARDING_STORAGE_KEY, 'football-simulator:aide-vue');
});

test('aide au premier lancement : stockage refusé, elle s\'ouvre sans erreur et se ferme quand même', () => {
  const card = fakeElement({ hidden: true });
  const onboarding = createOnboarding({ card, closeButton: fakeElement(), toggleButton: fakeElement(), storage: fakeStorage({ refuse: true }) });
  assert.equal(onboarding.isOpen, true);
  assert.doesNotThrow(() => onboarding.close());
  assert.equal(card.hidden, true);
});

/**
 * Barre d'outils reliée à un vrai tableau, avec des boutons et des minuteries de test.
 * @returns {object}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Tests unitaires (interface) — montage du test
 */
function createToolbarSetup() {
  const fixture = createTacticalFixture();
  const label = fakeElement({ textContent: 'Réinitialiser' });
  const buttons = {
    undo: fakeElement(),
    redo: fakeElement(),
    reset: fakeElement({ children: { '.tool__label': label } }),
  };
  const modes = ['move', 'pass', 'run'].map((mode) => fakeElement({ dataset: { mode } }));
  const root = {
    querySelectorAll: () => modes,
    querySelector: (selector) => buttons[selector.match(/data-action="(\w+)"/)[1]],
  };
  const clock = { time: 0, timers: [] };
  const feedback = [];
  const toolbar = createTacticalToolbar({
    root,
    interaction: fixture.interaction,
    history: fixture.history,
    board: fixture.board,
    onFeedback: ({ message }) => feedback.push(message),
    timers: {
      now: () => clock.time,
      setTimer: (callback, ms) => {
        const timer = { callback, at: clock.time + ms };
        clock.timers.push(timer);
        return timer;
      },
      clearTimer: (timer) => {
        clock.timers = clock.timers.filter((pending) => pending !== timer);
      },
    },
  });
  /** Avance l'horloge et lance les minuteries échues. */
  const advance = (ms) => {
    clock.time += ms;
    for (const timer of clock.timers.filter(({ at }) => at <= clock.time)) {
      clock.timers = clock.timers.filter((pending) => pending !== timer);
      timer.callback();
    }
  };
  return { fixture, buttons, label, toolbar, feedback, advance };
}

test('« Réinitialiser » demande une confirmation ; un double toucher involontaire ne suffit pas', () => {
  const { fixture, buttons, label, feedback, advance } = createToolbarSetup();
  fixture.history.execute(new MovePlayerCommand({ board: fixture.board, teamId: 'blue', number: 9, to: { x: 0.1, z: 0.1 } }));
  assert.equal(buttons.reset.disabled, false);

  buttons.reset.click();
  assert.equal(buttons.reset.dataset.armed, 'true');
  assert.equal(label.textContent, 'Confirmer ?');
  assert.match(feedback.at(-1), /Confirmer/);
  advance(RESET_CONFIRM_DELAY_MS / 2);
  buttons.reset.click(); // rebond du doigt : ignoré
  assert.equal(fixture.board.isInInitialState(), false, 'rien n\'est effacé par un double toucher');

  advance(RESET_CONFIRM_DELAY_MS);
  buttons.reset.click();
  assert.equal(fixture.board.isInInitialState(), true);
  assert.equal(label.textContent, 'Réinitialiser');
  assert.match(feedback.at(-1), /réinitialisé/);
  assert.equal(fixture.history.undoLabel, 'Réinitialiser le terrain', 'toujours annulable');
});

test('« Réinitialiser » armé : la confirmation expire, Échap ou un autre outil la retire', () => {
  const { fixture, buttons, label, toolbar, advance } = createToolbarSetup();
  fixture.history.execute(new MovePlayerCommand({ board: fixture.board, teamId: 'red', number: 4, to: { x: -0.1, z: 0.1 } }));
  buttons.reset.click();
  advance(RESET_CONFIRM_WINDOW_MS);
  assert.equal(buttons.reset.dataset.armed, undefined);
  assert.equal(label.textContent, 'Réinitialiser');
  buttons.reset.click();
  advance(RESET_CONFIRM_DELAY_MS);
  assert.equal(toolbar.disarmReset(), true, 'Échap');
  buttons.reset.click(); // réarme seulement
  assert.equal(fixture.board.isInInitialState(), false);
});

test('Annuler et Rétablir : action, message et bouton marqué un instant ; rien à annuler, rien ne se passe', () => {
  const { fixture, buttons, toolbar, feedback, advance } = createToolbarSetup();
  assert.equal(toolbar.undo(), false);
  fixture.history.execute(new MovePlayerCommand({ board: fixture.board, teamId: 'blue', number: 2, to: { x: -0.15, z: 0.12 } }));
  assert.equal(toolbar.undo(), true);
  assert.equal(buttons.undo.dataset.flash, 'true');
  assert.match(feedback.at(-1), /^Annulé : Déplacer le n° 2 des Bleus/);
  advance(500);
  assert.equal(buttons.undo.dataset.flash, undefined);
  assert.equal(toolbar.redo(), true);
  assert.match(feedback.at(-1), /^Rétabli/);
  assert.match(buttons.undo.title, /Ctrl\+Z/);
});
