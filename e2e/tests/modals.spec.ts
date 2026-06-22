// ============================================================
// tests/modals.spec.ts
// ============================================================
// Purpose:   Verifies keyboard-triggered modals — Quick Document Jump (Ctrl+G),
//            Keyboard Shortcuts reference, and Quick Export.
// Historical: "Keyboard shortcut reference modal" — fixed 2026-05-23
//             "Quick document jump (Ctrl+G)" — fixed 2026-05-23
//             "Single-document quick export" — fixed 2026-05-23
// ============================================================

import { test, expect } from '@playwright/test';
import { authPage, createProject, createDocument, deleteProject, openProject } from './helpers/api';

// --- SHARED TEST STATE ---------------------------------------

let projectId: number;
const sceneTitle = 'E2E Modal Scene';

test.beforeAll(async ({ browser }) => {
  const { page, close } = await authPage(browser);
  try {
    ({ id: projectId } = await createProject(page, 'E2E Modals Tests'));
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

test.beforeEach(async ({ page }) => {
  await openProject(page, projectId);
  // Open the scene so keyboard shortcuts work in editor context.
  await page.locator('.binder-node', { hasText: sceneTitle }).first().click();
  await expect(page.locator('.editor-toolbar')).toBeVisible({ timeout: 8_000 });
});

// --- TESTS ---------------------------------------------------

test.describe('Quick Document Jump (Ctrl+G)', () => {

  test('Ctrl+G opens the quick-jump overlay', async ({ page }) => {
    await page.keyboard.press('Control+g');
    await expect(page.locator('.qj-overlay')).toBeVisible({ timeout: 3_000 });
  });

  test('quick-jump input is auto-focused after opening', async ({ page }) => {
    await page.keyboard.press('Control+g');
    await expect(page.locator('.qj-overlay')).toBeVisible({ timeout: 5_000 });
    // Verify focus by typing immediately (no click required); the character should
    // land in the input. toBeFocused() is unreliable in headless Chromium when
    // focus is set via React's autoFocus / useEffect — typing is the user-facing truth.
    await page.keyboard.type('x');
    await expect(page.locator('.qj-input')).toHaveValue('x');
  });

  test('typing in quick-jump filters to matching documents', async ({ page }) => {
    await page.keyboard.press('Control+g');
    await page.locator('.qj-input').fill(sceneTitle);

    // Results panel should list the matching document.
    await expect(page.locator('.qj-panel')).toContainText(sceneTitle, { timeout: 3_000 });
  });

  test('Escape closes the quick-jump overlay', async ({ page }) => {
    await page.keyboard.press('Control+g');
    await expect(page.locator('.qj-overlay')).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
    await expect(page.locator('.qj-overlay')).not.toBeVisible({ timeout: 3_000 });
  });

});

test.describe('Keyboard Shortcuts modal', () => {

  test('shortcuts button opens the shortcuts modal', async ({ page }) => {
    // The ? button is in the editor toolbar.
    await page.locator('.editor-btn[title="Keyboard shortcuts"]').click();
    await expect(page.locator('.shortcuts-modal')).toBeVisible({ timeout: 3_000 });
  });

  test('shortcuts modal lists at least one keyboard shortcut', async ({ page }) => {
    await page.locator('.editor-btn[title="Keyboard shortcuts"]').click();
    await expect(page.locator('.shortcuts-table')).toBeVisible();
  });

  test('Escape closes the shortcuts modal', async ({ page }) => {
    await page.locator('.editor-btn[title="Keyboard shortcuts"]').click();
    await expect(page.locator('.shortcuts-modal')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.shortcuts-modal')).not.toBeVisible({ timeout: 3_000 });
  });

});

test.describe('Quick Export modal', () => {

  test('quick export modal opens from binder context menu', async ({ page }) => {
    // Right-click the scene node → "Quick Export…" menu item.
    const sceneNode = page.locator('.binder-node', { hasText: sceneTitle }).first();
    await sceneNode.click({ button: 'right' });
    await expect(page.locator('.context-menu')).toBeVisible();

    await page.locator('.context-menu-item', { hasText: /Quick Export/i }).click();
    await expect(page.locator('.qe-modal')).toBeVisible({ timeout: 5_000 });
  });

  test('quick export modal offers format options', async ({ page }) => {
    const sceneNode = page.locator('.binder-node', { hasText: sceneTitle }).first();
    await sceneNode.click({ button: 'right' });
    await page.locator('.context-menu-item', { hasText: /Quick Export/i }).click();

    // At least one export format option should be visible.
    await expect(page.locator('.qe-format-option').first()).toBeVisible({ timeout: 5_000 });
  });

  test('close button dismisses the quick export modal', async ({ page }) => {
    const sceneNode = page.locator('.binder-node', { hasText: sceneTitle }).first();
    await sceneNode.click({ button: 'right' });
    await page.locator('.context-menu-item', { hasText: /Quick Export/i }).click();
    await expect(page.locator('.qe-modal')).toBeVisible();

    await page.locator('.qe-close').click();
    await expect(page.locator('.qe-modal')).not.toBeVisible({ timeout: 3_000 });
  });

});
