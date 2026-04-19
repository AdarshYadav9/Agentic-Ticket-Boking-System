// @ts-check
import { defineConfig, devices } from '@playwright/test';

const headed = process.env.HEADED === '1' || process.env.HEADED === 'true';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    trace: 'on-first-retry',

    // Added basic config
    // Default to headless to work in CI/sandboxes; set HEADED=1 for GUI.
    headless: !headed,
    viewport: { width: 1280, height: 720 },
  },

  projects: [
    {
      name: 'chromium',
      // Use system Chrome to avoid browser download/executable issues.
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});