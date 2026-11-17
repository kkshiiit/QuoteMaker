// Genera íconos (mipmap) y splash de Android desde los SVG de marca. Uso: node scripts/render-android.mjs
import { chromium } from 'playwright';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const RES = 'android/app/src/main/res';
const svg = (f) => readFileSync(`docs/brand/${f}`, 'utf8');
const mark = svg('logo-mark.svg');
const markInner = mark.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const browser = await chromium.launch();
const page = await browser.newPage();
async function render(html, w, h, out, transparent = false) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;${transparent ? '' : 'background:#f6f5f1;'}">${html}</body></html>`);
  await page.screenshot({ path: out, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
}
for (const [d, k] of Object.entries(densities)) {
  const legacy = Math.round(48 * k);
  const fg = Math.round(108 * k);
  const dir = `${RES}/mipmap-${d}`;
  await render(`<svg width="${legacy}" height="${legacy}" viewBox="0 0 64 64">${markInner}</svg>`, legacy, legacy, `${dir}/ic_launcher.png`, true);
  await render(`<svg width="${legacy}" height="${legacy}" viewBox="0 0 64 64"><clipPath id="c"><circle cx="32" cy="32" r="32"/></clipPath><g clip-path="url(#c)"><rect width="64" height="64" fill="#1f6f43"/><g transform="translate(6.4 6.4) scale(0.8)">${markInner}</g></g></svg>`, legacy, legacy, `${dir}/ic_launcher_round.png`, true);
  // Foreground adaptativo: la marca ocupa la zona segura (66/108)
  const inner = markInner.replace(/<rect[^>]*\/>/, '');
  await render(`<svg width="${fg}" height="${fg}" viewBox="0 0 108 108"><g transform="translate(21 21) scale(1.03)">${inner}</g></svg>`, fg, fg, `${dir}/ic_launcher_foreground.png`, true);
}
// Splash: respeta tamaño de cada archivo existente
for (const dir of readdirSync(RES).filter((x) => x.startsWith('drawable'))) {
  const f = `${RES}/${dir}/splash.png`;
  if (!existsSync(f)) continue;
  const [w, h] = execFileSync('identify', ['-format', '%w %h', f]).toString().split(' ').map(Number);
  const s = Math.round(Math.min(w, h) * 0.28);
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:#f6f5f1;display:grid;place-items:center;width:${w}px;height:${h}px">${mark.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
  await page.screenshot({ path: f, clip: { x: 0, y: 0, width: w, height: h } });
}
await browser.close();
console.log('android resources ok');
