/**
 * One-off script — generates client/public/og-image.png (1200×630)
 * Run from repo root: node scripts/generate-og-image.mjs
 */
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, '../client/public/og-image.png');

const html = `<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    width: 1200px;
    height: 630px;
    background: #0d0d1a;
    font-family: 'Georgia', 'Times New Roman', serif;
    overflow: hidden;
    position: relative;
    display: flex;
    align-items: center;
  }

  /* subtle radial gradient wash */
  body::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 30% 50%, #1a0a2e 0%, #0d0d1a 70%);
  }

  /* faint grid texture */
  body::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(180,30,60,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(180,30,60,0.04) 1px, transparent 1px);
    background-size: 40px 40px;
  }

  .layout {
    position: relative;
    z-index: 10;
    width: 100%;
    display: flex;
    align-items: center;
    padding: 0 80px;
    gap: 60px;
  }

  /* ── Logo ── */
  .logo-wrap {
    flex-shrink: 0;
  }

  .star {
    width: 160px;
    height: 160px;
    filter: drop-shadow(0 0 24px rgba(185, 28, 60, 0.7));
  }

  /* ── Text column ── */
  .text {
    flex: 1;
  }

  .wordmark {
    font-size: 72px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -1px;
    color: #f0e6d0;
    margin-bottom: 14px;
  }
  .wordmark em {
    font-style: normal;
    color: #b91c3c;
  }
  .wordmark .bracket {
    color: #c0a060;
  }

  .tagline {
    font-size: 26px;
    color: #9a8070;
    letter-spacing: 0.5px;
    margin-bottom: 32px;
    font-style: italic;
  }

  .features {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .pill {
    background: rgba(185,28,60,0.15);
    border: 1px solid rgba(185,28,60,0.35);
    color: #d4a0a8;
    font-size: 15px;
    padding: 5px 14px;
    border-radius: 20px;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    letter-spacing: 0.3px;
  }

  /* ── Right decoration ── */
  .deco {
    position: absolute;
    right: -120px;
    top: 50%;
    transform: translateY(-50%);
    width: 480px;
    height: 480px;
    opacity: 0.04;
    z-index: 1;
  }

  /* bottom rule */
  .rule {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, transparent, #b91c3c 30%, #c0a060 50%, #b91c3c 70%, transparent);
    z-index: 20;
  }

  .domain {
    position: absolute;
    bottom: 18px;
    right: 80px;
    z-index: 20;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 16px;
    color: rgba(160,140,120,0.6);
    letter-spacing: 1px;
  }
</style>
</head>
<body>

<!-- large faint star watermark -->
<svg class="deco" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <polygon points="100,0 112,88 200,100 112,112 100,200 88,112 0,100 88,88"
           fill="white"/>
</svg>

<div class="layout">
  <!-- Logo -->
  <div class="logo-wrap">
    <svg class="star" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <!-- outer star -->
      <polygon points="100,4 113,87 196,100 113,113 100,196 87,113 4,100 87,87"
               fill="#b91c3c"/>
      <!-- gold centre -->
      <circle cx="100" cy="100" r="13" fill="#c0a060"/>
    </svg>
  </div>

  <!-- Text -->
  <div class="text">
    <div class="wordmark">Insani<span class="bracket">[</span><em>Tome</em><span class="bracket">]</span>ium</div>
    <div class="tagline">Commit your Madness to the Page</div>
    <div class="features">
      <span class="pill">Binder Hierarchy</span>
      <span class="pill">Rich Text Editor</span>
      <span class="pill">Corkboard</span>
      <span class="pill">PDF · DOCX · ePub</span>
      <span class="pill">Self-Hosted · Free</span>
    </div>
  </div>
</div>

<div class="rule"></div>
<div class="domain">open-tome.com</div>

</body>
</html>`;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle0' });

await page.screenshot({ path: outPath, type: 'png' });
await browser.close();

console.log(`og-image.png written to ${outPath}`);
