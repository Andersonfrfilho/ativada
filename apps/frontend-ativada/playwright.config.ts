// Copyright (c) 2026 Ada Technology. All rights reserved.
// O Playwright exige `export default` neste arquivo; o lint tem uma exceção nomeada para ele.
import { defineConfig, devices } from '@playwright/test';

const DEFAULT_BASE_URL = 'http://127.0.0.1:56103';
const BROWSER_CHANNEL = process.env['PANEL_E2E_BROWSER_CHANNEL'];
const TEST_TIMEOUT_MILLISECONDS = 90_000;
const EXPECT_TIMEOUT_MILLISECONDS = 15_000;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: TEST_TIMEOUT_MILLISECONDS,
  expect: { timeout: EXPECT_TIMEOUT_MILLISECONDS },
  reporter: [['list']],
  use: {
    baseURL: process.env['PANEL_E2E_BASE_URL'] ?? DEFAULT_BASE_URL,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  // Opt-in: PANEL_E2E_BROWSER_CHANNEL=msedge usa o Edge instalado no lugar do Chromium do Playwright.
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(BROWSER_CHANNEL === undefined ? {} : { channel: BROWSER_CHANNEL }),
      },
    },
  ],
});
