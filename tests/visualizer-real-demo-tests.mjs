/**
 * Vidéo réelle sous la racine et sous le chemin GitHub Pages, sans serveur d'analyse.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/**
 * Vérifie le vrai média licencié, son suivi exporté et les interactions WebGPU.
 * @param {import('playwright-core').Browser} browser
 * @param {{root: string, subPath: string}} urls
 * @param {Function} record
 * @responsable Bilel Khlif
 * @date 2026-11-25
 * @role Tests de bout en bout — démonstration réelle et crédits
 */
export async function testRealDemo(browser, urls, record) {
  for (const [scope, url] of Object.entries(urls)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('http://127.0.0.1:8765/**', (route) => route.abort('connectionrefused'));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    try {
      await page.goto(`${url}visualizer.html`);
      await page.waitForFunction(() => window.__matchVisualizer?.snapshot().window && document.getElementById('match-video').readyState >= 2);
      const initial = await page.evaluate(() => ({ ...window.__matchVisualizer.snapshot(),
        credit: document.querySelector('.vz-media-credit')?.textContent,
        links: [...document.querySelectorAll('.vz-media-credit a')].map((link) => link.href) }));
      record(`Vidéo réelle (${scope}) : ouverte par défaut sans Python, auteur et licence accessibles`,
        initial.analysis === 'france-allemagne-2018' && initial.mode === 'demo' && initial.webgpu
          && initial.credit?.includes('Like tears in rain') && initial.links.includes('https://creativecommons.org/licenses/by-sa/4.0/') ? 'ok' : 'échec',
        JSON.stringify({ analysis: initial.analysis, mode: initial.mode, links: initial.links }));

      await page.click('#play');
      await page.waitForFunction(() => document.getElementById('match-video').currentTime > 2);
      await page.evaluate(() => document.getElementById('match-video').pause());
      let synchronized = true;
      const samples = [];
      for (const time of [4.02, 12.5, 20.1]) {
        await page.evaluate((value) => { document.getElementById('match-video').currentTime = value; }, time);
        await page.waitForFunction((value) => {
          const state = window.__matchVisualizer.snapshot();
          return !document.getElementById('match-video').seeking && state.window?.from <= value && state.window?.to >= value
            && Math.abs(state.sampleTime - value) <= 0.08;
        }, time);
        const state = await page.evaluate(() => window.__matchVisualizer.snapshot());
        synchronized &&= state.objects.length > 0 && state.overlay.placed > 0 && Math.abs(state.analysedTime - time) <= 0.12;
        samples.push({ time: state.currentTime, tracking: state.analysedTime, placed: state.overlay.placed });
      }
      record(`Vidéo réelle (${scope}) : lecture et trois recherches synchronisent vidéo, suivi et pions`, synchronized ? 'ok' : 'échec', JSON.stringify(samples));

      const target = await page.evaluate(() => {
        const overlay = window.__matchVisualizer.overlay;
        const canvas = overlay.renderer.domElement.getBoundingClientRect();
        const points = [...overlay.pools.values()].flatMap((pool) => pool.players).filter((player) => player.visible).map((player) => {
          const point = player.getWorldPosition(player.position.clone());
          point.y += 0.012;
          point.project(overlay.camera);
          return { id: player.userData.trackId, x: canvas.left + (point.x + 1) / 2 * canvas.width,
            y: canvas.top + (1 - point.y) / 2 * canvas.height };
        }).filter((point) => point.x > canvas.left && point.x < canvas.right && point.y > canvas.top && point.y < canvas.bottom);
        for (const point of points) point.distance = Math.min(...points.filter((other) => other !== point).map((other) => Math.hypot(other.x - point.x, other.y - point.y)));
        return points.sort((a, b) => b.distance - a.distance)[0];
      });
      if (!target) throw new Error('Aucun pion réel visible et sélectionnable.');
      await page.mouse.click(target.x, target.y);
      await page.waitForFunction((id) => window.__matchVisualizer.selectedId === id, target.id);
      const cameraBefore = await page.evaluate(() => window.__matchVisualizer.overlay.camera.position.toArray());
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(300);
      const interactive = await page.evaluate((before) => ({ selected: window.__matchVisualizer.selectedId,
        zoomed: window.__matchVisualizer.overlay.camera.position.toArray().some((value, index) => Math.abs(value - before[index]) > 1e-4) }), cameraBefore);
      record(`Vidéo réelle (${scope}) : sélection d'un pion et zoom du terrain 3D`, interactive.selected === target.id && interactive.zoomed ? 'ok' : 'échec', JSON.stringify(interactive));

      await page.reload();
      await page.waitForFunction(() => window.__matchVisualizer?.snapshot().analysis === 'france-allemagne-2018' && window.__matchVisualizer.snapshot().window);
      await page.selectOption('#demo-select', 'match-synthetique');
      await page.waitForFunction(() => window.__matchVisualizer.snapshot().analysis === 'match-synthetique' && document.getElementById('match-video').readyState >= 2);
      const syntheticDuration = await page.evaluate(() => document.getElementById('match-video').duration);
      await page.selectOption('#demo-select', 'france-allemagne-2018');
      await page.waitForFunction(() => window.__matchVisualizer.snapshot().analysis === 'france-allemagne-2018' && window.__matchVisualizer.snapshot().window);
      record(`Vidéo réelle (${scope}) : rechargement, changements de démo, synthétique de 36 s conservée, aucune erreur`,
        Math.abs(syntheticDuration - 36) < 0.1 && errors.length === 0 ? 'ok' : 'échec', JSON.stringify({ syntheticDuration, errors }));
    } catch (error) {
      record(`Vidéo réelle (${scope}) : parcours complet`, 'échec', error.message);
    } finally {
      await context.close();
    }
  }
}
