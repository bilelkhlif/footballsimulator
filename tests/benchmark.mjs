/**
 * Banc de mesure des performances (sprint 6), lancé par « npm run bench ».
 *
 * Il mesure, dans Chrome sans interface et sur le vrai processeur graphique, trois scénarios :
 * vue 3D au repos, vue 3D pendant des changements de formation, et AR émulée (IWER) avec le terrain
 * posé. Le processeur central est ralenti 4 fois par le protocole de Chrome
 * (Emulation.setCPUThrottlingRate), pour approcher celui d'un téléphone de milieu de gamme : ce
 * n'est pas une mesure sur téléphone, mais une comparaison avant / après dans des conditions
 * identiques. Chaque scénario est joué 3 fois, sur une page neuve ; le bilan donne les médianes.
 *
 * Mesures : images par seconde et intervalle entre images (médiane, 95e centile), temps de
 * processeur central de renderer.render (parcours de la scène et encodage des commandes WebGPU),
 * appels de dessin, triangles, objets de la scène et mémoire du processeur graphique déclarée par
 * three.js (renderer.info.memory).
 *
 * Usage : npm run bench [-- --out resultats.json] ; CPU_SLOWDOWN=1 pour ne pas ralentir.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

/** Navigateur utilisé : Chrome par défaut. */
const CHANNEL = process.env.BROWSER_CHANNEL ?? 'chrome';

/** Ralentissement du processeur central (1 : aucun). */
const CPU_SLOWDOWN = Number(process.env.CPU_SLOWDOWN ?? 4);

/** Durées de chauffe et de mesure, en millisecondes, et nombre de répétitions. */
const WARMUP_MS = 3000;
const MEASURE_MS = 6000;
const RUNS = 3;

/** Écran de téléphone pour la vue 3D ; bureau pour l'AR émulée (affichage d'IWER). */
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 800 } };

/**
 * Script de page : sonde autour de renderer.render, installée dans window.__probe.
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Performance — banc de mesure (sonde de la page)
 */
function installProbe() {
  window.__probe = {
    begin() {
      const renderer = window.__footballSimulator.renderer;
      const original = renderer.render;
      const samples = { cpu: [], stamps: [], drawCalls: 0, triangles: 0 };
      renderer.render = function measuredRender(...args) {
        const start = performance.now();
        const result = original.apply(this, args);
        samples.cpu.push(performance.now() - start);
        samples.stamps.push(start);
        samples.drawCalls = this.info.render.drawCalls;
        samples.triangles = this.info.render.triangles;
        return result;
      };
      this.samples = samples;
      this.restore = () => { renderer.render = original; };
    },
    end() {
      this.restore();
      const { cpu, stamps, drawCalls, triangles } = this.samples;
      const intervals = stamps.slice(1).map((stamp, index) => stamp - stamps[index]);
      // Centile d'une liste de nombres.
      const percentile = (values, p) => {
        const sorted = [...values].sort((a, b) => a - b);
        return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;
      };
      const app = window.__footballSimulator;
      let objects = 0;
      app.scene.traverse(() => { objects += 1; });
      const memory = app.renderer.info.memory;
      return {
        frames: stamps.length,
        fps: stamps.length > 1 ? ((stamps.length - 1) * 1000) / (stamps.at(-1) - stamps[0]) : 0,
        frameMs: percentile(intervals, 0.5),
        frameP95Ms: percentile(intervals, 0.95),
        cpuMs: percentile(cpu, 0.5),
        cpuP95Ms: percentile(cpu, 0.95),
        drawCalls,
        triangles,
        objects,
        gpuMemoryKiB: Math.round(memory.total / 1024),
        texturesKiB: Math.round(memory.texturesSize / 1024),
        uniformBuffers: memory.uniformBuffers,
      };
    },
  };
}

/**
 * Ouvre l'application sur une page neuve, ralentit son processeur central et attend la scène.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {object} contextOptions
 * @returns {Promise<{context: object, page: object}>}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Performance — banc de mesure
 */
async function openThrottled(browser, url, contextOptions) {
  const context = await browser.newContext(contextOptions);
  await context.addInitScript(installProbe);
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => document.body.classList.contains('is-ready'), null, { timeout: 30000 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  return { context, page };
}

/**
 * Mesure une page pendant MEASURE_MS, après la chauffe, en jouant une action pendant la mesure.
 * @param {object} page
 * @param {(page: object) => Promise<void>} [during] action répétée pendant la mesure
 * @returns {Promise<object>}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Performance — banc de mesure
 */
async function measure(page, during = null) {
  await page.waitForTimeout(WARMUP_MS);
  await page.evaluate(() => window.__probe.begin());
  const end = Date.now() + MEASURE_MS;
  while (Date.now() < end) {
    if (during) {
      await during(page);
    }
    await page.waitForTimeout(during ? 750 : 500);
  }
  return page.evaluate(() => window.__probe.end());
}

/** Scénarios mesurés : nom, adresse, contexte, préparation et action pendant la mesure. */
const SCENARIOS = [
  { name: 'Vue 3D au repos (téléphone 390 × 844)', query: '?debug', context: PHONE },
  {
    name: 'Vue 3D, changements de formation (téléphone)',
    query: '?debug',
    context: PHONE,
    during: async (page) => page.evaluate(() => {
      const { board } = window.__footballSimulator;
      const next = board.getFormation('blue').name === '4-3-3' ? ['3-5-2', '4-2-3-1'] : ['4-3-3', '4-4-2'];
      board.setFormation('blue', next[0]);
      board.setFormation('red', next[1]);
    }),
  },
  {
    name: 'AR émulée, terrain posé (IWER)',
    query: '?iwer&debug',
    context: DESKTOP,
    prepare: async (page) => {
      await page.waitForFunction(() => document.getElementById('xr-status')?.dataset.state === 'emulated', null, { timeout: 30000 });
      await page.evaluate(() => {
        const half = -(35 * Math.PI) / 360;
        window.__footballSimulator.xrDevice.quaternion.set(Math.sin(half), 0, 0, Math.cos(half));
      });
      await page.click('#enter-ar');
      await page.waitForFunction(() => window.__footballSimulator.placement?.state === 'surface', null, { timeout: 20000 });
      await page.mouse.click(640, 380);
      await page.waitForFunction(() => window.__footballSimulator.placement?.state === 'placed', null, { timeout: 20000 });
    },
  },
];

/**
 * Médiane d'une liste de nombres.
 * @param {number[]} values
 * @returns {number}
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Performance — banc de mesure
 */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Joue chaque scénario RUNS fois et affiche les médianes ; écrit le détail en JSON si demandé.
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Performance — banc de mesure
 */
async function main() {
  const outIndex = process.argv.indexOf('--out');
  const browser = await chromium.launch({ channel: CHANNEL, headless: true, args: ['--enable-unsafe-webgpu'] });
  const server = await startServer();
  const report = { date: new Date().toISOString(), cpuSlowdown: CPU_SLOWDOWN, chrome: browser.version(), scenarios: [] };
  try {
    for (const scenario of SCENARIOS) {
      const runs = [];
      for (let run = 0; run < RUNS; run += 1) {
        const { context, page } = await openThrottled(browser, `${server.url}${scenario.query}`, scenario.context);
        try {
          await scenario.prepare?.(page);
          runs.push(await measure(page, scenario.during));
        } finally {
          await context.close();
        }
      }
      const summary = Object.fromEntries(Object.keys(runs[0]).map((key) => [key, median(runs.map((result) => result[key]))]));
      report.scenarios.push({ name: scenario.name, summary, runs });
    }
  } finally {
    await browser.close();
    await server.close();
  }

  console.log(`Chrome ${report.chrome}, processeur central ralenti ${CPU_SLOWDOWN} fois, médianes de ${RUNS} mesures de ${MEASURE_MS / 1000} s\n`);
  console.log('| Scénario | Images/s | Image (médiane, p95) | CPU de render (médiane, p95) | Appels de dessin | Triangles | Objets | Mémoire GPU (textures) | Tampons uniformes |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const { name, summary: s } of report.scenarios) {
    console.log(`| ${name} | ${s.fps.toFixed(1)} | ${s.frameMs.toFixed(1)} ms, ${s.frameP95Ms.toFixed(1)} ms | ${s.cpuMs.toFixed(2)} ms, ${s.cpuP95Ms.toFixed(2)} ms | ${s.drawCalls} | ${s.triangles} | ${s.objects} | ${s.gpuMemoryKiB} Kio (${s.texturesKiB} Kio) | ${s.uniformBuffers} |`);
  }
  if (outIndex !== -1) {
    await writeFile(process.argv[outIndex + 1], JSON.stringify(report, null, 2));
  }
}

await main();
