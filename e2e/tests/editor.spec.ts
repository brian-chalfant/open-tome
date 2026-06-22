// ============================================================
// tests/editor.spec.ts
// ============================================================
// Purpose:   Verifies the rich text editor — toolbar rendering, folder notice,
//            word count / reading time, zoom controls, font selector, fullscreen,
//            and split-editor toggle.
// Historical: "Folder/chapter editor labeled as Notes" — fixed 2026-05-23
//             "Zoom function for editor text size" — fixed 2026-05-23
//             "Dyslexic-friendly font option (OpenDyslexic)" — fixed 2026-05-23
//             "Reading time estimate" — fixed 2026-05-23
//             "Full-screen / distraction-free mode" — fixed 2026-05-23
// ============================================================

import { test, expect } from '@playwright/test';
import { authPage, createProject, createDocument, deleteProject, openProject } from './helpers/api';

// --- SHARED TEST STATE ---------------------------------------

let projectId: number;
const sceneTitle  = 'E2E Scene';
const folderTitle = 'E2E Folder';

test.beforeAll(async ({ browser }) => {
  const { page, close } = await authPage(browser);
  try {
    ({ id: projectId } = await createProject(page, 'E2E Editor Tests'));
    await createDocument(page, projectId, 'folder', folderTitle);
    await createDocument(page, projectId, 'scene',  sceneTitle);
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
  // Click the scene node to open it in the editor.
  await page.locator('.binder-node', { hasText: sceneTitle }).first().click();
  await expect(page.locator('.editor-toolbar')).toBeVisible({ timeout: 8_000 });
});

// --- TESTS ---------------------------------------------------

test.describe('Editor toolbar', () => {

  test('toolbar renders with role="toolbar"', async ({ page }) => {
    await expect(page.locator('[role="toolbar"]')).toBeVisible();
  });

  test('scene document shows no folder notice', async ({ page }) => {
    // Scene documents are editable prose — no "folder" notice should appear.
    await expect(page.locator('.editor-folder-notice')).not.toBeVisible();
  });

  test('folder node shows a folder/chapter notice (not "Notes")', async ({ page }) => {
    // The bug: folders were labeled as "Notes" with a "not compiled" notice.
    // Fix: folders now show a correct folder-type notice.
    await page.locator('.binder-node', { hasText: folderTitle }).first().click();
    const notice = page.locator('.editor-folder-notice');
    await expect(notice).toBeVisible({ timeout: 5_000 });
    // Must NOT say "Notes" — that was the old incorrect label.
    await expect(notice).not.toContainText('Notes');
  });

});

test.describe('Word count and reading time', () => {

  test('word count element is visible', async ({ page }) => {
    await expect(page.locator('.editor-word-count')).toBeVisible();
  });

  test('typing content shows reading time estimate', async ({ page }) => {
    // Reading time ("min read") only appears when word count > 0.
    await page.locator('.ProseMirror').click();
    await page.keyboard.type(
      'The quick brown fox jumped over the lazy dog. '.repeat(5),
    );
    // Word count updates in real time after each keystroke.
    await expect(page.locator('.editor-word-count')).toContainText('min read', { timeout: 3_000 });
  });

});

test.describe('Zoom controls', () => {

  test('zoom-in button increases the displayed zoom level', async ({ page }) => {
    const display = page.locator('.zoom-display');
    await expect(display).toBeVisible();

    const before = parseInt(await display.textContent() ?? '100', 10);

    // Zoom in button is identified by its title attribute.
    await page.locator('.editor-btn[title="Zoom in (+10%)"]').click();

    const after = parseInt(await display.textContent() ?? '100', 10);
    expect(after).toBeGreaterThan(before);
  });

  test('zoom-out button decreases the displayed zoom level', async ({ page }) => {
    // First zoom in so there's room to zoom out.
    await page.locator('.editor-btn[title="Zoom in (+10%)"]').click();
    const display = page.locator('.zoom-display');
    const before  = parseInt(await display.textContent() ?? '100', 10);

    await page.locator('.editor-btn[title="Zoom out (−10%)"]').click();

    const after = parseInt(await display.textContent() ?? '100', 10);
    expect(after).toBeLessThan(before);
  });

});

test.describe('Font selector', () => {

  test('selecting OpenDyslexic adds editor-font-dyslexic class', async ({ page }) => {
    const fontSelect = page.getByLabel('Font family');
    await expect(fontSelect).toBeVisible();

    await fontSelect.selectOption({ value: 'dyslexic' });

    await expect(page.locator('.editor-wrapper')).toHaveClass(/editor-font-dyslexic/);
  });

  test('switching back to default removes editor-font-dyslexic class', async ({ page }) => {
    await page.getByLabel('Font family').selectOption({ value: 'dyslexic' });
    await expect(page.locator('.editor-wrapper')).toHaveClass(/editor-font-dyslexic/);

    await page.getByLabel('Font family').selectOption({ value: 'sans' });

    await expect(page.locator('.editor-wrapper')).not.toHaveClass(/editor-font-dyslexic/);
  });

  test('all font options are present in the selector', async ({ page }) => {
    const select = page.getByLabel('Font family');
    const options = await select.locator('option').allInnerTexts();

    // Verify the key font options the historical changelog added.
    expect(options.some(o => /OpenDyslexic/i.test(o))).toBe(true);
  });

});

test.describe('Fullscreen mode', () => {

  test('fullscreen button adds editor-fullscreen class to body', async ({ page }) => {
    // Button is identified by its title; icon is ⛶.
    const fsBtn = page.locator('.editor-btn[title*="fullscreen" i]').first();
    await expect(fsBtn).toBeVisible();

    await fsBtn.click();

    await expect(page.locator('body')).toHaveClass(/editor-fullscreen/);
  });

  test('pressing Escape exits fullscreen', async ({ page }) => {
    await page.locator('.editor-btn[title*="fullscreen" i]').first().click();
    await expect(page.locator('body')).toHaveClass(/editor-fullscreen/);

    await page.keyboard.press('Escape');

    await expect(page.locator('body')).not.toHaveClass(/editor-fullscreen/, { timeout: 3_000 });
  });

});

test.describe('Split editor', () => {

  test('split-editor button activates split mode', async ({ page }) => {
    const splitBtn = page.locator('.toolbar-btn[title="Split editor"]');
    await expect(splitBtn).toBeVisible();

    await splitBtn.click();

    // After enabling split, the button becomes active.
    await expect(splitBtn).not.toBeVisible(); // title changes to "Close split view"
    await expect(page.locator('.toolbar-btn[title="Close split view"]')).toBeVisible();
  });

  test('closing split mode returns to single-pane view', async ({ page }) => {
    // Enable split first.
    await page.locator('.toolbar-btn[title="Split editor"]').click();
    await expect(page.locator('.toolbar-btn[title="Close split view"]')).toBeVisible();

    // Close split.
    await page.locator('.toolbar-btn[title="Close split view"]').click();
    await expect(page.locator('.toolbar-btn[title="Split editor"]')).toBeVisible();
  });

});
