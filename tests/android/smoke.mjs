// Conecta Playwright (API _android, vía adb) al WebView real de la app Android y verifica los flujos principales.
// Las capturas se toman con `adb screencap` (pantalla real del emulador, incluida la UI nativa).
import { _android as android } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [phase, out] = process.argv.slice(2);
const shot = (name) => writeFileSync(`${out}/android-${name}.png`, execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));
// Clics como eventos DOM: el cálculo de viewport de Playwright sobre el WebView de Android es
// inestable justo tras el arranque ("element is outside of the viewport"); se prueba la app, no el hit-testing.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => {
  if (!c) throw new Error(`FALLO: ${m}`);
  console.log(`✓ ${m}`);
};

const [device] = await android.devices();
if (!device) throw new Error('No hay dispositivo Android conectado por adb');
// Tras un arranque en frío el sistema puede recrear el WebView: siempre se toma el actual.
// El socket de depuración del WebView puede tardar en publicarse tras un arranque en frío:
// hasta 3 intentos, trayendo la actividad al frente entre uno y otro.
async function attach() {
  let last;
  for (let i = 1; i <= 3; i++) {
    try {
      const webview = await device.webView({ pkg: 'app.quotemaker.mobile' }, { timeout: 30_000 });
      const p = await webview.page();
      await p.waitForSelector('#page-title', { timeout: 30_000 });
      return p;
    } catch (e) {
      last = e;
      console.log(`No se encontró el WebView (intento ${i}/3): ${String(e).split('\n')[0]}`);
      execFileSync('adb', ['shell', 'am', 'start', '-n', 'app.quotemaker.mobile/.MainActivity']);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw last;
}
let page = await attach();
/** Ejecuta fn; si el WebView fue recreado («has been closed»), se reconecta y reintenta una vez. */
async function withPage(fn) {
  try {
    return await fn();
  } catch (e) {
    if (!/has been closed|Target page, context or browser has been closed/.test(String(e))) throw e;
    console.log('El WebView fue recreado por el sistema: reconectando…');
    await sleep(1500);
    page = await attach();
    return fn();
  }
}
/**
 * Espera a que la pantalla esté realmente pintada antes de una captura: título presente (y con el
 * texto esperado, si se indica), sin «Cargando…» y dos cuadros dibujados. El compositor del emulador
 * puede ir detrás del DOM, por eso queda además una pausa corta.
 */
const settle = async (title) => {
  await page.waitForFunction(
    (src) => {
      const t = document.querySelector('#page-title');
      if (!t || (src && !new RegExp(src).test(t.textContent ?? ''))) return false;
      return !/Cargando…/.test(document.body.innerText);
    },
    title ? title.source : null,
    { timeout: 30_000 },
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await sleep(700);
};
const go = (hash) => withPage(() => goOnce(hash));
/** Comprueba que la página siga viva; si el sistema recreó el WebView, se reconecta. */
const ensurePage = async () => {
  try {
    await page.evaluate(() => 1);
  } catch (e) {
    if (!/closed/.test(String(e))) throw e;
    console.log('El WebView fue recreado por el sistema: reconectando…');
    await sleep(1500);
    page = await attach();
  }
};
const goOnce = async (hash) => {
  const prev = await page.evaluate(() => document.querySelector('#page-title')?.textContent ?? '');
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForFunction((h) => location.hash === h, hash);
  // Espera a que se monte la pantalla NUEVA (el título anterior sigue en el DOM durante la transición).
  await page
    .waitForFunction((p) => (document.querySelector('#page-title')?.textContent ?? '') !== p, prev, { timeout: 5_000 })
    .catch(() => {}); // misma pantalla (mismo título): no hay cambio que esperar
  await settle();
};
/** Desborde horizontal persistente: se mide hasta 3 veces; uno transitorio (reflow) no cuenta, uno real sí. */
const noOverflow = async (where) => {
  let o = 0;
  for (let i = 0; i < 3; i++) {
    o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (o <= 1) break;
    await sleep(700);
  }
  if (o > 1) {
    const culprits = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      return [...document.querySelectorAll('body *')]
        .filter((e) => e.getBoundingClientRect().right > vw + 1)
        .slice(0, 5)
        .map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')} (${Math.round(e.getBoundingClientRect().right)}px)`);
    });
    console.log(`Elementos que desbordan en ${where}: ${culprits.join(' | ')}`);
  }
  assert(o <= 1, `sin scroll horizontal en ${where} (${o}px)`);
};

if (phase === 'phase1') {
  assert((await page.evaluate(() => navigator.userAgent)).includes('Android'), 'se ejecuta dentro del WebView de Android');
  assert(await page.evaluate(() => !!window.Capacitor?.isNativePlatform?.()), 'Capacitor reporta plataforma nativa');
  shot('01-inicio-vacio');
  await page.getByRole('button', { name: 'Probar con datos de ejemplo' }).dispatchEvent('click');
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
    ['#/ventas', '16-ventas'],
    ['#/stock', '17-stock'],
    ['#/gastos', '18-panel-gastos'],
  ]) {
    // Navegar + medir como una unidad: si Android recrea el WebView en el medio, se reconecta y se repite.
    await withPage(async () => {
      await goOnce(hash);
      await noOverflow(hash);
    });
    shot(name);
  }
  // Presupuesto → documento como una unidad: si Android recrea el WebView en el medio, se repite entero.
  await withPage(async () => {
    await goOnce('#/presupuestos');
    await page.getByRole('link', { name: /Estudio Norte/ }).dispatchEvent('click');
    await page.waitForSelector('[data-testid="quote-total"]');
    await settle(/^Presupuesto /);
    shot('11-presupuesto');
    await page.getByRole('button', { name: 'PDF y WhatsApp' }).dispatchEvent('click');
    await page.getByRole('article').waitFor();
    await settle(/^Documento /);
    shot('12-documento');
  });
  // PDF real generado en el dispositivo y entregado al Sharesheet nativo de Android
  await page.getByRole('button', { name: 'Compartir PDF' }).dispatchEvent('click');
  let top = '';
  const chooser = /ChooserActivity|ResolverActivity|intentresolver/i;
  for (let i = 0; i < 30 && !chooser.test(top); i++) {
    await sleep(500);
    const acts = execFileSync('adb', ['shell', 'dumpsys', 'activity', 'activities']).toString();
    top = (acts.match(/(topResumedActivity|mResumedActivity|ResumedActivity)[^\n]*/g) ?? []).join(' | ');
  }
  console.log(`Actividad en primer plano: ${top}`);
  await sleep(2500); // dejar que el selector termine de dibujarse
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
  // Al volver del selector nativo, Android puede recrear la actividad (y el WebView): reconectar.
  await ensurePage();
  await withPage(() => page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')));
  await go('#/personalizacion');
  await page.getByText('Oscuro', { exact: true }).dispatchEvent('click');
  await page.getByRole('button', { name: 'Aplicar' }).dispatchEvent('click');
  await sleep(600);
  shot('14-personalizacion-oscuro');
  await page.getByText('Claro', { exact: true }).dispatchEvent('click');
  await page.getByRole('button', { name: 'Aplicar' }).dispatchEvent('click');
  await go('#/');
}

if (phase === 'phase2') {
  await withPage(() => page.getByRole('heading', { name: 'Hola, Taller Aurora' }).waitFor({ timeout: 30_000 }));
  console.log('✓ los datos persisten tras cerrar y reabrir la app (IndexedDB en el dispositivo)');
  const n = await withPage(async () => {
    await go('#/presupuestos');
    await page.locator('ul.list > li').first().waitFor();
    return page.locator('ul.list > li').count();
  });
  assert(n === 4, `4 presupuestos persistidos (${n})`);
  const accepted = await withPage(() => page.getByRole('link', { name: /Estudio Norte/ }).innerText());
  assert(/Aceptado/.test(accepted), 'el estado manual "Aceptado" persiste');
  shot('15-presupuestos-tras-reinicio');
}
await device.close();
