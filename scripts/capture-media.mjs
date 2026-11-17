// Capturas y GIFs REALES de la app en ejecución (build de producción + datos ficticios de ejemplo).
// Requiere `npm run build` y `npm run preview` (puerto 4173). Uso: node scripts/capture-media.mjs
import { chromium, devices } from 'playwright';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';

const BASE = process.env.QM_URL ?? 'http://localhost:4173';
const SHOTS = 'docs/media/screenshots';
const GIFS = 'docs/media/gifs';
const TMP = 'docs/media/.video-tmp';
mkdirSync(SHOTS, { recursive: true });
mkdirSync(GIFS, { recursive: true });
rmSync(TMP, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed(page) {
  await page.goto(BASE);
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((res) => {
      const r = indexedDB.deleteDatabase('quotemaker');
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
  });
  await page.goto(BASE);
  await page.reload();
  await page.getByRole('button', { name: 'Probar con datos de ejemplo' }).click();
  await page.getByRole('heading', { name: 'Hola, Taller Aurora' }).waitFor({ timeout: 30000 });
  await page.getByRole('heading', { name: 'Primeros pasos' }).waitFor({ state: 'detached', timeout: 30000 });
}
const go = async (page, hash) => {
  await page.goto(`${BASE}/#${hash}`);
  await page.locator('#page-title').waitFor();
  await sleep(500);
};

const browser = await chromium.launch();

// ---------- Capturas ----------
for (const [suffix, opts] of [
  ['escritorio', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }],
  ['movil', { ...devices['Pixel 7'], deviceScaleFactor: 2 }],
]) {
  const ctx = await browser.newContext({ ...opts, locale: 'es-AR' });
  const page = await ctx.newPage();
  await seed(page);
  const shot = async (name, full = false) => page.screenshot({ path: `${SHOTS}/${name}-${suffix}.png`, fullPage: full });
  await go(page, '/');
  await shot('01-inicio');
  await go(page, '/productos');
  await shot('02-productos');
  await page.getByRole('link', { name: /Mesa de roble/ }).click();
  await page.locator('#page-title').waitFor();
  await sleep(400);
  await shot('03-detalle-producto', suffix === 'escritorio');
  await go(page, '/costos/compras');
  await page.getByRole('link', { name: /Maderera/ }).first().click();
  await sleep(500);
  await shot('04-registro-compra', suffix === 'escritorio');
  await go(page, '/costos/gastos');
  await shot('05-costos-gastos');
  await page.getByRole('link', { name: /Combustible/ }).click();
  await page.getByText(/Desglose listo/).waitFor();
  await page.getByText(/Desglose listo/).scrollIntoViewIfNeeded();
  await sleep(300);
  await shot('06-distribucion-gastos');
  await go(page, '/costos/calculadora?producto=');
  await page.getByLabel('Producto (opcional)').selectOption({ label: 'Silla tapizada' });
  await sleep(400);
  await shot('07-calculadora-precios', suffix === 'escritorio');
  await go(page, '/clientes');
  await shot('08-clientes');
  await go(page, '/presupuestos');
  await shot('09-presupuestos');
  await page.getByRole('link', { name: /Lucía Fernández/ }).first().click();
  await page.getByTestId('quote-total').waitFor();
  await sleep(400);
  await shot('10-presupuesto', suffix === 'escritorio');
  await page.getByRole('button', { name: 'PDF y WhatsApp' }).click();
  await page.getByRole('article').waitFor();
  await sleep(400);
  await shot('11-vista-previa-documento', suffix === 'escritorio');
  if (suffix === 'escritorio') {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar PDF' }).click()]);
    await dl.saveAs(`${SHOTS}/presupuesto-ejemplo.pdf`);
  }
  await go(page, '/estadisticas');
  await shot('12-estadisticas');
  await go(page, '/personalizacion');
  await page.getByText('Terracota').click();
  await page.getByText('Oscuro', { exact: true }).click();
  await sleep(300);
  await shot('13-personalizacion-vista-previa');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await go(page, '/');
  await shot('14-inicio-oscuro-terracota');
  await ctx.close();
}

// ---------- GIFs (video real → GIF con ffmpeg) ----------
async function record(name, fn, opts = { viewport: { width: 1280, height: 800 } }) {
  const ctx = await browser.newContext({ ...opts, locale: 'es-AR', recordVideo: { dir: TMP, size: opts.viewport } });
  const page = await ctx.newPage();
  await seed(page);
  await go(page, '/');
  await fn(page);
  await sleep(800);
  const video = page.video();
  await ctx.close();
  const src = await video.path();
  const out = `${GIFS}/${name}.gif`;
  const { execFileSync: ex } = await import('node:child_process');
  ex('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '2.2', '-i', src, '-vf', 'fps=8,scale=760:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', out]);
  console.log('gif', out, Math.round(statSync(out).size / 1024), 'KB');
}
const type = async (loc, text) => {
  await loc.click();
  await loc.pressSequentially(text, { delay: 35 });
};

await record('01-navegacion', async (p) => {
  for (const l of ['Productos', 'Costos', 'Presupuestos', 'Clientes', 'Estadísticas', 'Inicio']) {
    await p.locator('nav.sidebar').getByRole('link', { name: l, exact: true }).click();
    await sleep(900);
  }
});
await record('02-crear-producto', async (p) => {
  await p.locator('nav.sidebar').getByRole('link', { name: 'Productos', exact: true }).click();
  await sleep(500);
  await p.getByRole('link', { name: 'Nuevo producto' }).click();
  await type(p.getByLabel('Nombre *'), 'Perchero de pared');
  await type(p.getByLabel('Descripción comercial'), 'Pino macizo, 5 ganchos');
  await type(p.getByLabel('Costo manual'), '12500');
  await sleep(400);
  await p.getByRole('button', { name: 'Guardar producto' }).click();
  await sleep(1200);
});
await record('03-cargar-gasto', async (p) => {
  await go(p, '/costos/gastos/nuevo');
  await p.getByLabel('Categoría').selectOption('Combustible');
  await type(p.getByLabel('Importe'), '15000');
  await type(p.getByLabel('Descripción'), 'Viaje al proveedor');
  await p.getByText('A una compra', { exact: true }).click();
  await p.getByLabel('Compra', { exact: true }).selectOption({ index: 1 });
  await sleep(800);
  await p.getByLabel('Distribuir').selectOption('value');
  await sleep(1200);
  await p.getByRole('button', { name: 'Confirmar y asignar' }).click();
  await sleep(1200);
});
await record('04-calcular-precio', async (p) => {
  await go(p, '/costos/calculadora');
  await p.getByLabel('Producto (opcional)').selectOption({ label: 'Mesa de roble 120 cm' });
  await sleep(800);
  await p.getByLabel('Margen objetivo').fill('');
  await type(p.getByLabel('Margen objetivo'), '45');
  await sleep(800);
  await p.getByLabel('Redondeo').selectOption('thousand');
  await sleep(1500);
});
await record('05-crear-presupuesto', async (p) => {
  await go(p, '/presupuestos');
  await p.getByRole('button', { name: 'Nuevo presupuesto' }).click();
  await sleep(500);
  await p.getByRole('dialog').getByRole('button', { name: /Café Las Palmas/ }).click();
  await sleep(800);
  await p.getByRole('button', { name: 'Agregar producto' }).click();
  await sleep(400);
  await p.getByRole('dialog').getByRole('button', { name: /Silla tapizada/ }).click();
  await p.getByLabel('Cant.').fill('');
  await type(p.getByLabel('Cant.'), '6');
  await sleep(600);
  await p.getByRole('button', { name: 'Guardar borrador' }).click();
  await sleep(600);
  await p.getByRole('button', { name: 'PDF y WhatsApp' }).click();
  await sleep(1800);
});
await record('06-personalizar-tema', async (p) => {
  await go(p, '/personalizacion');
  for (const t of ['Océano', 'Ciruela']) {
    await p.getByText(t).click();
    await sleep(700);
  }
  await p.getByText('Oscuro', { exact: true }).click();
  await sleep(800);
  await p.getByRole('button', { name: 'Aplicar' }).click();
  await sleep(1200);
});
await browser.close();
rmSync(TMP, { recursive: true, force: true });
console.log(readdirSync(SHOTS).length, 'capturas');
