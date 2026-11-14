/**
 * Tests unitaires de src/pwa.js (sprint 3) : bouton d'installation, avis de nouvelle version et
 * badge hors-ligne. window, navigator et les boutons sont remplacés par des doublures fondées sur
 * EventTarget, qui existe sous Node.js comme dans le navigateur.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setUpInstallButton, watchForUpdates, watchNetworkStatus } from '../../src/pwa.js';

/**
 * Remplace une variable globale (window, navigator) pour la durée d'un test.
 * @param {string} name
 * @param {object} value
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests unitaires (src/pwa.js) — outil de vérification
 */
function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

/**
 * Doublure de window : événements, et mode d'affichage (application installée ou non).
 * @param {{standalone?: boolean}} [options]
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests unitaires (src/pwa.js) — doublure
 */
function createFakeWindow({ standalone = false } = {}) {
  const fakeWindow = new EventTarget();
  fakeWindow.matchMedia = (query) => ({ matches: standalone && query === '(display-mode: standalone)' });
  return fakeWindow;
}

/**
 * Doublure de bouton : événements et attribut hidden.
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests unitaires (src/pwa.js) — doublure
 */
function createFakeButton() {
  const button = new EventTarget();
  button.hidden = true;
  return button;
}

/**
 * Événement beforeinstallprompt, avec l'invite d'installation du navigateur.
 * @param {'accepted'|'dismissed'} outcome choix de l'utilisateur
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests unitaires (src/pwa.js) — doublure
 */
function createInstallPrompt(outcome = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompts = 0;
  event.prompt = async () => { event.prompts += 1; };
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

beforeEach(() => {
  setGlobal('window', createFakeWindow());
  setGlobal('navigator', { onLine: true });
});

test('installation : le bouton apparaît avec l\'invite du navigateur, qui ne sert qu\'une fois', async () => {
  const button = createFakeButton();
  setUpInstallButton(button);

  const prompt = createInstallPrompt();
  window.dispatchEvent(prompt);
  assert.equal(prompt.defaultPrevented, true, 'la bannière du navigateur est remplacée par notre bouton');
  assert.equal(button.hidden, false);

  button.dispatchEvent(new Event('click'));
  button.dispatchEvent(new Event('click'));
  await prompt.userChoice;

  assert.equal(prompt.prompts, 1);
  assert.equal(button.hidden, true);
});

test('installation : application déjà installée, le bouton reste masqué', () => {
  setGlobal('window', createFakeWindow({ standalone: true }));
  const button = createFakeButton();
  setUpInstallButton(button);

  window.dispatchEvent(createInstallPrompt());

  assert.equal(button.hidden, true);
});

test('installation terminée (appinstalled) : le bouton disparaît', () => {
  const button = createFakeButton();
  setUpInstallButton(button);
  window.dispatchEvent(createInstallPrompt());

  window.dispatchEvent(new Event('appinstalled'));

  assert.equal(button.hidden, true);
});

test('nouvelle version : rien à la première visite, un seul avis lors d\'une mise à jour', () => {
  // Première visite : la page n'est pas encore contrôlée ; le Service Worker en prend le contrôle.
  const firstVisit = new EventTarget();
  firstVisit.controller = null;
  setGlobal('navigator', { serviceWorker: firstVisit });
  let firstVisitNotices = 0;
  watchForUpdates(() => { firstVisitNotices += 1; });
  firstVisit.dispatchEvent(new Event('controllerchange'));
  assert.equal(firstVisitNotices, 0);

  // Visite suivante : une nouvelle version remplace l'ancienne (deux fois, un seul avis).
  const update = new EventTarget();
  update.controller = { state: 'activated' };
  setGlobal('navigator', { serviceWorker: update });
  let updateNotices = 0;
  watchForUpdates(() => { updateNotices += 1; });
  update.dispatchEvent(new Event('controllerchange'));
  update.dispatchEvent(new Event('controllerchange'));
  assert.equal(updateNotices, 1);
});

test('badge hors-ligne : affiché quand le réseau coupe, masqué quand il revient', () => {
  const badge = { hidden: false };
  watchNetworkStatus(badge);
  assert.equal(badge.hidden, true, 'en ligne au départ');

  navigator.onLine = false;
  window.dispatchEvent(new Event('offline'));
  assert.equal(badge.hidden, false);

  navigator.onLine = true;
  window.dispatchEvent(new Event('online'));
  assert.equal(badge.hidden, true);
});
