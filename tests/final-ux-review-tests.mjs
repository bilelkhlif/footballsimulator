/**
 * Régressions de la revue finale : aide invisible, Retour, focus du débordement,
 * texte agrandi et panneaux sur tablette. Les commandes sont atteintes dans le navigateur.
 * FINAL_UX_CAPTURE=1 produit la capture du texte agrandi, sans modifier l'état tactique.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openWorkspace } from './workspace-test-helpers.mjs';

/**
 * Vérifie les défauts reproduits pendant la revue par des interactions réelles.
 * @param {import('playwright-core').Browser} browser navigateur partagé avec la suite
 * @param {string} url origine du serveur statique
 * @param {(name: string, status: string, detail?: string) => void} record résultat de chaque cas
 * @returns {Promise<void>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout — régressions de la revue finale de l'interface
 */
export async function runFinalUxReviewTests(browser, url, record) {
  const spaces = ['home', 'formations', 'tactics', 'animation', 'ar', 'more', 'settings'];

  /** Isole un profil, attend le vrai démarrage et libère son contexte après le parcours. */
  const withPage = async ({ width = 1280, height = 800, touch = false, firstVisit = false } = {}, action) => {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    try {
      if (!firstVisit) await context.addInitScript(() => localStorage.setItem('football-simulator:aide-vue', '1'));
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${url}?debug`);
      await page.waitForSelector('body.is-ready', { timeout: 20000 });
      await action(page);
      assert.deepEqual(errors, [], 'aucune erreur JavaScript pendant le parcours');
    } finally { await context.close(); }
  };
  /** Garde les résultats séparés sans interrompre les autres dimensions en cas d'échec. */
  const check = async (name, action) => {
    try { await action(); record(`Revue UX : ${name}`, 'ok'); }
    catch (error) { record(`Revue UX : ${name}`, 'échec', error.message); }
  };
  /** Un contrôle doit être à l'écran et recevoir le toucher en son centre. */
  const assertReachable = async (locator) => {
    await locator.scrollIntoViewIfNeeded();
    const result = await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.top >= -1
        && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1
        && element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    });
    assert.equal(result, true, 'commande visible et atteignable');
  };

  await check('première visite : Échap ferme le panneau visible sans être absorbé par le guide caché', async () => {
    await withPage({ firstVisit: true }, async (page) => {
      assert.equal(await page.locator('#onboarding').isVisible(), true);
      await openWorkspace(page, 'formations');
      assert.equal(await page.locator('#onboarding').isVisible(), false);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.body.dataset.panelOpen === 'false');
      assert.equal(await page.locator('#workspace-panel').isVisible(), false);
    });
  });

  await check('Retour navigateur depuis une image clé : focus rendu à une commande visible du rail', async () => {
    await withPage({}, async (page) => {
      await openWorkspace(page, 'animation');
      await page.locator('[data-sequence="keyframe"]').focus();
      await page.goBack();
      await page.waitForFunction(() => document.body.dataset.panelOpen === 'false');
      const focused = await page.evaluate(() => {
        const element = document.activeElement;
        return Boolean(element.closest('#workspace-nav') && element.getClientRects().length);
      });
      assert.equal(focused, true, 'le focus ne reste pas dans un panneau masqué');
    });
  });

  await check('portrait : ouvrir l’AR depuis Plus avec Entrée conserve un focus visible dans la destination', async () => {
    await withPage({ width: 390, height: 844, touch: true }, async (page) => {
      await openWorkspace(page, 'more');
      const shortcut = page.locator('[data-workspace-panel="more"] [data-workspace="ar"]');
      await shortcut.focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.body.dataset.workspace === 'ar');
      const focus = await page.evaluate(() => {
        const element = document.activeElement;
        return { visible: Boolean(element.getClientRects().length), destination: Boolean(element.closest('#workspace-panel')) };
      });
      assert.deepEqual(focus, { visible: true, destination: true });
      await assertReachable(page.locator('[data-workspace-close]').first());
    });
  });

  await check('texte à 200 % : cinq libellés contenus dans leurs cibles en portrait 320 et 390 px', async () => {
    for (const width of [320, 390]) {
      await withPage({ width, height: width === 320 ? 568 : 844, touch: true }, async (page) => {
        await page.addStyleTag({ content: ':root { font-size: 32px !important; }' });
        await openWorkspace(page, 'settings');
        const state = await page.evaluate(() => {
          const buttons = [...document.querySelectorAll('#workspace-nav button')].filter((button) => button.getClientRects().length);
          const labels = buttons.map((button) => {
            const target = button.getBoundingClientRect();
            const label = button.querySelector('.nav-item__short');
            const rect = label.getBoundingClientRect();
            return { left: rect.left, right: rect.right, contained: rect.left >= target.left - 1 && rect.right <= target.right + 1
              && rect.top >= target.top - 1 && rect.bottom <= target.bottom + 1, accessible: Boolean(button.getAttribute('aria-label')?.trim()) };
          });
          return { count: buttons.length, labels, overflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert.equal(state.count, 5);
        assert.equal(state.overflow, false);
        assert.equal(state.labels.every((label) => label.contained && label.accessible), true, `libellés ${width} px : ${JSON.stringify(state.labels)}`);
        assert.equal(state.labels.every((label, index) => index === 0 || label.left >= state.labels[index - 1].right - 1), true, 'les libellés ne se chevauchent pas');
        await assertReachable(page.locator('.team-chip--blue'));
        await assertReachable(page.locator('.team-chip--red'));
        await assertReachable(page.locator('[data-workspace-close]').first());
        await assertReachable(page.locator('#more-toggle'));
        if (width === 390 && process.env.FINAL_UX_CAPTURE) {
          const directory = new URL('../docs/images/revue/', import.meta.url);
          await mkdir(directory, { recursive: true });
          await page.mouse.move(380, 100);
          await page.waitForTimeout(200);
          await page.screenshot({ path: fileURLToPath(new URL('apres-texte-200.png', directory)) });
        }
      });
    }
  });

  for (const [width, height] of [[768, 1024], [1024, 768], [720, 450]]) {
    await check(`${width} × ${height} : sept espaces, fermeture atteignable et canvas conservé`, async () => {
      await withPage({ width, height, touch: true }, async (page) => {
        for (const id of spaces) {
          await openWorkspace(page, id);
          assert.equal(await page.locator(`[data-workspace-panel="${id}"]`).isVisible(), true);
          await assertReachable(page.locator('[data-workspace-close]').first());
          const layout = await page.evaluate(() => {
            const rect = document.getElementById('scene-container').getBoundingClientRect();
            return { width: rect.width, height: rect.height, overflow: document.documentElement.scrollWidth > innerWidth };
          });
          assert.ok(layout.width > 0 && layout.height > 0, 'terrain toujours présent');
          assert.equal(layout.overflow, false);
          await page.locator('[data-workspace-close]').first().click();
          await page.waitForFunction(() => document.body.dataset.panelOpen === 'false');
          await page.waitForFunction(() => !history.state?.footballWorkspace);
        }
      });
    });
  }
}
