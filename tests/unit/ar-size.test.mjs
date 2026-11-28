/**
 * Tests unitaires de la taille du terrain en AR (src/ar-size.mjs) : échelles des trois tailles,
 * boutons marqués, choix gardé et relu, stockage refusé ou valeur inconnue sans conséquence.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AR_PITCH_SIZES, AR_SIZE_STORAGE_KEY, createArSizeControl, scaleForSize } from '../../src/ar-size.mjs';

/**
 * Boutons de test, avec data-ar-size, aria-pressed et clic.
 * @returns {Array<object>}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Tests unitaires (taille du terrain en AR) — doublure des boutons
 */
function createButtons() {
  return AR_PITCH_SIZES.map(({ id }) => {
    const listeners = [];
    const attributes = {};
    return {
      dataset: { arSize: id },
      setAttribute: (name, value) => { attributes[name] = value; },
      getAttribute: (name) => attributes[name],
      addEventListener: (type, listener) => listeners.push(listener),
      click: () => listeners.forEach((listener) => listener()),
    };
  });
}

test('échelles : 60 cm, 1 m et 2 m rapportés à la maquette de 60 cm ; taille inconnue refusée', () => {
  assert.equal(scaleForSize('table'), 1);
  assert.ok(Math.abs(scaleForSize('large') - 1 / 0.6) < 1e-12);
  assert.ok(Math.abs(scaleForSize('floor') - 2 / 0.6) < 1e-12);
  assert.throws(() => scaleForSize('stade'), RangeError);
});

test('réglage : table au départ, clic appliqué, marqué, gardé, puis relu au lancement suivant', () => {
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const scales = [];
  const changes = [];
  const buttons = createButtons();
  const control = createArSizeControl({ buttons, arView: { setScale: (scale) => scales.push(scale) }, storage, onChange: (size) => changes.push(size.id) });
  assert.equal(control.current, 'table');
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'true');
  assert.deepEqual(changes, [], 'rien d\'annoncé au lancement');
  buttons[2].click();
  assert.equal(control.current, 'floor');
  assert.deepEqual(buttons.map((button) => button.getAttribute('aria-pressed')), ['false', 'false', 'true']);
  assert.equal(store.get(AR_SIZE_STORAGE_KEY), 'floor');
  assert.deepEqual(changes, ['floor']);
  const next = createArSizeControl({ buttons: createButtons(), arView: { setScale: (scale) => scales.push(scale) }, storage });
  assert.equal(next.current, 'floor');
  assert.ok(Math.abs(scales.at(-1) - 2 / 0.6) < 1e-12);
});

test('stockage refusé ou valeur inconnue : terrain de table, sans erreur', () => {
  const broken = { getItem: () => { throw new Error('refusé'); }, setItem: () => { throw new Error('refusé'); } };
  const control = createArSizeControl({ buttons: createButtons(), arView: { setScale: () => {} }, storage: broken });
  assert.equal(control.current, 'table');
  control.select('large');
  assert.equal(control.current, 'large');
  const unknown = createArSizeControl({ buttons: [], arView: { setScale: () => {} }, storage: { getItem: () => 'stade', setItem: () => {} } });
  assert.equal(unknown.current, 'table');
});
