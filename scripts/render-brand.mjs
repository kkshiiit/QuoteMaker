// Rasteriza los SVG de marca a PNG con Chromium (Playwright). Sin servicios externos.
// Uso: node scripts/render-brand.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const brand = (f) => readFileSync(new URL(`../docs/brand/${f}`, import.meta.url), 'utf8');
const jobs = [
  ['logo-mark.svg', 'public/icons/icon-192.png', 192, 192],
  ['logo-mark.svg', 'public/icons/icon-512.png', 512, 512],
  ['icon-maskable.svg', 'public/icons/icon-maskable-512.png', 512, 512],
  ['logo-mark.svg', 'public/apple-touch-icon.png', 180, 180],
  ['logo-mark.svg', 'docs/brand/png/favicon-32.png', 32, 32],
  ['logo-mark.svg', 'docs/brand/png/favicon-16.png', 16, 16],
  ['logo-mark.svg', 'docs/brand/png/logo-mark-1024.png', 1024, 1024],
  ['logo-horizontal-light.svg', 'docs/brand/png/logo-horizontal-light.png', 1200, 256],
  ['logo-horizontal-dark.svg', 'docs/brand/png/logo-horizontal-dark.png', 1200, 256, '#121314'],
  ['icon-maskable.svg', 'docs/brand/png/android-foreground-432.png', 432, 432],
];
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [src, out, w, h, bg] of jobs) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:${bg ?? 'transparent'}">${brand(src).replace('<svg ', `<svg width="${w}" height="${h}" `)}</body></html>`);
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: !bg, clip: { x: 0, y: 0, width: w, height: h } });
  console.log('ok', out);
}
// Splash Android (2732×2732, marca centrada sobre fondo de la app)
await page.setViewportSize({ width: 2732, height: 2732 });
await page.setContent(`<html><body style="margin:0;background:#f6f5f1;display:grid;place-items:center;height:2732px">${brand('logo-mark.svg').replace('<svg ', '<svg width="560" height="560" ')}</body></html>`);
mkdirSync('docs/brand/png', { recursive: true });
await page.screenshot({ path: 'docs/brand/png/splash-2732.png' });
await page.setContent(`<html><body style="margin:0;background:#121314;display:grid;place-items:center;height:2732px">${brand('logo-mark-dark.svg').replace('<svg ', '<svg width="560" height="560" ')}</body></html>`);
await page.screenshot({ path: 'docs/brand/png/splash-dark-2732.png' });
// Concepts board
await page.setViewportSize({ width: 900, height: 320 });
const card = (f, t) => `<figure style="margin:0;text-align:center;font:600 16px system-ui"><div style="width:180px;height:180px;margin:auto">${brand(f).replace('<svg ', '<svg width="180" height="180" ')}</div><figcaption style="margin-top:12px">${t}</figcaption></figure>`;
await page.setContent(`<html><body style="margin:0;background:#fff;display:flex;justify-content:space-around;align-items:center;height:320px">${card('concept-a-casa.svg', 'A · Casa con puerta en arco (elegido)')}${card('concept-b-monograma.svg', 'B · Monograma CH')}${card('concept-c-sillon.svg', 'C · Sillón')}</body></html>`);
await page.screenshot({ path: 'docs/brand/png/concepts.png' });
await browser.close();
