// ============================================================
// playwright.config.ts
// ============================================================
// Purpose:   Master Playwright configuration for Open Tome E2E tests.
//            Defines two projects: auth-setup (runs once, saves session)
//            and chromium (all specs, inherits saved session via storageState).
// Used by:   `npm test` / `npx playwright test` inside e2e/
// Notes:     Requires the dev Docker stack to be running before tests start.
//            Run `.\dev.ps1` from the project root first.
//            Set env vars in e2e/.env.e2e (copy from .env.e2e.example).
// ============================================================

import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load e2e/.env.e2e using an absolute path anchored to this config file.
// `import 'dotenv/config'` uses cwd (the project root when run via --prefix),
// which would load the wrong .env file. Explicit path avoids that.
dotenv.config({ path: path.resolve(__dirname, '.env.e2e') });

// --- CONFIGURATION CONSTANTS ---------------------------------

const BASE_URL  = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const API_URL   = process.env.E2E_API_URL  ?? 'http://localhost:3001';
// Auth state is saved here by auth.setup.ts and read by all test projects.
const AUTH_FILE = path.resolve(__dirname, '.auth/user.json');

// --- PLAYWRIGHT CONFIGURATION --------------------------------

export default defineConfig({
  // Set to e2e root so both setup/ and tests/ are reachable. Each project
  // below narrows scope via testMatch globs.
  testDir: '.',

  // Allow enough time for Docker cold-start API responses.
  timeout: 30_000,

  // Run tests in parallel by default; in CI use a single worker to conserve resources.
  // Use a single worker to prevent parallel beforeAll/auth requests from overwhelming
  // the Docker containers on Windows and causing spurious 401s / timeouts.
  fullyParallel: true,
  forbidOnly:    !!process.env.CI,
  retries:       process.env.CI ? 2 : 0,
  workers:       1,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL:     BASE_URL,
    // Capture a trace on the first retry of a failing test (useful for CI debug).
    trace:       'on-first-retry',
    screenshot:  'only-on-failure',
    video:       'retain-on-failure',
  },

  // --- TEST PROJECTS -----------------------------------------
  // Project 1: auth-setup — runs once before all other projects.
  //   Signs in via the login form, saves the browser storage state to AUTH_FILE.
  // Project 2: chromium — all real test specs, pre-loaded with saved auth state.
  projects: [
    {
      name:      'auth-setup',
      // Glob is path-separator-agnostic (Windows + Unix). Restricts this
      // project to only the auth setup file; avoids picking up test specs.
      testMatch: '**/setup/auth.setup.ts',
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Every test context starts already authenticated — no login needed per spec.
        storageState: AUTH_FILE,
      },
      // Restrict to files in tests/ so this project never re-runs auth setup.
      testMatch: '**/tests/**/*.spec.ts',
      // chromium project waits for auth-setup to complete first.
      dependencies: ['auth-setup'],
    },
  ],

  // --- WEB SERVER HEALTH CHECK -------------------------------
  // Playwright polls this URL before starting tests. Because the stack is
  // Docker-managed (not npm-started), we only use `url` — not `command`.
  // Vite proxies /api to the backend, so this validates both containers.
  webServer: [
    {
      // `command` is required by the Playwright type definition but the runtime
      // accepts a no-op value when reuseExistingServer is true and the server is
      // already running (Docker stack). The echo prevents any actual child process.
      command:             'echo "docker stack already running"',
      url:                 `${API_URL}/api/health`,
      reuseExistingServer: true,
      timeout:             60_000,
    },
  ],

  // --- GLOBAL SETUP ------------------------------------------
  globalSetup: require.resolve('./setup/global.setup.ts'),
});
