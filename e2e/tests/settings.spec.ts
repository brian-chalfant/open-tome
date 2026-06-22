// ============================================================
// tests/settings.spec.ts
// ============================================================
// Purpose:   Verifies user-configurable preferences — theme cycling via the
//            topbar ThemeToggle, the editor font selector, and the Profile page.
// Historical: "Settings page" — implemented 2026-05-25 on feature/settings-page;
//             Appearance (theme), Editor defaults, and account info.
//             Theme toggle cycles light → dark → tome.
// Notes:     There is no separate /settings route — preferences live in:
//             - Theme: ThemeToggle button (.app-theme-btn) in the topbar
//             - Font:  Font selector (.editor-font-select) in the editor toolbar
//             - Profile/manuscript: /profile page
// ============================================================

import { test, expect } from '@playwright/test';
import { authPage, createProject, createDocument, deleteProject, openProject } from './helpers/api';

// --- SHARED TEST STATE ---------------------------------------

let projectId: number;
const sceneTitle = 'E2E Settings Scene';

test.beforeAll(async ({ browser }) => {
  const { page, close } = await authPage(browser);
  try {
    ({ id: projectId } = await createProject(page, 'E2E Settings Tests'));
    await createDocument(page, projectId, 'scene', sceneTitle);
  } finally {
    await close();
  }
});

test.afterAll(async ({ browser }) => {
  const { page, close } = await authPage(browser);
  try {
    await deleteProject(page, projectId);
  } finally {
    await close();
  }
});

// --- TESTS ---------------------------------------------------

test.describe('Theme toggle', () => {

  test('ThemeToggle button is visible in the topbar', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('.app-topbar')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.app-theme-btn')).toBeVisible();
  });

  test('clicking the toggle changes data-theme on <html>', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('.app-topbar')).toBeVisible({ timeout: 10_000 });

    const htmlEl       = page.locator('html');
    const themeBefore  = (await htmlEl.getAttribute('data-theme')) ?? 'light';

    await page.locator('.app-theme-btn').click();

    // Wait for the optimistic theme update to apply — Playwright retries the assertion.
    await expect(htmlEl).not.toHaveAttribute('data-theme', themeBefore, { timeout: 3_000 });
  });

  test('theme cycles through light → dark → tome and back to light', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('.app-topbar')).toBeVisible({ timeout: 10_000 });

    // Reset to light first by clicking until the title reads "Switch to dark mode".
    for (let i = 0; i < 3; i++) {
      const title = await page.locator('.app-theme-btn').getAttribute('title');
      if (title === 'Switch to dark mode') break;
      await page.locator('.app-theme-btn').click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // light → dark
    await page.locator('.app-theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 3_000 });

    // dark → tome
    await page.locator('.app-theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'tome', { timeout: 3_000 });

    // tome → light
    await page.locator('.app-theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light', { timeout: 3_000 });
  });

});

test.describe('Editor font preferences', () => {

  test.beforeEach(async ({ page }) => {
    await openProject(page, projectId);
    await page.locator('.binder-node', { hasText: sceneTitle }).first().click();
    await expect(page.locator('.editor-toolbar')).toBeVisible({ timeout: 8_000 });
  });

  test('font selector is visible in the editor toolbar', async ({ page }) => {
    await expect(page.getByLabel('Font family')).toBeVisible();
  });

  test('font selector includes OpenDyslexic option', async ({ page }) => {
    const select  = page.getByLabel('Font family');
    const options = await select.locator('option').allInnerTexts();
    expect(options.some(o => /OpenDyslexic/i.test(o))).toBe(true);
  });

  test('selected font persists after page reload', async ({ page }) => {
    await page.getByLabel('Font family').selectOption({ value: 'georgia' });
    await expect(page.locator('.editor-wrapper')).toHaveClass(/editor-font-georgia/);

    await page.reload();
    await page.locator('.binder-node', { hasText: sceneTitle }).first().click();
    await expect(page.locator('.editor-wrapper')).toHaveClass(/editor-font-georgia/, { timeout: 5_000 });

    await page.getByLabel('Font family').selectOption({ value: 'sans' });
  });

});

test.describe('Profile page', () => {

  test('/profile page loads and shows user identity', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('.profile-page')).toBeVisible({ timeout: 10_000 });
    // User's display name or email is shown in the header.
    await expect(page.locator('.profile-identity')).toBeVisible();
  });

  test('/profile page has manuscript info section', async ({ page }) => {
    await page.goto('/profile');
    // The manuscript section is used to populate the title page on export.
    await expect(page.locator('.profile-ms-section')).toBeVisible({ timeout: 10_000 });
  });

  test('/profile page shows writing stats', async ({ page }) => {
    await page.goto('/profile');
    // Stats grid (words this year, streak, etc.) must be present.
    await expect(page.locator('.profile-stats-grid')).toBeVisible({ timeout: 10_000 });
  });

});
