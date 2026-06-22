// ============================================================
// tests/landing.spec.ts
// ============================================================
// Purpose:   Verifies the public landing page renders correctly.
//            Tests run in a FRESH unauthenticated context so we confirm
//            the page is accessible without logging in.
// ============================================================

import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Landing page', () => {

  test('page title contains the brand name', async ({ page }) => {
    await page.goto('/');

    const title = await page.title();
    expect(title).toMatch(/Tome/i);
  });

  test('"Open Your Tome" nav link is fully visible and not clipped', async ({ page }) => {
    await page.goto('/');

    const link = page.locator('.landing-nav-links a', { hasText: /Open Your Tome/i });
    await expect(link).toBeVisible();

    const box      = await link.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  });

});
