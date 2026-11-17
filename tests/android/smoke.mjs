// Conecta Playwright al WebView real de la app Android (CDP) y verifica los flujos principales.
// Las capturas se toman con `adb screencap` (pantalla real del emulador, incluida la UI nativa).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [phase, out] = process.argv.slice(2);
const shot = (name) => writeFileSync(`${out}/android-${name}.png`, execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => {
  if (!c) throw new Error(`FALLO: ${m}`);
  console.log(`✓ ${m}`);
};

const browser = await chromium.connectOverCDP('http://localhost:9222');
const page = browser.contexts()[0].pages().find((p) => p.url().includes('localhost')) ?? browser.contexts()[0].pages()[0];
await page.waitForSelector('#page-title', { timeout: 30_000 });
const go = async (hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForSelector('#page-title');
  await sleep(700);
};
const noOverflow = async (where) => {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(o <= 1, `sin scroll horizontal en ${where} (${o}px)`);
};

if (phase === 'phase1') {
  assert((await page.evaluate(() => navigator.userAgent)).includes('Android'), 'se ejecuta dentro del WebView de Android');
  assert(await page.evaluate(() => !!window.Capacitor?.isNativePlatform?.()), 'Capacitor reporta plataforma nativa');
  shot('01-inicio-vacio');
  await page.getByRole('button', { name: 'Probar con datos de ejemplo' }).click();
  await page.getByRole('heading', { name: 'Hola, Taller Aurora' }).waitFor({ timeout: 30_000 });
  await sleep(800);
  shot('02-inicio');
  for (const [hash, name] of [
    ['#/productos', '03-productos'],
    ['#/costos/compras', '04-compras'],
    ['#/costos/gastos', '05-gastos'],
    ['#/costos/calculadora', '06-calculadora'],
    ['#/presupuestos', '07-presupuestos'],
    ['#/clientes', '08-clientes'],
    ['#/estadisticas', '09-estadisticas'],
    ['#/mas', '10-mas'],
  ]) {
    await go(hash);
    await noOverflow(hash);
    shot(name);
  }
  await go('#/presupuestos');
  await page.getByRole('link', { name: /Estudio Norte/ }).click();
  await page.waitForSelector('[data-testid="quote-total"]');
  await sleep(500);
  shot('11-presupuesto');
  await page.getByRole('button', { name: 'PDF y WhatsApp' }).click();
  await page.getByRole('article').waitFor();
  await sleep(500);
  shot('12-documento');
  // PDF real generado en el dispositivo y entregado al Sharesheet nativo de Android
  await page.getByRole('button', { name: 'Compartir PDF' }).click();
  let focus = '';
  for (let i = 0; i < 20 && !/Chooser|Resolver|intentresolver/i.test(focus); i++) {
    await sleep(500);
    focus = execFileSync('adb', ['shell', 'dumpsys', 'window', 'windows']).toString().match(/mCurrentFocus=.*$/m)?.[0] ?? '';
  }
  shot('13-sharesheet-pdf');
  assert(/Chooser|Resolver|intentresolver/i.test(focus), `se abrió el selector nativo para compartir el PDF (${focus.trim()})`);
  execFileSync('adb', ['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
  await sleep(1500);
  const cached = execFileSync('adb', ['shell', 'run-as', 'app.quotemaker.mobile', 'ls', '-l', 'cache']).toString();
  console.log(cached);
  assert(/Presupuesto-TA-00001\.pdf/.test(cached), 'el PDF existe en la caché privada con nombre sin datos sensibles');
  const size = Number(cached.match(/\s(\d+)\s+\S+\s+\S+\s+Presupuesto-TA-00001\.pdf/)?.[1] ?? 0);
  assert(size > 1000, `el PDF tiene contenido (${size} bytes)`);
  execFileSync('adb', ['shell', 'run-as', 'app.quotemaker.mobile', 'cp', 'cache/Presupuesto-TA-00001.pdf', '/data/local/tmp/qm.pdf']);
  execFileSync('adb', ['pull', '/data/local/tmp/qm.pdf', `${out}/android-presupuesto.pdf`]);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await go('#/personalizacion');
  await page.getByText('Oscuro', { exact: true }).click();
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await sleep(600);
  shot('14-personalizacion-oscuro');
  await page.getByText('Claro', { exact: true }).click();
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await go('#/');
}

if (phase === 'phase2') {
  await page.getByRole('heading', { name: 'Hola, Taller Aurora' }).waitFor({ timeout: 30_000 });
  console.log('✓ los datos persisten tras cerrar y reabrir la app (IndexedDB en el dispositivo)');
  await go('#/presupuestos');
  const n = await page.locator('ul.list > li').count();
  assert(n === 4, `4 presupuestos persistidos (${n})`);
  const accepted = await page.getByRole('link', { name: /Estudio Norte/ }).innerText();
  assert(/Aceptado/.test(accepted), 'el estado manual "Aceptado" persiste');
  shot('15-presupuestos-tras-reinicio');
}
await browser.close();
