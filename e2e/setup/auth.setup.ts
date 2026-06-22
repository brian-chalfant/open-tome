// ============================================================
// auth.setup.ts
// ============================================================
// Purpose:   Playwright "auth-setup" project — runs once before all test specs.
//            Signs in via the self-hosted JWT auth API, saves the resulting
//            browser storageState to .auth/user.json for all specs to inherit.
//
// Used by:   playwright.config.ts (auth-setup project)
// Notes:     Requires E2E_TEST_EMAIL and E2E_TEST_PASSWORD in e2e/.env.e2e.
// ============================================================

import { test as setup, expect } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.resolve(__dirname, '../.auth/user.json');

setup('authenticate test user via login', async ({ page }) => {
  const email    = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      '[auth-setup] E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set.\n' +
      'Copy e2e/.env.e2e.example to e2e/.env.e2e and fill in the values.',
    );
  }

  await page.goto('/login');

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  await expect(page.locator('.binder')).toBeVisible({ timeout: 15_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
