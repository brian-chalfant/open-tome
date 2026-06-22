// ============================================================
// tests/binder.spec.ts
// ============================================================
// Purpose:   Verifies the Binder sidebar — tree rendering, node selection,
//            collapse/expand toggle, and right-click context menu.
// Historical: "Binder click left of node title didn't select" — fixed 2026-05-24
//             "Binder collapse/expand toggle added to desktop topbar" — fixed 2026-05-23
// ============================================================

import { test, expect } from '@playwright/test';
import { authPage, createProject, createDocument, deleteProject, openProject } from './helpers/api';

// --- SHARED TEST STATE ---------------------------------------

let projectId: number;
let sceneTitle  = 'E2E Scene Node';
let folderTitle = 'E2E Folder Node';

test.beforeAll(async ({ browser }) => {
  const { page, close } = await authPage(browser);
  try {
    ({ id: projectId } = await createProject(page, 'E2E Binder Tests'));
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

// Each test navigates fresh so state from previous tests doesn't bleed.
test.beforeEach(async ({ page }) => {
  await openProject(page, projectId);
});

// --- TESTS ---------------------------------------------------

test.describe('Binder tree', () => {

  test('renders tree nodes after project selection', async ({ page }) => {
    const tree = page.locator('.binder-tree');
    await expect(tree).toBeVisible();

    // New projects include default seed folders (Story, Notes) plus the two we
    // created in beforeAll — verify those specific nodes are present.
    await expect(page.locator('.binder-node', { hasText: sceneTitle }).first()).toBeVisible();
    await expect(page.locator('.binder-node', { hasText: folderTitle }).first()).toBeVisible();
  });

  test('clicking a node text selects it', async ({ page }) => {
    const sceneNode = page.locator('.binder-node', { hasText: sceneTitle }).first();
    await sceneNode.click();
    await expect(sceneNode).toHaveClass(/binder-node--active/);
  });

  test('clicking the icon area (left of title) also selects the node', async ({ page }) => {
    // The bug: only clicks on the title text triggered selection.
    // Fix: outer div of BinderNode also has an onClick handler.
    const folderNode = page.locator('.binder-node', { hasText: folderTitle }).first();

    // Click the very left side of the node (icon/padding area, not the title text).
    const box = await folderNode.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + 8, box!.y + box!.height / 2);

    await expect(folderNode).toHaveClass(/binder-node--active/);
  });

});

test.describe('Binder collapse / expand', () => {

  test('topbar collapse button hides the binder', async ({ page }) => {
    // Button title is "Hide binder" when the binder is currently shown.
    const collapseBtn = page.locator('.toolbar-btn[title="Hide binder"]');
    await expect(collapseBtn).toBeVisible();

    await collapseBtn.click();

    // The wrapper div gains binder-rail--collapsed, which sets binder width to 0.
    await expect(page.locator('.binder-rail')).toHaveClass(/binder-rail--collapsed/);
  });

  test('topbar expand button shows the binder again', async ({ page }) => {
    // Collapse first.
    await page.locator('.toolbar-btn[title="Hide binder"]').click();
    await expect(page.locator('.binder-rail')).toHaveClass(/binder-rail--collapsed/);

    // The same button now has title "Show binder".
    const expandBtn = page.locator('.toolbar-btn[title="Show binder"]');
    await expandBtn.click();

    await expect(page.locator('.binder-rail')).not.toHaveClass(/binder-rail--collapsed/);
  });

});

test.describe('Binder context menu', () => {

  test('right-click on a node opens the context menu', async ({ page }) => {
    const node = page.locator('.binder-node', { hasText: sceneTitle }).first();
    await node.click({ button: 'right' });
    await expect(page.locator('.context-menu')).toBeVisible();
  });

  test('context menu contains Rename and Delete items', async ({ page }) => {
    const node = page.locator('.binder-node', { hasText: sceneTitle }).first();
    await node.click({ button: 'right' });

    const menu = page.locator('.context-menu');
    await expect(menu).toBeVisible();

    // Both core actions must be present.
    await expect(menu.locator('.context-menu-item', { hasText: /Rename/i })).toBeVisible();
    await expect(menu.locator('.context-menu-item', { hasText: /Delete/i })).toBeVisible();
  });

  test('Escape closes the context menu', async ({ page }) => {
    const node = page.locator('.binder-node', { hasText: sceneTitle }).first();
    await node.click({ button: 'right' });
    await expect(page.locator('.context-menu')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.context-menu')).not.toBeVisible();
  });

});
