/**
 * Captures comparables du terrain et du panneau des formations en bureau, portrait et paysage.
 * Usage : node tests/capture-workspaces.mjs. Pour une référence avant modification, définir
 * CAPTURE_ROOT sur le checkout de référence et CAPTURE_PREFIX=avant.
 * Les captures mobiles sont émulées dans Chrome sur PC.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { REPO_ROOT, startServer } from './serve.mjs';

const root = process.env.CAPTURE_ROOT ? path.resolve(process.env.CAPTURE_ROOT) : REPO_ROOT;
const prefix = process.env.CAPTURE_PREFIX ?? 'apres';
const output = path.join(REPO_ROOT, 'docs/images/sidebar');
await mkdir(output, { recursive: true });
const server = await startServer({ root });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
try {
  for (const [name, width, height] of [['bureau', 1440, 900], ['portrait', 390, 844], ['paysage', 844, 390]]) {
    const mobile = name !== 'bureau';
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile });
    // L'aide est testée ailleurs ; les captures comparent le même état tactique initial.
    await context.addInitScript(() => localStorage.setItem('football-simulator:aide-vue', '1'));
    const page = await context.newPage();
    await page.goto(`${server.url}?debug`);
    await page.waitForSelector('body.is-ready', { timeout: 25000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(output, `${prefix}-${name}.png`) });
    if (prefix !== 'avant') {
      await page.locator('#formations-toggle').click();
      await page.mouse.move(width - 20, 100);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(output, `${prefix}-formations-${name}.png`) });
    }
    console.log(`${prefix} ${name} : ${width} × ${height}`);
    await context.close();
  }
} finally { await browser.close(); await server.close(); }
