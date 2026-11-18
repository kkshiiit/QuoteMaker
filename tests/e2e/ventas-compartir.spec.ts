/**
 * Chediek Home: historial de ventas (local / online / por cliente), compartir productos con
 * fotos y redes sociales sin filtrar datos internos, y temas con paletas pastel.
 */
import { expect, test, type Page } from '@playwright/test';
import { loadDemo, noHorizontalScroll } from './helpers';

const INTERNAL = ['costo', 'margen', 'markup', 'ganancia', 'proveedor', 'maderera', 'textiles sur', 'paga a 30', 'MES-120'];

/** PNG 1×1 válido (se procesa y redimensiona en el navegador). */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function addProductToSale(page: Page, name: string) {
  await page.getByRole('button', { name: 'Agregar producto' }).click();
  await page.getByRole('dialog').getByRole('searchbox').fill(name.split(' ')[0]!);
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(name) }).click();
}

test('ventas: presencial y online, historial con totales por canal y por cliente', async ({ page }) => {
  await loadDemo(page);
  await page.goto('/#/ventas');
  await expect(page.locator('#page-title')).toHaveText('Pedidos y ventas');
  const before = await page.getByTestId('sales-total').innerText();

  // Venta presencial en el local, consumidor final
  await page.getByRole('link', { name: 'Registrar venta' }).click();
  await expect(page.locator('#page-title')).toHaveText('Registrar venta');
  await addProductToSale(page, 'Lámpara de pie');
  await page.getByLabel('Cant.').fill('2');
  await page.getByRole('button', { name: 'Registrar venta' }).click();
  await expect(page.locator('#page-title')).toHaveText('Venta V-00006');
  await expect(page.locator('.page-header').getByText('En el local', { exact: true })).toBeVisible();

  // Venta online por Facebook a un cliente registrado
  await page.goto('/#/ventas/nueva');
  await page.getByText('Online', { exact: true }).click();
  await page.getByLabel('Plataforma').selectOption('Facebook');
  await page.getByRole('button', { name: 'Elegir cliente' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Café Las Palmas/ }).click();
  await expect(page.getByLabel('Nombre del cliente')).toHaveValue('Café Las Palmas');
  await addProductToSale(page, 'Almohadón');
  await page.getByLabel('Cant.').fill('3');
  await page.getByRole('button', { name: 'Registrar venta' }).click();
  await expect(page.locator('#page-title')).toHaveText('Venta V-00007');
  await expect(page.getByText('Online · Facebook').first()).toBeVisible();

  // Historial: el total creció y se puede filtrar por canal
  await page.goto('/#/ventas');
  await expect(page.getByTestId('sales-total')).not.toHaveText(before);
  await expect(page.getByRole('link', { name: /V-00006 · Consumidor final/ })).toBeVisible();
  await page.getByLabel('Canal').selectOption('online');
  await expect(page.getByRole('link', { name: /V-00007 · Café Las Palmas/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /V-00006/ })).toHaveCount(0);
  await noHorizontalScroll(page);

  // La ficha del cliente muestra sus compras
  await page.goto('/#/clientes');
  await page.getByRole('link', { name: /Café Las Palmas/ }).click();
  await expect(page.getByRole('heading', { name: 'Ventas a este cliente' })).toBeVisible();
  await expect(page.getByRole('link', { name: /V-00007/ })).toBeVisible();

  // Persiste al recargar
  await page.reload();
  await page.goto('/#/ventas');
  await expect(page.getByRole('link', { name: /V-00007 · Café Las Palmas/ })).toBeVisible();
});

test('presupuesto aceptado → registrar venta con los mismos ítems', async ({ page }) => {
  await loadDemo(page);
  await page.goto('/#/presupuestos');
  await page.getByRole('link', { name: /Estudio Norte/ }).click();
  const total = await page.getByTestId('quote-total').innerText();
  await page.getByRole('link', { name: 'Registrar venta' }).click();
  await expect(page.getByLabel('Nombre del cliente')).toHaveValue('Estudio Norte Arquitectura');
  await expect(page.getByTestId('sale-total')).toHaveText(total);
  // Un presupuesto aceptado se convierte en pedido confirmado (por entregar, con seña opcional)
  await expect(page.locator('#page-title')).toHaveText('Nuevo pedido');
  await page.getByRole('button', { name: 'Guardar pedido' }).click();
  await expect(page.locator('#page-title')).toHaveText(/Pedido V-\d+/);
  await page.goto('/#/presupuestos');
  await page.getByRole('link', { name: /Estudio Norte/ }).click();
  await expect(page.getByRole('link', { name: /Venta V-\d+/ })).toBeVisible();
});

test('compartir producto: fotos, descripción, precio y links a redes; sin datos internos', async ({ page }) => {
  await loadDemo(page);
  await page.goto('/#/productos');
  await page.getByRole('link', { name: /Mesa de roble/ }).click();
  await expect(page.locator('#page-title')).toHaveText('Mesa de roble 120 cm');

  // Subir una foto (se optimiza en el dispositivo) y guardar
  await page.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'mesa.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('img', { name: /Foto 1 de Mesa de roble/ })).toBeVisible();
  await expect(page.getByText('Portada')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar producto' }).click();
  await expect(page.getByText('Producto guardado')).toBeVisible();

  await page.getByRole('button', { name: 'Compartir' }).click();
  const dialog = page.getByRole('dialog', { name: 'Compartir producto' });
  await expect(dialog).toBeVisible();
  // Por defecto se incluye todo
  for (const label of [/^Fotos \(1\)/, /^Videos/, /^Precio/, /^Links a mis redes/]) await expect(dialog.getByLabel(label)).toBeChecked();
  const text = (await dialog.getByLabel('Texto (podés editarlo)').inputValue()).replace(/\u00a0/g, ' ');
  expect(text.split('\n')[0]).toBe('*Mesa de roble 120 cm*');
  expect(text).toContain('Roble macizo, terminación aceite natural');
  expect(text).toMatch(/Precio: \$ [\d.]+,\d\d/);
  expect(text).toContain('Instagram: https://instagram.com/taller.aurora.ejemplo');
  expect(text).toContain('Facebook: https://facebook.com/taller.aurora.ejemplo');
  expect(text).toContain('TikTok: https://tiktok.com/@taller.aurora.ejemplo');
  for (const f of INTERNAL) expect(text.toLowerCase()).not.toContain(f.toLowerCase());
  await expect(dialog.getByRole('img', { name: /Foto de Mesa de roble/ })).toBeVisible();

  // Opciones: sin precio y sin redes
  await dialog.getByLabel(/^Precio/).uncheck();
  await dialog.getByLabel(/^Links a mis redes/).uncheck();
  await expect(dialog.getByLabel('Texto (podés editarlo)')).not.toHaveValue(/Precio|Seguinos|instagram\.com/);
  await expect(dialog.getByLabel('Texto (podés editarlo)')).toHaveValue(/Mesa de roble 120 cm/);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('presupuesto: links a redes opcionales en WhatsApp y PDF', async ({ page }) => {
  await loadDemo(page);
  await page.goto('/#/presupuestos');
  await page.getByRole('link', { name: /Estudio Norte/ }).click();
  await page.getByRole('button', { name: 'PDF y WhatsApp' }).click();
  const box = page.getByLabel('Incluir links a mis redes (Instagram, Facebook, TikTok)');
  await expect(box).toBeChecked();
  await expect(page.getByLabel('Texto (editable)')).toHaveValue(/Facebook: https:\/\/facebook\.com\/taller\.aurora\.ejemplo/);
  await expect(page.getByRole('article')).toContainText('Facebook: facebook.com/taller.aurora.ejemplo');
  await box.uncheck();
  await expect(page.getByLabel('Texto (editable)')).not.toHaveValue(/Seguinos/);
  await expect(page.getByRole('article')).not.toContainText('Facebook:');
});

test('personalización: tocar una paleta la aplica al instante a toda la app, en claro y oscuro, y se puede deshacer', async ({ page }) => {
  await page.goto('/#/personalizacion');
  await expect(page.locator('#page-title')).toHaveText('Personalización');
  const fill = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent-fill').trim());
  await page.getByRole('tab', { name: '(+) Pasteles' }).click();
  await page.getByText('Lavanda', { exact: true }).click();
  await expect.poll(fill).toBe('#c7b8f5');
  await page.getByText('Oscuro', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-pastel', 'true');
  const ratio = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const lum = (hex: string) => {
      const n = parseInt(hex.trim().slice(1), 16);
      const ch = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
    };
    const [a, b] = [lum(s.getPropertyValue('--accent-fill')), lum(s.getPropertyValue('--on-accent-fill'))].sort((x, y) => y - x);
    return (a! + 0.05) / (b! + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-pastel', 'true');
  // Volver a la paleta de la casa y deshacer
  await page.getByRole('tab', { name: 'Chediek' }).click();
  await page.getByText('Rosé Chediek', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-pastel', 'false');
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-pastel', 'true');
});
