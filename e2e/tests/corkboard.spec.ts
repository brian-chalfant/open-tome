// ============================================================
// tests/corkboard.spec.ts
// ============================================================
// Purpose:   Verifies the corkboard view toggle — on/off with a folder selected
//            and on/off without a folder selected.
// Historical: "Corkboard toggle can't be turned off without a folder selected"
//             — fixed 2026-05-23.  The bug caused the toggle to be stuck ON once
//             activated unless a folder was in context.
// ============================================================

import { test, expect } from '@playwright/test';
import {
  authPage, createProject, createDocument, deleteProject, openProject,
} from './helpers/api';

// --- SHARED TEST STATE ---------------------------------------

let projectId: number;
let folderId: number;
const folderTitle = 'E2E Cork Folder';
const scene1Title = 'E2E Cork Scene 1';
const scene2Title = 'E2E Cork Scene 2';
const sceneTitle  = 'E2E Cork Scene Solo';

test.beforeAll(async ({ browser }) => {
  const { page, close } = await authPage(browser);
  try {
    ({ id: projectId } = await createProject(page, 'E2E Corkboard Tests'));
    // A folder with two child scenes — needed to verify index cards render.
    ({ id: folderId } = await createDocument(page, projectId, 'folder', folderTitle));
    await createDocument(page, projectId, 'scene', scene1Title, folderId);
    await createDocument(page, projectId, 'scene', scene2Title, folderId);
    // A top-level scene for the "no folder selected" scenario.
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
});

// Helper: find the corkboard toggle button (title changes depending on state).
function corkboardBtn(page: import('@playwright/test').Page) {
  return page.locator(
      '.toolbar-btn[title="Switch to corkboard view"], .toolbar-btn[title="Switch to editor view"]',
  ).first();
}

// --- TESTS ---------------------------------------------------

test.describe('Corkboard with folder selected', () => {

  test('corkboard is off by default', async ({ page }) => {
    await expect(page.locator('.corkboard')).not.toBeVisible();
  });

  test('toggle turns the corkboard on when a folder is active', async ({ page }) => {
    // Select the folder node first.
    await page.locator('.binder-node', { hasText: folderTitle }).first().click();
    await corkboardBtn(page).click();

    await expect(page.locator('.corkboard-canvas')).toBeVisible({ timeout: 5_000 });
  });

  test('child scenes appear as index cards on the corkboard', async ({ page }) => {
    await page.locator('.binder-node', { hasText: folderTitle }).first().click();
    await corkboardBtn(page).click();

    // Each child scene should produce one index card.
    const cards = page.locator('.index-card');
    await expect(cards).toHaveCount(2, { timeout: 5_000 });
  });

  test('toggle turns the corkboard off again with folder selected', async ({ page }) => {
    await page.locator('.binder-node', { hasText: folderTitle }).first().click();
    await corkboardBtn(page).click();
    await expect(page.locator('.corkboard-canvas')).toBeVisible();

    // Toggle off.
    await corkboardBtn(page).click();
    await expect(page.locator('.corkboard')).not.toBeVisible({ timeout: 3_000 });
  });

});

test.describe('Corkboard toggle-off regression', () => {

  // Regression test for: "Corkboard toggle can't be turned off without a folder selected"
  // The bug: corkboard button was DISABLED when !corkboardActive — but it was ALSO disabled
  // when corkboardActive=true and a non-folder node was active, preventing turn-off.
  // After the fix: when corkboard IS active, the button is always enabled (can be turned off).
  //
  // AppPage.jsx line 295:
  //   disabled={!corkboardActive && (!activeDocId || selectedDoc?.type !== 'folder'...)}
  // The key: `!corkboardActive && ...` — when corkboardActive=true, disabled=false regardless.

  test('corkboard can be toggled OFF after switching from folder to scene', async ({ page }) => {
    // Step 1: Enable corkboard with a folder selected.
    await page.locator('.binder-node', { hasText: folderTitle }).first().click();
    await corkboardBtn(page).click();
    await expect(page.locator('.corkboard-canvas')).toBeVisible({ timeout: 5_000 });

    // Step 2: Click a scene node. Corkboard remains ON.
    await page.locator('.binder-node', { hasText: sceneTitle }).first().click();

    // Step 3: The toggle button must be ENABLED (corkboardActive=true → disabled=false).
    // Before the fix, this button was also disabled here, trapping the user in corkboard view.
    const offBtn = page.locator('.toolbar-btn[title="Switch to editor view"]');
    await expect(offBtn).toBeEnabled({ timeout: 3_000 });

    // Step 4: Toggle off — this is the exact regression path.
    await offBtn.click();
    await expect(page.locator('.corkboard')).not.toBeVisible({ timeout: 3_000 });
  });

});
