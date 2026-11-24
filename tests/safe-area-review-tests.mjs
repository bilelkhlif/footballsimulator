/**
 * Marges d'encoche simulées par substitution des valeurs env dans la feuille réelle.
 * Cette simulation CSS ne valide pas une découpe matérielle ni un téléphone physique.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * Vérifie les cibles persistantes hors d'une encoche gauche / droite et de la barre système.
 * @param {import('playwright-core').Browser} browser
 * @param {string} url
 * @param {(name: string, status: string, detail?: string) => void} record
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests navigateur — simulation des marges de sécurité
 */
export async function runSafeAreaReviewTests(browser, url, record) {
  const source = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const css = source.replaceAll('env(safe-area-inset-left)', '34px')
    .replaceAll('env(safe-area-inset-right)', '24px').replaceAll('env(safe-area-inset-top)', '0px')
    .replaceAll('env(safe-area-inset-bottom)', '21px');
  for (const [width, height] of [[844, 390], [568, 320]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    try {
      await context.addInitScript(() => localStorage.setItem('football-simulator:aide-vue', '1'));
      const page = await context.newPage();
      await page.goto(`${url}?debug`);
      await page.waitForSelector('body.is-ready');
      await page.addStyleTag({ content: css });
      await page.locator('#formations-toggle').click();
      const failures = await page.evaluate(() => [...document.querySelectorAll('#workspace-nav button, .topbar button, #reset-view, [data-workspace-close]')]
        .filter((element) => element.getClientRects().length).filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < 34 || rect.right > innerWidth - 24 + 1 || rect.top < 0 || rect.bottom > innerHeight - 21 + 1
            || !element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
        }).map((element) => element.id || element.textContent.trim()));
      assert.deepEqual(failures, []);
      record(`Marges de sécurité simulées ${width} × ${height} : rail, équipes, recentrage et fermeture accessibles`, 'ok');
    } catch (error) { record(`Marges de sécurité simulées ${width} × ${height}`, 'échec', error.message); }
    finally { await context.close(); }
  }
}
