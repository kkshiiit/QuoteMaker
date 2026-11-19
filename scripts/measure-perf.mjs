// Mide la app real (build de producción en `vite preview`, puerto 4173) con Chromium.
// Escenarios: escritorio sin limitación y móvil simulado (CPU 4× más lenta + red "Fast 3G").
// Uso: node scripts/measure-perf.mjs  → imprime JSON (documentado en docs/PERFORMANCE.md)
import { chromium, devices } from 'playwright';

const BASE = process.env.QM_URL ?? 'http://localhost:4173';
const browser = await chromium.launch();
const results = {};

async function measureLoad(label, ctxOpts, throttle) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    if (throttle) {
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    const t0 = Date.now();
    await page.goto(BASE, { waitUntil: 'load' });
    await page.locator('#page-title').waitFor();
    const interactive = Date.now() - t0;
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      const bytes = performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), 0) + (nav.transferSize || 0);
      return { domContentLoaded: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), fcp: Math.round(fcp?.startTime ?? -1), transferKB: Math.round(bytes / 1024) };
    });
    runs.push({ ...m, dashboardVisible: interactive });
    await ctx.close();
  }
  const median = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[1];
  results[label] = Object.fromEntries(Object.keys(runs[0]).map((k) => [k, median(k)]));
}

await measureLoad('carga_escritorio_sin_limite', { viewport: { width: 1366, height: 860 } }, false);
await measureLoad('carga_movil_cpu4x_fast3g', { ...devices['Pixel 7'] }, true);

// Memoria y listas grandes
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
await page.goto(BASE);
await page.locator('#page-title').waitFor();
// 2.000 productos y 1.000 presupuestos escritos directamente en IndexedDB (mismo esquema que la app)
await page.evaluate(async () => {
  const db = await new Promise((res) => {
    const r = indexedDB.open('quotemaker');
    r.onsuccess = () => res(r.result);
  });
  const now = new Date().toISOString();
  const tx = db.transaction(['products', 'quotes'], 'readwrite');
  for (let i = 0; i < 2000; i++) {
    tx.objectStore('products').put({ id: `perf-p${i}`, createdAt: now, updatedAt: now, name: `Producto de prueba ${String(i).padStart(4, '0')}`, description: '', sku: `P${i}`, categoryId: null, unit: 'u', supplierId: null, active: true, archived: false, image: null, unitWeight: '0', unitVolume: '0', currentCost: '1000.0000', costUpdatedAt: now, costSource: 'manual', manualCost: '1000', manualPrice: null, targetMarginPct: null, internalNotes: '' });
  }
  for (let i = 0; i < 1000; i++) {
    tx.objectStore('quotes').put({ id: `perf-q${i}`, createdAt: now, updatedAt: now, number: `PF-${i}`, customerId: null, customerSnapshot: { name: `Cliente ${i}`, phone: '', email: '', address: '', taxId: '' }, status: 'draft', issueDate: '2026-11-01', validUntil: '2026-11-15', items: Array.from({ length: 5 }, (_, k) => ({ id: `i${k}`, productId: null, description: 'x', unit: 'u', quantity: '2', unitPrice: '1500', discountPct: '0', unitCost: '1000' })), globalDiscountPct: '0', taxPct: '21', shippingCharged: '0', shippingCost: '0', conditions: '', commercialNotes: '', internalNotes: '', frozen: null, events: [] });
  }
  await new Promise((res) => (tx.oncomplete = res));
  db.close();
});
await page.reload();
await page.locator('#page-title').waitFor();
for (const [label, hash, sel] of [
  ['lista_2000_productos_ms', '#/productos', 'ul.catalog-grid > li'],
  ['lista_1000_presupuestos_ms', '#/presupuestos', 'ul.list > li'],
  ['inicio_con_1000_presupuestos_ms', '#/', '.kpi'],
]) {
  await page.goto(`${BASE}/#/informacion`);
  await page.locator('#page-title').waitFor();
  const t = Date.now();
  await page.evaluate((h) => (location.hash = h), hash);
  await page.locator(sel).first().waitFor({ timeout: 8000 }).catch(async (e) => {
    console.error((await page.locator('main').innerText()).slice(0, 400));
    throw e;
  });
  results[label] = Date.now() - t;
}
const cdp = await ctx.newCDPSession(page);
await cdp.send('HeapProfiler.collectGarbage');
const { metrics } = await cdp.send('Performance.getMetrics').catch(async () => {
  await cdp.send('Performance.enable');
  return cdp.send('Performance.getMetrics');
});
await cdp.send('Performance.enable');
const mm = (await cdp.send('Performance.getMetrics')).metrics;
results.heap_usado_MB_con_2000_productos_1000_presupuestos = Math.round((mm.find((x) => x.name === 'JSHeapUsedSize').value / 1048576) * 10) / 10;
void metrics;
console.log(JSON.stringify(results, null, 2));
await browser.close();
