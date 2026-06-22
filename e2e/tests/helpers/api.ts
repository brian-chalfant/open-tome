// ============================================================
// tests/helpers/api.ts
// ============================================================
// Purpose:   Shared helpers for creating and cleaning up E2E test data.
//            Uses page.request (carries session cookies from storageState)
//            to call the REST API directly — no UI-based fixture setup needed.
// Used by:   All spec files in tests/
// Notes:     BASE_URL must point to the Vite dev server (port 5173) so that
//            API calls go through Vite's /api proxy and carry the right cookies.
//            Calling localhost:3001 directly would still work (cookies are
//            domain-scoped, not port-scoped) but the proxy path is the canonical one.
// ============================================================

import { Browser, Page } from '@playwright/test';
import path from 'path';

export const BASE_URL  = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
// Absolute path to the saved storageState — used in beforeAll/afterAll
// contexts that need authenticated page.request calls.
export const AUTH_FILE = path.resolve(__dirname, '../../.auth/user.json');

// --- API HELPERS ---------------------------------------------

export async function createProject(page: Page, title: string): Promise<{ id: number }> {
  const res = await page.request.post(`${BASE_URL}/api/projects`, { data: { title } });
  if (!res.ok()) throw new Error(`createProject ${res.status()}: ${await res.text()}`);
  return res.json();
}

export async function createDocument(
  page: Page,
  projectId: number,
  type: 'scene' | 'folder' | 'research' | 'character',
  title: string,
  parentId?: number,
): Promise<{ id: number }> {
  const res = await page.request.post(`${BASE_URL}/api/projects/${projectId}/documents`, {
    data: { title, type, parent_id: parentId ?? null },
  });
  if (!res.ok()) throw new Error(`createDocument ${res.status()}: ${await res.text()}`);
  return res.json();
}

export async function deleteProject(page: Page, projectId: number): Promise<void> {
  await page.request.delete(`${BASE_URL}/api/projects/${projectId}`);
}

// --- NAVIGATION HELPERS --------------------------------------

// Navigate directly to /app/:projectId — AppPage reads the URL param and activates
// the matching project once the project list has loaded. This is more reliable than
// driving the custom picker UI (no selector fragility, no race with HMR).
// Waits for the binder tree to confirm the project loaded.
export async function openProject(page: Page, projectId: number): Promise<void> {
  await page.goto(`/app/${projectId}`);
  await page.waitForLoadState('networkidle');
  await page.locator('.binder-tree').waitFor({ state: 'visible', timeout: 10_000 });
}

// --- CONTEXT HELPERS -----------------------------------------

// Create a temporary authenticated Page in beforeAll/afterAll (which don't have the
// `page` fixture). Caller must close the returned context when done.
export async function authPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx  = await browser.newContext({ storageState: AUTH_FILE });
  const page = await ctx.newPage();
  // Navigate to the app and wait for network idle so the session is fully
  // established before any page.request API calls.
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  return { page, close: () => ctx.close() };
}
