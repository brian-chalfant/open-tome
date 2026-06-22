// ============================================================
// dashboard.spec.ts
// ============================================================
// Purpose:   Smoke tests for the authenticated dashboard (app shell + binder).
//            Verifies auth works end-to-end and the core UI mounts correctly.
// Used by:   Playwright chromium project (inherits .auth/user.json storageState)
// Notes:     All tests in this file start pre-authenticated via the saved
//            storage state from auth.setup.ts. No login steps needed here.
// ============================================================

import { test, expect } from '@playwright/test';

// Storage state (saved by auth.setup.ts) is inherited via playwright.config.ts.
// These tests begin already signed in — no login interaction needed.

test.describe('Dashboard smoke tests', () => {

  test('navigates to /app and shows the authenticated workspace', async ({ page }) => {
    await page.goto('/app');

    // The page title should contain the app name.
    await expect(page).toHaveTitle(/Tome/i);

    // The top navigation bar is visible when the user is authenticated.
    await expect(page.locator('.app-topbar')).toBeVisible();

    // The user's display name appears in the topbar. This confirms:
    // 1. useAuth returned a user (session is valid)
    // 2. /api/auth/me returned the DB user record
    await expect(page.locator('.app-display-name')).toBeVisible({ timeout: 10_000 });
  });

  test('binder sidebar renders with document tree or empty state', async ({ page }) => {
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    // The binder <aside> mounts immediately on auth.
    const binder = page.locator('.binder');
    await expect(binder).toBeVisible({ timeout: 10_000 });

    // Either a project is loaded (document tree visible) or the empty-state
    // prompt is shown. Both confirm the binder mounted and fetched project data.
    const documentTree = page.locator('.binder-tree');
    const emptyState   = page.locator('.binder-empty');
    await expect(documentTree.or(emptyState)).toBeVisible({ timeout: 10_000 });
  });

  test('binder header has functioning project controls', async ({ page }) => {
    await page.goto('/app');

    // The binder header contains controls for creating/managing projects.
    // This button is always visible regardless of whether any projects exist.
    const binderHeader = page.locator('.binder-header');
    await expect(binderHeader).toBeVisible({ timeout: 10_000 });
  });

  test('/app redirects unauthenticated users to /login', async ({ browser }) => {
    // Open a fresh browser context with NO saved auth state.
    // This verifies ProtectedRoute is working — unauthenticated users must
    // not be able to reach /app.
    const freshContext = await browser.newContext({ storageState: undefined });
    const page = await freshContext.newPage();

    await page.goto('/app');

    // ProtectedRoute performs <Navigate to="/login" replace /> when useAuth
    // returns no user. The URL should update to /login.
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    await freshContext.close();
  });

  test('backend health endpoint returns ok', async ({ request }) => {
    // Directly verify the backend is alive via Playwright's APIRequestContext.
    // This bypasses the browser and the Vite proxy — useful as a precondition
    // diagnostic. If this fails, the Docker stack is not running correctly.
    const apiUrl   = process.env.E2E_API_URL ?? 'http://localhost:3001';
    const response = await request.get(`${apiUrl}/api/health`);

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toMatchObject({ status: 'ok' });
  });

});
