/**
 * Calidad transversal con datos de ejemplo: accesibilidad (axe, WCAG 2.2 AA),
 * responsive (sin scroll horizontal), teclado, tema oscuro, offline (PWA) y persistencia.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { loadDemo, noHorizontalScroll } from './helpers';

const ROUTES = [
  '/',
  '/productos',
  '/productos/nuevo',
  '/costos/compras',
  '/costos/compras/nueva',
  '/costos/gastos',
  '/costos/gastos/nuevo',
  '/costos/calculadora',
  '/presupuestos',
  '/clientes',
  '/clientes/nuevo',
  '/proveedores',
  '/gastos-generales',
  '/gastos-generales/nuevo',
  '/categorias',
  '/estadisticas',
  '/personalizacion',
  '/configuracion',
  '/respaldo',
  '/nube',
  '/informacion',
  '/mas',
];

async function axe(page: import('@playwright/test').Page, where: string) {
  const r = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'] }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(summary, `violaciones axe en ${where}`).toEqual([]);
}

test.describe('con datos de ejemplo', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page);
  });

  test('todas las pantallas: axe sin violaciones y sin scroll horizontal', async ({ page }) => {
    test.setTimeout(180_000);
    for (const r of ROUTES) {
      await page.goto(`/#${r}`);
      await expect(page.locator('#page-title')).toBeVisible();
      await page.waitForTimeout(150);
      await axe(page, r);
      await noHorizontalScroll(page);
    }
    // Pantallas de detalle reales
    await page.goto('/#/presupuestos');
    await page.getByRole('link', { name: /Estudio Norte/ }).click();
    await expect(page.locator('#page-title')).toContainText('Presupuesto');
    await axe(page, 'detalle de presupuesto');
    await noHorizontalScroll(page);
    await page.getByRole('button', { name: 'PDF y WhatsApp' }).click();
    await expect(page.getByRole('article')).toBeVisible();
    await axe(page, 'documento');
    await noHorizontalScroll(page);
    await page.goto('/#/productos');
    await page.getByRole('link', { name: /Mesa de roble/ }).click();
    await axe(page, 'detalle de producto');
    await noHorizontalScroll(page);
  });

  test('tema oscuro también cumple contraste', async ({ page }) => {
    await page.goto('/#/personalizacion');
    await page.getByText('Oscuro', { exact: true }).click();
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    for (const r of ['/', '/productos', '/presupuestos', '/costos/calculadora']) {
      await page.goto(`/#${r}`);
      await expect(page.locator('#page-title')).toBeVisible();
      await axe(page, `${r} (oscuro)`);
    }
    // persiste tras recargar
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('paleta personalizada con contraste ajustado y vista previa antes de aplicar', async ({ page }) => {
    await page.goto('/#/personalizacion');
    const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent'));
    await page.getByLabel('Color personalizado').fill('#ffee00'); // amarillo: ilegible sin ajuste
    // aún no aplicado
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent'))).toBe(before);
    await expect(page.getByText(/Se ajustó el tono/)).toBeVisible();
    await page.getByRole('button', { name: 'Aplicar' }).click();
    const ratio = await page.evaluate(() => {
      const hex = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      const n = parseInt(hex.slice(1), 16);
      const ch = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const L = 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
      return (1 + 0.05) / (L + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('modo cliente oculta datos internos en pantalla', async ({ page }) => {
    await page.goto('/#/presupuestos');
    await page.getByRole('link', { name: /Estudio Norte/ }).click();
    await expect(page.getByTestId('quote-profit')).toBeVisible();
    await page.getByLabel('Más acciones del presupuesto').click();
    await page.getByRole('button', { name: /Ocultar datos internos/ }).click();
    await expect(page.getByTestId('quote-profit')).toHaveCount(0);
    await expect(page.getByText('Interno · no se comparte')).toHaveCount(0);
  });

  test('presupuesto enviado queda congelado aunque cambien los costos', async ({ page }) => {
    await page.goto('/#/presupuestos');
    await page.getByRole('link', { name: /Estudio Norte/ }).click();
    const total = await page.getByTestId('quote-total').innerText();
    const profit = await page.getByTestId('quote-profit').innerText();
    // Nueva compra mucho más cara de la mesa
    await page.goto('/#/costos/compras/nueva');
    await page.getByRole('button', { name: 'Agregar artículo' }).click();
    await page.getByLabel('Producto', { exact: true }).selectOption({ label: 'Mesa de roble 120 cm' });
    await page.getByLabel('Cantidad').fill('1');
    await page.getByLabel('Precio unit.').fill('999999');
    await page.getByRole('button', { name: 'Guardar compra' }).click();
    await expect(page.getByText('Compra guardada. Costos actualizados.')).toBeVisible();
    await page.goto('/#/presupuestos');
    await page.getByRole('link', { name: /Estudio Norte/ }).click();
    await expect(page.getByTestId('quote-total')).toHaveText(total);
    await expect(page.getByTestId('quote-profit')).toHaveText(profit);
  });
});

test('teclado: enlace para saltar al contenido y foco visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#page-title')).toBeVisible(); // la pantalla terminó de montarse
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Saltar al contenido' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe('none');
});

test('respeta prefers-reduced-motion', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4173/');
  const d = await page.evaluate(() => getComputedStyle(document.querySelector('.btn') ?? document.body).transitionDuration);
  expect(['0s', '1e-05s', '0.00001s']).toContain(d.split(',')[0]!.trim());
  await ctx.close();
});

test('offline: la app (PWA) abre sin conexión, guarda y conserva datos', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'Se verifica una vez');
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // ahora controlado por el service worker
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  // Precarga los fragmentos de las pantallas que se usarán offline
  for (const r of ['/clientes', '/clientes/nuevo']) {
    await page.goto(`/#${r}`);
    await expect(page.locator('#page-title')).toBeVisible();
  }
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#page-title')).toBeVisible();
  await page.goto('/#/clientes/nuevo');
  await page.getByLabel('Nombre o razón social').fill('Cliente Offline');
  await page.getByRole('button', { name: 'Guardar cliente' }).click();
  await expect(page.getByRole('heading', { name: 'Cliente Offline' })).toBeVisible();
  await page.reload();
  await page.goto('/#/clientes');
  await expect(page.getByRole('link', { name: /Cliente Offline/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Solo en este dispositivo/ }).first()).toBeAttached();
  await context.setOffline(false);
});

test('recorrido completo sólo con teclado: crear presupuesto y abrir el documento', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Teclado físico: escritorio');
  await loadDemo(page);
  /** Avanza con Tab hasta que el foco esté en el control con ese nombre accesible (sin usar el mouse). */
  async function tabTo(name: RegExp, max = 120) {
    for (let i = 0; i < max; i++) {
      await page.keyboard.press('Tab');
      const label = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body || el.id === 'main') return '';
        return (el.getAttribute('aria-label') ?? el.innerText ?? '').trim();
      });
      if (name.test(label)) return;
    }
    throw new Error(`No se alcanzó ${name} con el teclado`);
  }
  await tabTo(/^Presupuestos$/);
  await page.keyboard.press('Enter');
  await expect(page.locator('#page-title')).toHaveText('Presupuestos');
  await tabTo(/Nuevo presupuesto/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.type('martin');
  await tabTo(/Martín Gómez/);
  await page.keyboard.press('Enter');
  await expect(page.locator('#page-title')).toContainText('Presupuesto TA-');
  await tabTo(/Agregar producto/);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Lámpara');
  await tabTo(/Lámpara de pie/);
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Descripción comercial')).toHaveValue(/Lámpara de pie/);
  await tabTo(/^Cant\.$|^1$/, 40).catch(() => {});
  await tabTo(/Guardar borrador/);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Borrador guardado')).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await tabTo(/PDF y WhatsApp/);
  await page.keyboard.press('Enter');
  await expect(page.locator('#page-title')).toContainText('Documento TA-');
  await expect(page.getByRole('article')).toContainText('Martín Gómez');
  await expect(page.getByRole('article')).toContainText('Lámpara de pie');
});


test('escribir apenas se abre una pantalla: el foco no se roba al primer campo', async ({ page }) => {
  await page.goto('/#/productos');
  await expect(page.locator('#page-title')).toHaveText('Productos');
  await page.getByRole('link', { name: 'Nuevo producto' }).first().click();
  const name = page.getByLabel('Nombre *');
  await name.waitFor();
  await name.focus();
  await page.keyboard.type('Producto tipeado rápido', { delay: 15 }); // ~350 ms escribiendo
  await expect(name).toHaveValue('Producto tipeado rápido');
  await expect(name).toBeFocused();
});
