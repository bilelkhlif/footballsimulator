/**
 * Tests unitaires de src/events.js : le patron Observer utilisé par la session AR.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from '../../src/events.js';

test('chaque observateur abonné reçoit le détail de l\'événement, et seulement de celui-là', () => {
  const emitter = new EventEmitter();
  const received = [];
  emitter.on('sessionstart', (detail) => received.push(['premier', detail]));
  emitter.on('sessionstart', (detail) => received.push(['second', detail]));
  emitter.on('sessionend', () => received.push(['autre événement']));

  emitter.emit('sessionstart', { id: 1 });

  assert.deepEqual(received, [['premier', { id: 1 }], ['second', { id: 1 }]]);
});

test('un observateur désabonné n\'est plus prévenu', () => {
  const emitter = new EventEmitter();
  let calls = 0;
  const unsubscribe = emitter.on('sessionend', () => { calls += 1; });

  emitter.emit('sessionend');
  unsubscribe();
  emitter.emit('sessionend');

  assert.equal(calls, 1);
});

test('un observateur en erreur n\'empêche pas les suivants d\'être prévenus', (t) => {
  const consoleError = t.mock.method(console, 'error', () => {});
  const emitter = new EventEmitter();
  let secondCalled = false;
  emitter.on('sessionstart', () => { throw new Error('observateur en panne'); });
  emitter.on('sessionstart', () => { secondCalled = true; });

  emitter.emit('sessionstart');

  assert.equal(secondCalled, true);
  assert.equal(consoleError.mock.callCount(), 1);
});
