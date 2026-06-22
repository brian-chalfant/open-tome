// ============================================================
// tests/targets.spec.ts
// ============================================================
// Purpose:   Verifies the Writing Targets widget — visibility, goal input,
//            and progress bar rendering.
// Historical: Writing targets were part of the core editor feature set.
//             The widget shows session and project word-count goals.
// ============================================================

import { test, expect } from '@playwright/test';
import { authPage, createProject, createDocument, deleteProject, openProject } from './helpers/api';

// --- SHARED TEST STATE ---------------------------------------

let projectId: number;
const sceneTitle = 'E2E Targets Scene';

test.beforeAll(async ({ browser }) => {
  const { page, close } = await authPage(browser);
  try {
    ({ id: projectId } = await createProject(page, 'E2E Targets Tests'));
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
  await page.locator('.binder-node', { hasText: sceneTitle }).first().click();
  await expect(page.locator('.editor-toolbar')).toBeVisible({ timeout: 8_000 });

  // Ensure the targets panel is open — click the topbar targets button if needed.
  const targetsWidget = page.locator('.targets-widget');
  if (!(await targetsWidget.isVisible())) {
    await page.locator('.toolbar-btn[title="Show writing targets"]').click();
  }
});

// --- TESTS ---------------------------------------------------

test.describe('Writing targets widget', () => {

  test('targets widget is visible after toggling on', async ({ page }) => {
    await expect(page.locator('.targets-widget')).toBeVisible({ timeout: 5_000 });
  });

  test('targets toggle button hides the widget', async ({ page }) => {
    await expect(page.locator('.targets-widget')).toBeVisible();

    await page.locator('.toolbar-btn[title="Hide targets"]').click();
    await expect(page.locator('.targets-widget')).not.toBeVisible({ timeout: 3_000 });
  });

  test('goal button opens the goal input', async ({ page }) => {
    const goalBtn = page.locator('.targets-goal-btn').first();
    await expect(goalBtn).toBeVisible();

    await goalBtn.click();

    // A numeric input for setting the word-count goal should appear.
    await expect(page.locator('.targets-goal-input')).toBeVisible({ timeout: 3_000 });
  });

  test('setting a word-count goal shows the progress bar', async ({ page }) => {
    await page.locator('.targets-goal-btn').first().click();

    const goalInput = page.locator('.targets-goal-input').first();
    await goalInput.fill('500');
    await goalInput.press('Enter');

    // The bar track appears once a goal is set. There are two bar tracks (draft + session);
    // use the session bar which is always present without --no-goal modifier.
    await expect(page.locator('.targets-bar-track:not(.targets-bar-track--no-goal)')).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('.targets-bar-fill')).toBeVisible();
  });

  test('typing in the editor increases the word count in targets', async ({ page }) => {
    // Set a goal to make the progress bar visible.
    await page.locator('.targets-goal-btn').first().click();
    await page.locator('.targets-goal-input').first().fill('1000');
    await page.locator('.targets-goal-input').first().press('Enter');

    // Type some words and check the bar fill updates.
    await page.locator('.ProseMirror').click();
    await page.keyboard.type('One two three four five six seven eight nine ten. '.repeat(3));

    // The bar fill should have a width > 0 (progress has been made).
    await expect(page.locator('.targets-bar-fill')).toHaveCSS('width', /[1-9]\d*px/, { timeout: 3_000 });
  });

});
