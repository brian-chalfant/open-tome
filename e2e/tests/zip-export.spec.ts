// ============================================================
// tests/zip-export.spec.ts
// ============================================================
// Purpose:   Verifies the ZIP archive export feature — the ⬇ ZIP
//            button in ProjectManager, the format-picker modal
//            (ZipExportModal), and the actual file download for
//            each supported format (TXT, RTF, DOCX).
// Feature:   Introduced in branch zip-archive-export (2026-05-28).
//            GET /api/projects/:id/archive?format=txt|rtf|docx
// ============================================================

import { test, expect, Page } from '@playwright/test';
import { authPage, createProject, createDocument, deleteProject, openProject } from './helpers/api';

// --- SHARED TEST STATE ---------------------------------------

let projectId: number;
const PROJECT_TITLE = 'E2E ZIP Export Tests';

// Creates a realistic project with a folder containing two scenes,
// plus a character doc and research doc — covers all binder node types.
test.beforeAll(async ({ browser }) => {
  const { page, close } = await authPage(browser);
  try {
    ({ id: projectId } = await createProject(page, PROJECT_TITLE));
    const { id: folderId } = await createDocument(page, projectId, 'folder',    'Chapter One');
    await createDocument(page, projectId, 'scene',     'Scene 1',    folderId);
    await createDocument(page, projectId, 'scene',     'Scene 2',    folderId);
    await createDocument(page, projectId, 'character', 'The Hero');
    await createDocument(page, projectId, 'research',  'World Notes');
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

// Every test starts with the project open and ProjectManager visible.
test.beforeEach(async ({ page }) => {
  await openProject(page, projectId);
  await page.locator('.binder-icon-btn[title="Manage projects"]').click();
  await expect(page.locator('.pm-overlay')).toBeVisible({ timeout: 5_000 });
});

// --- HELPERS -------------------------------------------------

// Click the ZIP button on the active project row and wait for the modal.
async function openZipModal(page: Page): Promise<void> {
  const row = page.locator('.pm-row--active');
  await row.locator('[title="Download as ZIP archive"]').click();
  await expect(page.locator('.ze-modal')).toBeVisible({ timeout: 5_000 });
}

// --- TESTS ---------------------------------------------------

test.describe('ZIP button in ProjectManager', () => {

  test('⬇ ZIP button is visible on the active project row', async ({ page }) => {
    await expect(
      page.locator('.pm-row--active [title="Download as ZIP archive"]'),
    ).toBeVisible();
  });

  test('clicking ⬇ ZIP opens the format-picker modal', async ({ page }) => {
    await page.locator('.pm-row--active [title="Download as ZIP archive"]').click();
    await expect(page.locator('.ze-modal')).toBeVisible({ timeout: 5_000 });
  });

});

test.describe('ZipExportModal format picker', () => {

  // Open the modal before each test in this block.
  test.beforeEach(async ({ page }) => {
    await openZipModal(page);
  });

  test('shows three format options: TXT, RTF, DOCX', async ({ page }) => {
    const options = page.locator('.ze-format-option');
    await expect(options).toHaveCount(3);
    // Verify exact label text for each pill.
    await expect(options.nth(0)).toContainText('TXT');
    await expect(options.nth(1)).toContainText('RTF');
    await expect(options.nth(2)).toContainText('DOCX');
  });

  test('TXT is selected by default', async ({ page }) => {
    await expect(page.locator('.ze-format-option--active')).toContainText('TXT');
  });

  test('clicking RTF makes it the active format', async ({ page }) => {
    await page.locator('.ze-format-option', { hasText: 'RTF' }).click();
    await expect(page.locator('.ze-format-option--active')).toContainText('RTF');
  });

  test('clicking DOCX makes it the active format', async ({ page }) => {
    await page.locator('.ze-format-option', { hasText: 'DOCX' }).click();
    await expect(page.locator('.ze-format-option--active')).toContainText('DOCX');
  });

  test('Cancel button closes the modal', async ({ page }) => {
    await page.locator('.ze-btn--secondary').click();
    await expect(page.locator('.ze-modal')).not.toBeVisible({ timeout: 3_000 });
  });

  test('close button (✕) dismisses the modal', async ({ page }) => {
    await page.locator('.ze-close').click();
    await expect(page.locator('.ze-modal')).not.toBeVisible({ timeout: 3_000 });
  });

  test('clicking the backdrop dismisses the modal', async ({ page }) => {
    // Click at the top-left corner of the overlay, well outside the centered modal card.
    await page.locator('.ze-overlay').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.ze-modal')).not.toBeVisible({ timeout: 3_000 });
  });

});

test.describe('ZIP download', () => {

  // Open the modal before each test in this block.
  test.beforeEach(async ({ page }) => {
    await openZipModal(page);
  });

  test('Download ZIP button with TXT format triggers a file download', async ({ page }) => {
    // TXT is already selected by default — capture the download event.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.ze-btn--primary').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.zip$/i);
  });

  test('downloaded filename follows the {project-name}-YYYY-MM-DD.zip pattern', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.ze-btn--primary').click(),
    ]);
    // Server converts the title to kebab-case: "E2E ZIP Export Tests" → "e2e-zip-export-tests"
    expect(download.suggestedFilename()).toMatch(
      /^e2e-zip-export-tests-\d{4}-\d{2}-\d{2}\.zip$/i,
    );
  });

  test('RTF format download produces a .zip file', async ({ page }) => {
    await page.locator('.ze-format-option', { hasText: 'RTF' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.ze-btn--primary').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.zip$/i);
  });

  test('DOCX format download produces a .zip file', async ({ page }) => {
    await page.locator('.ze-format-option', { hasText: 'DOCX' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.ze-btn--primary').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.zip$/i);
  });

  test('modal closes after download completes', async ({ page }) => {
    await Promise.all([
      page.waitForEvent('download'),
      page.locator('.ze-btn--primary').click(),
    ]);
    await expect(page.locator('.ze-modal')).not.toBeVisible({ timeout: 5_000 });
  });

});
