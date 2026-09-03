import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Chromium proxies loopback by default under Playwright; the sandbox proxy only serves CONNECT, so keep localhost direct.
process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK ??= '1';

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const executablePath = process.env.TERRA_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const extraArgs = (process.env.TERRA_BROWSER_ARGS ?? '').split(' ').filter(Boolean);
const port = Number(process.env.TERRA_E2E_PORT ?? 4173);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath,
      proxy: proxy ? { server: proxy, bypass: 'localhost,127.0.0.1' } : undefined,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-sync', '--disable-component-update', ...extraArgs],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: undefined } }],
  webServer: {
    command: process.env.TERRA_E2E_DEV ? 'npm run dev' : `npx vite preview --host 127.0.0.1 --port ${port}`,
    env: { ...process.env, TERRA_FIXTURES: '1' },
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
