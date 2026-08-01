import { defineConfig } from '@playwright/test';

// The game is plain static files, so the "build" is just a file server.
// CI installs Playwright's own Chromium; sandboxes that ship a preinstalled
// one can point at it with PW_CHROMIUM_PATH.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './test/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8123',
    viewport: { width: 1280, height: 720 },
    launchOptions: { executablePath, args: ['--no-sandbox'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 8123',
    url: 'http://127.0.0.1:8123/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
