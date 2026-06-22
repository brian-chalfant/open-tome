/**
 * Post-build prerender script.
 * Snapshots public routes to static HTML so per-route meta, JSON-LD, and body content
 * are present before JS executes — required for social scrapers and non-JS crawlers.
 *
 * Usage: run automatically via `npm run build` (vite build && node scripts/prerender.mjs)
 * or standalone via `npm run prerender` (dist/ must already exist).
 */

import puppeteer from 'puppeteer';
import { preview } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(__dirname, '..', 'dist');

const ROUTES = [
  '/',
  '/help',
];

const RENDER_READY_SELECTOR = 'html[data-prerendered="true"]';
const RENDER_TIMEOUT_MS = 15000;
const PREVIEW_PORT = 4173;

async function run() {
  const server = await preview({
    preview: { port: PREVIEW_PORT, strictPort: true },
  });

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let failed = 0;

  for (const route of ROUTES) {
    const page = await browser.newPage();
    try {
      await page.goto(`http://localhost:${PREVIEW_PORT}${route}`);
      await page.waitForSelector(RENDER_READY_SELECTOR, { timeout: RENDER_TIMEOUT_MS });
      const html = await page.content();

      const dir = route === '/' ? DIST : join(DIST, ...route.slice(1).split('/'));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'index.html'), html, 'utf8');
      console.log(`✓ prerendered: ${route}`);
    } catch (err) {
      console.error(`✗ prerender failed for ${route}:`, err.message);
      failed++;
    } finally {
      await page.close();
    }
  }

  await browser.close();
  server.httpServer.close();

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Prerender script fatal error:', err);
  process.exit(1);
});
