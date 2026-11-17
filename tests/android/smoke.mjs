// Conecta Playwright (API _android, vía adb) al WebView real de la app Android y verifica los flujos principales.
// Las capturas se toman con `adb screencap` (pantalla real del emulador, incluida la UI nativa).
import { _android as android } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [phase, out] = process.argv.slice(2);
const shot = (name) => writeFileSync(`${out}/android-${name}.png`, execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => {
  if (!c) throw new Error(`FALLO: ${m}`);
  console.log(`✓ ${m}`);
};

const [device] = await android.devices();
if (!device) throw new Error('No hay dispositivo Android conectado por adb');
const webview = await device.webView({ pkg: 'app.quotemaker.mobile' }, { timeout: 60_000 });
const page = await webview.page();
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
  await page.getByRole('heading', { name: 'Primeros pasos' }).waitFor({ state: 'detached', timeout: 60_000 });
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
  let top = '';
  const chooser = /ChooserActivity|ResolverActivity|intentresolver/i;
  for (let i = 0; i < 30 && !chooser.test(top); i++) {
    await sleep(500);
    const acts = execFileSync('adb', ['shell', 'dumpsys', 'activity', 'activities']).toString();
    top = (acts.match(/(topResumedActivity|mResumedActivity|ResumedActivity)[^\n]*/g) ?? []).join(' | ');
  }
  console.log(`Actividad en primer plano: ${top}`);
  shot('13-sharesheet-pdf');
  assert(chooser.test(top), 'se abrió el selector nativo de Android para compartir el PDF');
  execFileSync('adb', ['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
  await sleep(1500);
  const cached = execFileSync('adb', ['shell', 'run-as', 'app.quotemaker.mobile', 'ls', '-l', 'cache']).toString();
  console.log(cached);
  assert(/Presupuesto-TA-00001\.pdf/.test(cached), 'el PDF existe en la caché privada con nombre sin datos sensibles');
  const size = Number(cached.match(/\s(\d+)\s+\S+\s+\S+\s+Presupuesto-TA-00001\.pdf/)?.[1] ?? 0);
  assert(size > 1000, `el PDF tiene contenido (${size} bytes)`);
  const pdfBytes = execFileSync('adb', ['exec-out', 'run-as', 'app.quotemaker.mobile', 'cat', 'cache/Presupuesto-TA-00001.pdf'], { maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(`${out}/android-presupuesto.pdf`, pdfBytes);
  // El PDF generado EN el dispositivo tampoco filtra datos internos
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(pdfBytes), isEvalSupported: false }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) text += (await (await pdf.getPage(i)).getTextContent()).items.map((it) => it.str ?? '').join(' ');
  const meta = JSON.stringify((await pdf.getMetadata()).info).toLowerCase();
  assert(text.includes('Estudio Norte Arquitectura') && text.includes('TOTAL'), 'el PDF generado en Android tiene el contenido comercial');
  for (const f of ['costo', 'margen', 'markup', 'ganancia', 'proveedor', 'maderera', 'combustible', 'peaje', 'paga a 30']) {
    assert(!text.toLowerCase().includes(f) && !meta.includes(f), `el PDF generado en Android no contiene "${f}"`);
  }
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
await device.close();
