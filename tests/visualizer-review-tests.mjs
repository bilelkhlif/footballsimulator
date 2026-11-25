/**
 * Régressions de la revue indépendante.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { readFile } from 'node:fs/promises';

/**
 * Régressions indépendantes : données d'export hostiles, promesse de lecture et restauration obsolète.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {Function} record
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Tests de bout en bout — sécurité et cycle de lecture du visualiseur
 */
export async function runVisualizerReviewTests(browser, url, record) {
  const server = { url };
  const reports = {};
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('http://127.0.0.1:8765/**', (route) => route.abort());
    await context.route('**/manifest.json', async (route) => {
      const response = await route.fetch(); const body = await response.json();
      if (body.teams) body.teams[0].color = '#fff"><img src="data:image/png;base64,AA==" onerror="window.__auditInjection=true">';
      await route.fulfill({ response, json: body });
    });
    const page = await context.newPage();
    await page.goto(server.url + 'visualizer.html?demo=match-synthetique');
    await page.waitForFunction(() => window.__matchVisualizer?.snapshot().window);
    await page.waitForTimeout(400);
    reports.xss = await page.evaluate(() => ({ injected: window.__auditInjection === true, images: document.querySelectorAll('#team-legend img').length }));
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.evaluate(() => { document.getElementById('match-video').play = () => Promise.reject(new DOMException('audit decode failure', 'AbortError')); });
    await page.click('#play'); await page.waitForTimeout(200); reports.uiPlay = { errors: [...errors], message: await page.textContent('#job-status') };
    await page.evaluate(() => {
      document.getElementById('match-video').play = () => new Promise((resolve, reject) => { window.__obsoletePlay = reject; });
    });
    await page.click('#play');
    await page.evaluate(() => window.__matchVisualizer.setMode('local'));
    const currentStatus = await page.textContent('#job-status');
    await page.evaluate(() => { window.__obsoletePlay(new DOMException('obsolete media failure', 'NotSupportedError')); });
    await page.waitForTimeout(100);
    reports.obsoletePlay = { errors: [...errors], unchanged: await page.textContent('#job-status') === currentStatus };
    await context.close();

    const second = await browser.newContext({ serviceWorkers: 'block' });
    await second.route('http://127.0.0.1:8765/**', (route) => route.abort());
    const tab = await second.newPage();
    await tab.goto(server.url + 'visualizer.html?demo=match-synthetique');
    await tab.waitForFunction(() => window.__matchVisualizer?.snapshot().window && document.getElementById('match-video').readyState >= 2);
    await tab.evaluate(() => { document.getElementById('match-video').currentTime = 18; });
    await tab.waitForFunction(() => !document.getElementById('match-video').seeking);
    const held = [];
    await second.route('**/video.mp4', (route) => new Promise((resolve) => held.push({ route, resolve })));
    await tab.evaluate(async () => {
      const v = document.getElementById('match-video');
      Object.defineProperty(v, 'error', { configurable: true, value: { code: 3, message: 'audit decoder failure' } });
      v.dispatchEvent(new Event('error')); delete v.error;
      await window.__matchVisualizer.setMode('local');
      await window.__matchVisualizer.setMode('demo', { open: 'match-synthetique' });
    });
    await tab.waitForTimeout(300);
    if (held.length === 0) throw new Error('Le scénario doit retarder au moins une requête vidéo.');
    const before = await tab.evaluate(() => ({ time: document.getElementById('match-video').currentTime, source: document.getElementById('match-video').getAttribute('src') }));
    const bytes = await readFile(new URL('../demo/matches/match-synthetique/video.mp4', import.meta.url));
    await second.unroute('**/video.mp4');
    for (const item of held) {
      try {
        const range = /bytes=(\d+)-(\d*)/.exec(item.route.request().headers().range ?? '');
        const start = Number(range?.[1] ?? 0); const end = range?.[2] ? Number(range[2]) : bytes.length - 1;
        await item.route.fulfill({ status: range ? 206 : 200, body: bytes.subarray(start,end+1), headers: { 'content-type':'video/mp4', ...(range ? { 'content-range':`bytes ${start}-${end}/${bytes.length}` } : {}) } });
      } catch {} finally { item.resolve(); }
    }
    await tab.waitForFunction(() => document.getElementById('match-video').readyState >= 2 && !document.getElementById('match-video').seeking);
    reports.staleSeek = { before, after: await tab.evaluate(() => document.getElementById('match-video').currentTime) };

    reports.retry = await tab.evaluate(() => {
      const video = document.getElementById('match-video');
      let loads = 0;
      const load = video.load;
      video.load = () => { loads += 1; };
      Object.defineProperty(video,'error',{configurable:true,value:{code:3,message:'audit corrupt media'}});
      video.dispatchEvent(new Event('error'));
      video.dispatchEvent(new Event('error'));
      const message = document.getElementById('job-status').textContent;
      delete video.error; video.load = load;
      return { loads, message };
    });
    await second.close();

  } catch(error) {
    record('Revue du visualiseur : parcours indépendant', 'échec', error.message);
    return;
  }
  const checks = [
    ['couleur hostile traitée comme donnée, aucun HTML exécuté', !reports.xss.injected && reports.xss.images === 0, reports.xss],
    ['rejet de Lecture affiché sans promesse non traitée', reports.uiPlay.errors.length === 0 && reports.uiPlay.message.includes('audit decode failure'), reports.uiPlay],
    ['rejet tardif de Lecture ignoré après fermeture de sa session', reports.obsoletePlay.errors.length === 0 && reports.obsoletePlay.unchanged, reports.obsoletePlay],
    ['fermeture et réouverture de la même vidéo sans déplacement obsolète', reports.staleSeek.before.time === 0 && reports.staleSeek.after === 0, reports.staleSeek],
    ['erreur de décodage répétée : une seule tentative automatique', reports.retry.loads === 1 && reports.retry.message.includes('Vidéo illisible'), reports.retry],
  ];
  for(const [name,ok,detail] of checks) record('Revue du visualiseur : '+name,ok?'ok':'échec',JSON.stringify(detail));
}
