import { test, expect } from '@playwright/test';

const PX_PER_M = 40;

// Collect page errors so a thrown exception inside the render loop fails the
// test instead of quietly drawing nothing.
function watchForErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

async function boot(page) {
  const errors = watchForErrors(page);
  await page.goto('/index.html');
  await page.waitForFunction(() => !!window.__game);
  return errors;
}

async function startRun(page) {
  await page.getByRole('button', { name: /Play/ }).click();
  await page.waitForFunction(() => window.__game.state === 'playing');
}

// world px of slope visible ahead of the skier, in metres
const lookaheadM = page => page.evaluate(() => window.__game.lookahead / 40);

test('menu boots and the demo slope animates', async ({ page }) => {
  const errors = await boot(page);
  await expect(page.locator('.title')).toHaveText(/ALPINE\s*DASH/);

  const x0 = await page.evaluate(() => window.__game.player.x);
  await page.waitForTimeout(600);
  const x1 = await page.evaluate(() => window.__game.player.x);
  expect(x1).toBeGreaterThan(x0);
  expect(errors).toEqual([]);
});

test('a run makes progress and the HUD tracks it', async ({ page }) => {
  const errors = await boot(page);
  await startRun(page);

  await expect.poll(
    () => page.locator('#hud-dist').textContent(),
    { timeout: 10_000 },
  ).not.toBe('0 m');

  await page.waitForTimeout(1200);
  const { dist, score } = await page.evaluate(() => ({
    dist: window.__game.player.x / 40,
    score: window.__game.score,
  }));
  expect(dist).toBeGreaterThan(10);
  expect(score).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test.describe('forward visibility', () => {
  test('you can see a long way down the slope', async ({ page }) => {
    await boot(page);
    await startRun(page);
    await page.waitForTimeout(1500);

    // the whole point of the pulled-back camera: enough runway to react to a
    // rock and set up a jump, rather than having it appear on top of you
    expect(await lookaheadM(page)).toBeGreaterThan(28);
  });

  test('the skier is framed in the left of the screen', async ({ page }) => {
    await boot(page);
    await startRun(page);
    await page.waitForTimeout(1500);

    const frac = await page.evaluate(() => {
      const g = window.__game;
      return (g.player.x - g.cam.x) * g.cam.zoom / g.w;
    });
    // left of centre, but not jammed against the edge
    expect(frac).toBeGreaterThan(0.1);
    expect(frac).toBeLessThan(0.3);
  });

  test('the view opens up as speed rises', async ({ page }) => {
    await boot(page);
    await startRun(page);
    await page.waitForTimeout(400);
    const slow = await lookaheadM(page);

    // wind the skier up to top speed and let the camera settle
    await page.evaluate(() => { window.__game.player.vx = 1600; });
    await page.waitForTimeout(1500);
    const fast = await lookaheadM(page);

    expect(fast).toBeGreaterThan(slow);
  });

  test('the view distance setting widens the frame', async ({ page }) => {
    await boot(page);

    await page.evaluate(() => { window.__game.settings.view = 0.8; });
    await startRun(page);
    await page.waitForTimeout(1500);
    const narrow = await lookaheadM(page);

    await page.evaluate(() => { window.__game.settings.view = 1.8; });
    await page.waitForTimeout(1500);
    const wide = await lookaheadM(page);

    expect(wide).toBeGreaterThan(narrow * 1.3);
  });

  test('a narrow phone screen still gets usable runway', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await startRun(page);
    await page.waitForTimeout(1500);

    // a portrait phone is the worst case for seeing ahead, so the camera
    // compensates: it must still beat the old desktop framing
    expect(await lookaheadM(page)).toBeGreaterThan(18);
  });

  test('hazards are spawned beyond the right edge so markers have something to point at', async ({ page }) => {
    await boot(page);
    await startRun(page);
    await page.waitForTimeout(1500);

    const ahead = await page.evaluate(() => {
      const g = window.__game;
      const edge = g.cam.x + g.w / g.cam.zoom;
      return g.entities.items.filter(it => !it.dead && it.x > edge).length;
    });
    expect(ahead).toBeGreaterThan(0);
  });

  test('the marker overlay draws without throwing', async ({ page }) => {
    const errors = await boot(page);
    await startRun(page);

    // plant a rock just past the right edge and let a few frames render
    await page.evaluate(() => {
      const g = window.__game;
      const x = g.cam.x + g.w / g.cam.zoom + 200;
      g.entities.items.push({ type: 'rock', x, y: g.terrain.groundY(x) - 10, r: 20, variant: 0.5 });
    });
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
});

test('jumping and backflipping works from the keyboard', async ({ page }) => {
  const errors = await boot(page);
  await startRun(page);
  await page.waitForTimeout(400);

  let sawAir = false;
  for (let i = 0; i < 8 && !sawAir; i++) {
    await page.keyboard.down('Space');
    await page.waitForTimeout(450);
    sawAir = await page.evaluate(() => window.__game.player.state === 'air');
    await page.keyboard.up('Space');
    await page.waitForTimeout(500);
  }

  expect(sawAir).toBe(true);
  expect(errors).toEqual([]);
});

test('every theme renders cleanly', async ({ page }, testInfo) => {
  const errors = await boot(page);
  await startRun(page);

  for (const theme of ['day', 'sunset', 'night']) {
    await page.evaluate(t => { window.__game.settings.theme = t; }, theme);
    await page.waitForTimeout(700);
    await testInfo.attach(`theme-${theme}.png`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  }
  expect(errors).toEqual([]);
});

test('pause and resume work', async ({ page }) => {
  await boot(page);
  await startRun(page);
  await page.waitForTimeout(300);

  await page.keyboard.press('Escape');
  await expect(page.locator('#paused')).toBeVisible();
  const parked = await page.evaluate(() => window.__game.player.x);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__game.player.x)).toBe(parked);

  await page.getByRole('button', { name: 'Resume' }).click();
  await page.waitForFunction(() => window.__game.state === 'playing');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__game.player.x)).toBeGreaterThan(parked);
});

test('the customize panel exposes the camera controls and they persist', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: /Customize/ }).click();

  const view = page.locator('[data-key="view"]');
  await expect(view).toBeVisible();
  await view.fill('1.6');
  await expect(page.locator('[data-key="hazardMarkers"]')).toBeChecked();

  expect(await page.evaluate(() => window.__game.settings.view)).toBe(1.6);

  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  expect(await page.evaluate(() => window.__game.settings.view)).toBe(1.6);
});

test('the avalanche eventually ends a parked run', async ({ page }) => {
  await boot(page);
  await startRun(page);

  // pin the skier in place; the avalanche should close in and bury them
  await page.evaluate(() => {
    const g = window.__game;
    g.player.state = 'crash';
    g.player.crashTimer = 1e9;
    g.player.vx = 0;
  });

  await page.waitForFunction(() => window.__game.state === 'gameover', null, { timeout: 30_000 });
  await expect(page.locator('#gameover')).toBeVisible();
  await expect(page.locator('#go-title')).toHaveText(/avalanche|Wiped/i);
});
