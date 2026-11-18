/**
 * Flujo principal de punta a punta, usando la interfaz real:
 * configuración → productos → compra → gasto asignado → costo real → cliente →
 * presupuesto → enviado (congelado) → PDF descargado y analizado → WhatsApp → persistencia.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fresh, nav, noHorizontalScroll } from './helpers';

const FORBIDDEN = ['101.000', '100.000', '20.000', 'SECRETO-CLIENTE', 'NOTA-INTERNA', 'Maderera', 'costo', 'ganancia', 'margen', 'markup', 'proveedor', 'combustible'];

async function pdfText(path: string) {
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(path)), isEvalSupported: false }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const c = await (await pdf.getPage(i)).getTextContent();
    text += c.items.map((it) => ('str' in it ? it.str : '')).join(' ');
  }
  const meta = await pdf.getMetadata();
  return { text, meta: JSON.stringify(meta.info) };
}

test('flujo completo: costos reales → presupuesto → PDF y WhatsApp sin filtraciones', async ({ page, context }, testInfo) => {
  // Recorre todo el negocio (productos, compra, gasto, presupuesto, PDF real, WhatsApp, recarga):
  // en WebKit sin GPU de CI el render de los efectos de vidrio lo acerca a 60 s.
  test.setTimeout(120_000);
  await fresh(page);

  // 1. Datos del negocio
  await nav(page, 'Configuración');
  await page.getByLabel('Nombre comercial').fill('Taller Prueba');
  await page.getByLabel('Teléfono', { exact: true }).fill('+54 9 11 4444-0000');
  await page.getByRole('button', { name: 'Guardar configuración' }).click();
  await expect(page.getByText('Configuración guardada')).toBeVisible();

  // 2. Proveedor y productos
  await nav(page, 'Proveedores');
  await page.getByRole('link', { name: 'Nuevo proveedor' }).click();
  await page.getByLabel('Nombre').first().fill('Maderera Test');
  await page.getByRole('button', { name: 'Guardar proveedor' }).click();
  await expect(page.getByRole('heading', { name: 'Maderera Test' })).toBeVisible();

  for (const name of ['Mesa test', 'Silla test']) {
    await nav(page, 'Productos');
    await page.getByRole('link', { name: 'Nuevo producto' }).first().click();
    await page.getByLabel('Nombre *').fill(name);
    await page.getByLabel('Descripción comercial').fill(`${name} de calidad`);
    await page.getByRole('button', { name: 'Guardar producto' }).click();
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  }

  // 3. Compra
  await nav(page, 'Costos');
  await page.getByRole('link', { name: 'Registrar compra' }).click();
  await page.getByLabel('Proveedor').selectOption({ label: 'Maderera Test' });
  await page.getByRole('button', { name: 'Agregar artículo' }).click();
  await page.getByRole('button', { name: 'Agregar artículo' }).click();
  const prod = page.getByLabel('Producto', { exact: true });
  await prod.nth(0).selectOption({ label: 'Mesa test' });
  await prod.nth(1).selectOption({ label: 'Silla test' });
  await page.getByLabel('Cantidad').nth(0).fill('4');
  await page.getByLabel('Precio unit.').nth(0).fill('100.000');
  await page.getByLabel('Cantidad').nth(1).fill('10');
  await page.getByLabel('Precio unit.').nth(1).fill('20000');
  await expect(page.getByText('$ 600.000,00').first()).toBeVisible(); // total de la compra
  await page.getByRole('button', { name: 'Guardar compra' }).click();
  await expect(page.getByText('Compra guardada. Costos actualizados.')).toBeVisible();

  // 4. Gasto de combustible asignado a la compra por unidades (14 u → $1.000 c/u)
  await page.getByRole('navigation', { name: 'Secciones de costos' }).getByRole('link', { name: 'Gastos' }).click();
  await page.getByRole('link', { name: 'Registrar gasto' }).click();
  await page.getByLabel('Importe').fill('14000');
  await page.getByText('A una compra', { exact: true }).click();
  await page.getByLabel('Compra', { exact: true }).selectOption({ index: 1 });
  await expect(page.getByText(/Desglose listo/)).toBeVisible();
  await expect(page.getByRole('cell', { name: '$ 4.000,00' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '$ 10.000,00' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar y asignar' }).click();
  await expect(page.getByText('Gasto asignado. Costos actualizados.')).toBeVisible();

  // 5. Costo real del producto = 100.000 + 1.000
  await nav(page, 'Productos');
  await page.getByRole('link', { name: /Mesa test/ }).click();
  await expect(page.locator('dd.total')).toHaveText('$ 101.000,00');
  await expect(page.getByText('Gasto asignado').first()).toBeVisible(); // historial

  // 6. Cliente con notas privadas
  await nav(page, 'Clientes');
  await page.getByRole('link', { name: 'Nuevo cliente' }).first().click();
  await page.getByLabel('Nombre o razón social').fill('Lucía Prueba');
  await page.getByLabel('Teléfono', { exact: true }).fill('+54 9 11 5555-1234');
  await page.getByLabel('Notas', { exact: true }).fill('SECRETO-CLIENTE');
  await page.getByRole('button', { name: 'Guardar cliente' }).click();
  await expect(page.getByRole('heading', { name: 'Lucía Prueba' })).toBeVisible();

  // 7. Presupuesto
  await nav(page, 'Presupuestos');
  await page.getByRole('button', { name: 'Nuevo presupuesto' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /Lucía Prueba/ }).click();
  await expect(page.getByRole('heading', { name: /Presupuesto P-00001/ })).toBeVisible();
  await page.getByRole('button', { name: 'Agregar producto' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Mesa test/ }).click();
  await page.getByLabel('Cant.').fill('2');
  await page.getByLabel('Notas internas').fill('NOTA-INTERNA-XYZ');
  // precio sugerido: 101.000 / (1 − 35 %) = 155.384,62 → redondeo a 1 = 155.385
  await expect(page.getByTestId('quote-total')).toHaveText('$ 310.770,00');
  await expect(page.getByTestId('quote-profit')).toHaveText('$ 108.770,00');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('Borrador guardado')).toBeVisible();
  await noHorizontalScroll(page);

  // 8. Estado manual → Enviado (congela)
  await page.getByRole('button', { name: 'Cambiar estado' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enviado' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Marcar como enviado' }).click();
  await expect(page.getByText(/Congelado el/)).toBeVisible();

  // 9. Documento: PDF descargado y analizado
  await page.getByRole('button', { name: 'PDF y WhatsApp' }).click();
  await expect(page.getByRole('heading', { name: 'Documento P-00001' })).toBeVisible();
  const preview = page.getByRole('article');
  await expect(preview).toContainText('Taller Prueba');
  await expect(preview).toContainText('$ 310.770,00');
  for (const f of FORBIDDEN) expect((await preview.innerText()).toLowerCase()).not.toContain(f.toLowerCase());

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar PDF' }).click()]);
  expect(download.suggestedFilename()).toBe('Presupuesto-P-00001.pdf');
  const path = testInfo.outputPath('presupuesto.pdf');
  await download.saveAs(path);
  const { text, meta } = await pdfText(path);
  expect(text).toContain('Lucía Prueba');
  expect(text.replace(/\s/g, '')).toContain('$310.770,00');
  for (const f of FORBIDDEN) {
    expect(text.toLowerCase(), `PDF filtra "${f}"`).not.toContain(f.toLowerCase());
    expect(meta.toLowerCase(), `metadatos filtran "${f}"`).not.toContain(f.toLowerCase());
  }

  // 10. WhatsApp: se abre wa.me con el texto; nunca se envía solo
  const msg = (await page.getByLabel('Texto (editable)').inputValue()).replace(/\u00a0/g, ' ');
  expect(msg).toContain('*Total: $ 310.770,00*');
  for (const f of FORBIDDEN) expect(msg.toLowerCase()).not.toContain(f.toLowerCase());
  await context.route('https://wa.me/**', (r) => r.fulfill({ status: 200, body: 'wa' }));
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Abrir en WhatsApp' }).click()]);
  expect(popup.url()).toMatch(/^https:\/\/wa\.me\/5491155551234\?text=/);
  const sent = decodeURIComponent(popup.url().split('text=')[1]!);
  for (const f of FORBIDDEN) expect(sent.toLowerCase()).not.toContain(f.toLowerCase());
  await popup.close();

  // 11. Persistencia tras recargar (cerrar y abrir)
  await page.reload();
  await nav(page, 'Presupuestos');
  const row = page.getByRole('link', { name: /P-00001 · Lucía Prueba/ });
  await expect(row).toContainText('Enviado');
  await expect(row).toContainText('$ 310.770,00');
  await row.click();
  await expect(page.getByText(/PDF Presupuesto-P-00001\.pdf descargado/)).toBeVisible(); // historial
  await expect(page.getByText('Mensaje de WhatsApp abierto en WhatsApp')).toBeVisible();
});

test('calculadora: precio recomendado, imposibles y markup vs margen', async ({ page }) => {
  await fresh(page);
  await page.goto('/#/costos/calculadora');
  await page.getByLabel('Costo unitario real').fill('80');
  await page.getByLabel('Costos fijos por unidad').fill('20');
  await page.getByLabel('Cargos % sobre el precio').fill('10');
  await page.getByLabel('Margen objetivo').fill('40');
  await page.getByLabel('Redondeo').selectOption('none');
  await expect(page.getByText('$ 200,00').first()).toBeVisible();
  await page.getByLabel('Margen objetivo').fill('95');
  await expect(page.getByText(/no existe un precio que lo logre/)).toBeVisible();
});

test('validación accesible de formularios', async ({ page }) => {
  await fresh(page);
  await page.goto('/#/productos/nuevo');
  await page.getByRole('button', { name: 'Guardar producto' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('El nombre es obligatorio');
  await expect(alert).toBeFocused();
  await page.getByLabel('Costo manual').fill('abc');
  await expect(page.getByText('Ingresá un número válido')).toBeVisible();
  await expect(page.getByLabel('Costo manual')).toHaveAttribute('aria-invalid', 'true');
});
