/**
 * Thème clair, sombre et automatique ; galerie des démonstrations et masquage d'une calibration rejetée.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyTheme, createThemeControl, readThemePreference, resolveTheme, THEME_COLORS, THEME_STORAGE_KEY,
  writeThemePreference,
} from '../../src/theme.mjs';
import { describeQuality, formatDuration, maskUncalibrated } from '../../src/visualizer/demo-gallery.mjs';
import { galleryFields } from '../../src/visualizer/static-source.mjs';

/**
 * Stockage en mémoire ; « broken » simule un navigateur qui refuse le stockage.
 * @param {boolean} [broken]
 * @returns {Storage}
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Tests unitaires — thème
 */
function memoryStorage(broken = false) {
  const values = new Map();
  const guard = () => { if (broken) throw new DOMException('refusé', 'SecurityError'); };
  return {
    getItem: (key) => { guard(); return values.get(key) ?? null; },
    setItem: (key, value) => { guard(); values.set(key, String(value)); },
    removeItem: (key) => { guard(); values.delete(key); },
  };
}

/**
 * Requête média factice, avec abonnement aux changements du système.
 * @param {boolean} light
 * @returns {{matchMedia: Function, flip: () => void}}
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Tests unitaires — thème
 */
function systemTheme(light) {
  const listeners = new Set();
  const query = {
    get matches() { return light; },
    addEventListener: (type, listener) => listeners.add(listener),
    removeEventListener: (type, listener) => listeners.delete(listener),
  };
  return { matchMedia: () => query, flip: () => { light = !light; listeners.forEach((listener) => listener()); } };
}

/**
 * Bouton minimal : attributs, dataset et clic.
 * @param {string} choice
 * @returns {object}
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Tests unitaires — thème
 */
function button(choice) {
  const attributes = new Map();
  const handlers = [];
  return {
    dataset: { themeChoice: choice },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: (name) => attributes.get(name),
    addEventListener: (type, handler) => handlers.push(handler),
    removeEventListener: () => {},
    click: () => handlers.forEach((handler) => handler()),
  };
}

test('la préférence de thème survit au stockage refusé et ignore les valeurs inconnues', () => {
  const storage = memoryStorage();
  assert.equal(readThemePreference(storage), 'auto');
  assert.equal(writeThemePreference(storage, 'light'), true);
  assert.equal(readThemePreference(storage), 'light');
  storage.setItem(THEME_STORAGE_KEY, 'violet');
  assert.equal(readThemePreference(storage), 'auto');
  assert.equal(writeThemePreference(storage, 'auto'), true);
  assert.equal(storage.getItem(THEME_STORAGE_KEY), null, 'auto efface la préférence');
  const broken = memoryStorage(true);
  assert.equal(readThemePreference(broken), 'auto');
  assert.equal(writeThemePreference(broken, 'dark'), false);
  assert.equal(readThemePreference(null), 'auto');
});

test('le mode automatique suit le système ; un choix explicite pose data-theme et la couleur du navigateur', () => {
  assert.equal(resolveTheme('auto', systemTheme(true).matchMedia), 'light');
  assert.equal(resolveTheme('auto', systemTheme(false).matchMedia), 'dark');
  assert.equal(resolveTheme('dark', systemTheme(true).matchMedia), 'dark');
  assert.equal(resolveTheme('auto', undefined), 'dark');
  const root = { dataset: {} };
  const meta = { content: '', setAttribute(name, value) { this[name] = value; } };
  assert.equal(applyTheme(root, 'light', { meta }), 'light');
  assert.equal(root.dataset.theme, 'light');
  assert.equal(meta.content, THEME_COLORS.light.browser);
  applyTheme(root, 'auto', { meta, matchMedia: systemTheme(false).matchMedia });
  assert.equal('theme' in root.dataset, false, 'auto laisse les feuilles de style suivre le système');
  assert.equal(meta.content, THEME_COLORS.dark.browser);
});

test('les réglages du thème mettent à jour les boutons, le stockage et le fond 3D, et suivent le système', () => {
  const root = { dataset: {} };
  const storage = memoryStorage();
  const system = systemTheme(false);
  const buttons = ['auto', 'light', 'dark'].map(button);
  const changes = [];
  const status = { textContent: '' };
  const control = createThemeControl({ root, buttons, storage, matchMedia: system.matchMedia, status,
    onChange: (resolved, choice) => changes.push([resolved, choice]) });
  assert.deepEqual(changes.at(-1), ['dark', 'auto']);
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'true');
  buttons[1].click();
  assert.deepEqual(changes.at(-1), ['light', 'light']);
  assert.equal(root.dataset.theme, 'light');
  assert.equal(storage.getItem(THEME_STORAGE_KEY), 'light');
  assert.equal(buttons[1].getAttribute('aria-pressed'), 'true');
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'false');
  assert.match(status.textContent, /clair/);
  const before = changes.length;
  system.flip();
  assert.equal(changes.length, before, 'un choix explicite ignore le système');
  buttons[0].click();
  system.flip();
  assert.deepEqual(changes.at(-1), ['dark', 'auto'], 'en automatique, le changement du système est suivi');
  control.select('rose');
  assert.equal(control.choice(), 'auto');
  control.dispose();
});

test('les cartes de la galerie lisent seulement des champs bien typés et des fichiers de la démonstration', () => {
  const root = new URL('https://exemple.test/footballsimulator/demo/');
  const inside = (file) => {
    const url = new URL(file, root);
    if (!url.href.startsWith(root.href) || file.includes('..')) throw new Error('hors démo');
    return url;
  };
  const fields = galleryFields({
    category: 'Vue large', credit: 'Auteur · CC BY-SA 4.0', order: 0, thumbnail: 'matches/a/thumbnail.jpg',
    calibrationCheck: { verdict: 'rejected', note: 'ligne de but prise pour la ligne médiane' },
    quality: { calibratedShare: 0.95, implausibleSpeedShare: 0.11, cuts: 1, injected: 'texte', negative: -1, empty: null },
  }, inside);
  assert.equal(fields.thumbnailUrl, 'https://exemple.test/footballsimulator/demo/matches/a/thumbnail.jpg');
  assert.deepEqual(fields.quality, { calibratedShare: 0.95, implausibleSpeedShare: 0.11, cuts: 1, empty: null });
  assert.deepEqual(fields.calibrationCheck, { verdict: 'rejected', note: 'ligne de but prise pour la ligne médiane' });
  const hostile = galleryFields({ thumbnail: '../../secret.jpg', order: -2, category: '  ', calibrationCheck: { verdict: 'parfait' } }, inside);
  assert.deepEqual(hostile, { category: null, credit: null, order: null, thumbnailUrl: null, calibrationCheck: null, quality: null });
});

test('les indicateurs de qualité ont un ton qui dit la fiabilité, et une calibration rejetée reste signalée', () => {
  const chips = describeQuality({ calibratedShare: 1, implausibleSpeedShare: 0.05, medianTrackSeconds: 2.07, cuts: 0 });
  assert.deepEqual(chips.map((chip) => [chip.key, chip.value, chip.tone]), [
    ['calibration', '100 %', 'good'], ['implausible', '5 %', 'good'], ['continuity', '2,1 s', 'warn'], ['cuts', '0', 'neutral'],
  ]);
  const rejected = describeQuality({ calibratedShare: 0.95, implausibleSpeedShare: 0.31 }, { verdict: 'rejected' });
  assert.deepEqual(rejected.map((chip) => chip.tone), ['bad', 'bad']);
  assert.deepEqual(describeQuality(null), []);
  assert.equal(formatDuration(26.04), '26 s');
  assert.equal(formatDuration(65), '1 min 05 s');
  assert.equal(formatDuration(null), '—');
});

test('le masquage retire la calibration de la copie transmise au terrain 3D sans toucher aux données', () => {
  const frame = { time: 1.2, calibration: { status: 'ok', homography: [1, 0, 0, 0, 1, 0, 0, 0, 1] } };
  const sample = { frame, objects: [{ id: 3, pitch: [1, 2] }], ball: null };
  const masked = maskUncalibrated(sample);
  assert.equal(masked.frame.calibration.status, 'failed');
  assert.equal(masked.frame.calibration.reason, 'calibration-rejected');
  assert.equal(sample.frame.calibration.status, 'ok', 'les données d\'origine restent intactes');
  assert.equal(masked.objects, sample.objects);
  assert.equal(maskUncalibrated({ frame: null, objects: [], ball: null }).frame, null);
});

test('les deux pages posent le thème mémorisé avant le premier affichage, avec la même clé', () => {
  for (const page of ['index.html', 'visualizer.html']) {
    const html = readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    assert.ok(head.includes(`localStorage.getItem('${THEME_STORAGE_KEY}')`), page);
    assert.ok(head.indexOf('localStorage.getItem') < head.indexOf('rel="stylesheet"'), `${page} : avant la feuille de style`);
    assert.match(head, /<meta name="color-scheme" content="dark light">/);
  }
});

test('les feuilles de style définissent les jetons des deux thèmes et respectent la réduction des animations', () => {
  for (const file of ['src/styles.css', 'src/visualizer/visualizer.css']) {
    const css = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.match(css, /@media \(prefers-color-scheme: light\)/, file);
    assert.match(css, /:root\[data-theme="light"\]/, file);
    assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/, file);
    const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    assert.match(reduced, /animation: none !important/, file);
    assert.match(reduced, /transition: none !important/, file);
  }
});
