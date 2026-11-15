/**
 * Tests unitaires de src/diagnostics.js (sprint 5) : images par seconde et durée moyenne d'une image
 * sur une fenêtre fixe, reprise après un trou, panneau réécrit deux fois par seconde au plus, et
 * mode désactivé par défaut.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DiagnosticsPanel, FrameStats, isDiagnosticsRequested, PANEL_INTERVAL_MS } from '../../src/diagnostics.js';

/**
 * Doublure du panneau : six champs [data-field] qui comptent leurs réécritures.
 * @returns {{element: object, fields: Record<string, {textContent: string, writes: number}>}}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests unitaires (src/diagnostics.js) — doublure
 */
function createFakePanel() {
  const fields = {};
  for (const name of ['fps', 'frame', 'backend', 'xr', 'calls', 'triangles']) {
    let text = '–';
    fields[name] = {
      dataset: { field: name },
      writes: 0,
      get textContent() {
        return text;
      },
      set textContent(value) {
        text = value;
        this.writes += 1;
      },
    };
  }
  const element = { hidden: true, dataset: {}, querySelectorAll: () => Object.values(fields) };
  return { element, fields };
}

test('mode diagnostic désactivé par défaut, activé par ?diagnostics', () => {
  assert.equal(isDiagnosticsRequested(''), false);
  assert.equal(isDiagnosticsRequested('?iwer&debug'), false);
  assert.equal(isDiagnosticsRequested('?diagnostics'), true);
});

test('60 images régulières : 60 images par seconde, 16,7 ms par image', () => {
  const stats = new FrameStats();
  for (let index = 0; index < 60; index += 1) {
    stats.record(1000 + index * (1000 / 60));
  }
  assert.ok(Math.abs(stats.fps - 60) < 1e-6, `${stats.fps}`);
  assert.ok(Math.abs(stats.averageFrameMs - 1000 / 60) < 1e-6);
});

test('fenêtre fixe : seules les dernières images comptent, à 30 images par seconde', () => {
  const stats = new FrameStats(10);
  for (let index = 0; index < 20; index += 1) {
    stats.record(index * 10); // 100 images par seconde au début…
  }
  for (let index = 1; index <= 10; index += 1) {
    stats.record(190 + index * (1000 / 30)); // … puis 30
  }
  assert.equal(stats.sampleCount, 10);
  assert.ok(Math.abs(stats.fps - 30) < 1e-6, `${stats.fps}`);
});

test('un trou de plus d\'une seconde ou une horloge qui recule (entrée en AR) font repartir la mesure', () => {
  const stats = new FrameStats();
  stats.record(0);
  stats.record(16);
  stats.record(5000);
  assert.equal(stats.sampleCount, 1);
  assert.equal(stats.fps, 0, 'moins de deux images : pas de mesure');
  stats.record(4000);
  assert.equal(stats.sampleCount, 1);
});

test('panneau : moteur de rendu, session XR, appels de dessin et triangles ; réécrit au plus deux fois par seconde', () => {
  const { element, fields } = createFakePanel();
  const renderer = { backend: { isWebGPUBackend: true }, info: { render: { drawCalls: 31, triangles: 12000 } } };
  const panel = new DiagnosticsPanel({ element, renderer, getXrState: () => 'aucune session' });
  assert.equal(element.hidden, false, 'affiché à sa création');

  for (let index = 0; index <= 60; index += 1) {
    panel.update(index * (1000 / 60));
    panel.afterRender(index * (1000 / 60));
  }
  assert.equal(fields.backend.textContent, 'WebGPU');
  assert.equal(fields.xr.textContent, 'aucune session');
  assert.equal(fields.calls.textContent, '31');
  assert.equal(fields.triangles.textContent, '12000');
  assert.equal(fields.fps.textContent, '60');
  assert.ok(fields.fps.writes <= Math.ceil(1000 / PANEL_INTERVAL_MS) + 1, `${fields.fps.writes} réécritures en une seconde`);

  const webgl = createFakePanel();
  new DiagnosticsPanel({ element: webgl.element, renderer: { backend: { isWebGLBackend: true } }, getXrState: () => '' }).write();
  assert.equal(webgl.fields.backend.textContent, 'WebGL 2 (mode test)');
  assert.equal(webgl.fields.calls.textContent, 'non fourni');
});

test('statistiques lues après le rendu : three.js les remet à zéro au début de chaque image', () => {
  const { element, fields } = createFakePanel();
  const info = { render: { drawCalls: 0, triangles: 0 } };
  const panel = new DiagnosticsPanel({ element, renderer: { backend: { isWebGPUBackend: true }, info }, getXrState: () => '' });
  for (let index = 0; index < 40; index += 1) {
    const time = index * 16;
    Object.assign(info.render, { drawCalls: 0, triangles: 0 }); // début de l'image (info.reset)
    panel.update(time);
    Object.assign(info.render, { drawCalls: 27, triangles: 9000 }); // renderer.render
    panel.afterRender(time);
  }
  assert.equal(fields.calls.textContent, '27');
  assert.equal(fields.triangles.textContent, '9000');
});
