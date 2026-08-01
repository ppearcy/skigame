// Dev helper: grab a few gameplay screenshots so visual changes can be eyeballed.
//   node test/shots.mjs [outDir]
// Uses the same static server + Chromium as the e2e suite.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] || 'shots';
const PORT = 8124;
mkdirSync(outDir, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);

await new Promise(r => setTimeout(r, 700));

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('pageerror', e => console.error('PAGE ERROR', e));

await page.goto(`http://127.0.0.1:${PORT}/index.html`);
await page.waitForFunction(() => !!window.__game);
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/00-menu.png` });

await page.getByRole('button', { name: /Play/ }).click();
await page.waitForFunction(() => window.__game.state === 'playing');

// headless software rendering trips the frame-time watchdog, which would strip
// the decorative passes out of the very screenshots we want to look at
const pinFullDetail = p => p.evaluate(async () => {
  const m = await import('./js/render.js');
  setInterval(() => { m.setDetail(1); window.__game.detail = 1; }, 100);
});
await pinFullDetail(page);

for (const [name, theme, wait] of [
  ['01-day', 'day', 2500],
  ['02-sunset', 'sunset', 2500],
  ['03-night', 'night', 2500],
]) {
  await page.evaluate(t => { window.__game.settings.theme = t; }, theme);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${outDir}/${name}.png` });
}

// fast, zoomed-out framing — the "see further ahead" case
await page.evaluate(() => {
  const g = window.__game;
  g.settings.theme = 'day';
  g.settings.view = 1.8;
  g.player.vx = 1500;
});
await page.waitForTimeout(2200);
await page.screenshot({ path: `${outDir}/04-wide-fast.png` });

console.log('lookahead (m):', await page.evaluate(() => window.__game.lookahead / 40));

// portrait phone: the tightest framing the camera has to cope with
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
await phone.goto(`http://127.0.0.1:${PORT}/index.html`);
await phone.waitForFunction(() => !!window.__game);
await phone.getByRole('button', { name: /Play/ }).click();
await phone.waitForFunction(() => window.__game.state === 'playing');
await pinFullDetail(phone);
await phone.waitForTimeout(3000);
await phone.screenshot({ path: `${outDir}/05-phone.png` });
console.log('phone lookahead (m):', await phone.evaluate(() => window.__game.lookahead / 40));

await browser.close();
stop();
