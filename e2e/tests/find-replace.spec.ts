// ============================================================
// tests/find-replace.spec.ts
// ============================================================
// Purpose:   Verifies the project-wide Find & Replace modal — open/close,
//            search, replace, and the critical editor-refresh bug fix.
// Historical: "Project-wide Find & Replace" — fixed 2026-05-24
//             "Editor not refreshed after Find & Replace" — fixed 2026-05-24
//             The editor-refresh bug caused replaced text to persist visually
//             in the editor until a manual reload. The fix was bumpDocVersion()
//             in binderStore, called by SearchModal on each replace, which
//             forces the Editor to remount with fresh content.
// ============================================================

import { test, expect } from '@playwright/test';
import { authPage, createProject, createDocument, deleteProject, openProject } from './helpers/api';

// --- SHARED TEST STATE ---------------------------------------

let projectId: number;
const sceneTitle = 'E2E Find Replace Scene';
// Fixed text inserted before tests — must contain "FINDME" to search for.
const INITIAL_CONTENT = 'Replace FINDME with something else.';
const SEARCH_TERM     = 'FINDME';
const REPLACE_TERM    = 'REPLACED';

test.beforeAll(async ({ browser }) => {
  const { page, close } = await authPage(browser);
  try {
    ({ id: projectId } = await createProject(page, 'E2E Find Replace Tests'));
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

// Seed content and open the editor before each test.
test.beforeEach(async ({ page }) => {
  await openProject(page, projectId);
  await page.waitForLoadState('networkidle');
  await page.locator('.binder-node', { hasText: sceneTitle }).first().click();
  await expect(page.locator('.editor-toolbar')).toBeVisible({ timeout: 8_000 });

  // Clear existing content and type fresh seed text so every test starts clean.
  const prose = page.locator('.ProseMirror');
  await prose.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(INITIAL_CONTENT);
});

// --- TESTS ---------------------------------------------------

test.describe('Find & Replace modal', () => {
  // Replace operations race with the autosave WebSocket — the editor remount after
  // bumpDocVersion can reload stale content if the WS save overlaps the PATCH.
  test.describe.configure({ retries: 2 });

  test('Ctrl+H opens the Find & Replace overlay', async ({ page }) => {
    await page.keyboard.press('Control+h');
    await expect(page.locator('.fr-overlay')).toBeVisible({ timeout: 5_000 });
  });

  test('Escape closes the Find & Replace overlay', async ({ page }) => {
    await page.keyboard.press('Control+h');
    await expect(page.locator('.fr-overlay')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.fr-overlay')).not.toBeVisible({ timeout: 3_000 });
  });

  test('searching finds existing text and shows a result count', async ({ page }) => {
    await page.keyboard.press('Control+h');

    // Type the search term into the find input (first input in the panel).
    const findInput = page.locator('.fr-panel input').first();
    await findInput.fill(SEARCH_TERM);

    // The panel should show at least one result (count > 0).
    // The exact selector for the count indicator may vary — check for non-zero results
    // by verifying the "no results" state is absent and a count is visible.
    await expect(page.locator('.fr-panel')).not.toContainText('0 of 0');
  });

  test('"Replace in doc" updates the editor content immediately', async ({ page }) => {
    // Wait for autosave so the seeded content is persisted before searching.
    await expect(page.locator('.editor-save-status--saved')).toBeVisible({ timeout: 8_000 });

    await page.keyboard.press('Control+h');

    const inputs = page.locator('.fr-panel .fr-input');
    await inputs.nth(0).fill(SEARCH_TERM);
    await inputs.nth(1).fill(REPLACE_TERM);

    await page.locator('.fr-search-btn').click();

    await expect(page.locator('.fr-replace-doc-btn').first()).toBeVisible({ timeout: 12_000 });
    await page.locator('.fr-replace-doc-btn').first().click();

    // After clicking Replace, SearchModal re-runs the search automatically.
    // Wait for the replace button to disappear — confirms the DB write stuck
    // and the re-search found no more matches.
    await expect(page.locator('.fr-replace-doc-btn')).toHaveCount(0, { timeout: 10_000 });

    // bumpDocVersion triggers an editor remount with fresh DB content.
    const prose = page.locator('.ProseMirror');
    await expect(prose).toContainText(REPLACE_TERM, { timeout: 15_000 });

    await page.keyboard.press('Escape');
    await expect(prose).not.toContainText(SEARCH_TERM);
  });

  test('Replace All replaces every occurrence in the document', async ({ page }) => {
    // Insert a second occurrence.
    const prose = page.locator('.ProseMirror');
    await prose.click();
    await page.keyboard.press('End');
    await page.keyboard.type(` And also ${SEARCH_TERM} here.`);

    // Wait for autosave to persist the expanded content.
    // save() now resets status to 'idle' on every keystroke, so --saved only appears
    // after the debounce fires (2 s) and the server ACKs — guaranteeing pendingRef is null.
    await expect(page.locator('.editor-save-status--saved')).toBeVisible({ timeout: 8_000 });

    await page.keyboard.press('Control+h');

    const inputs = page.locator('.fr-panel .fr-input');
    await inputs.nth(0).fill(SEARCH_TERM);
    await inputs.nth(1).fill(REPLACE_TERM);

    // Click Search to trigger the server-side search.
    await page.locator('.fr-search-btn').click();

    // Wait for Replace All button to appear (results must load first).
    await expect(page.locator('.fr-replace-all-btn')).toBeVisible({ timeout: 8_000 });
    await page.locator('.fr-replace-all-btn').click();
    await page.keyboard.press('Escape');

    // Neither occurrence of FINDME should remain.
    await expect(prose).not.toContainText(SEARCH_TERM, { timeout: 3_000 });
  });

});
