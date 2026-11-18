/**
 * Stock por color y talle, pedidos con seña/saldo y envío, recibo sin datos internos,
 * menú lateral, panel de gastos y catálogo en grilla.
 */
import { expect, test } from '@playwright/test';
import { loadDemo, nav, noHorizontalScroll } from './helpers';

test('stock por variante: ingreso, ajuste, venta que descuenta y cancelación que devuelve', async ({ page }) => {
  await loadDemo(page);
  await page.goto('/#/stock');
  await expect(page.locator('#page-title')).toHaveText('Stock');
  const row = page.getByRole('link', { name: /Almohadón 45×45/ });
  // Demo: crudo 8−4=4, salvia 6−2=4, terracota 3−2 (pedido confirmado)=1 → stock bajo
  await expect(row).toContainText('9 u.');
  await expect(row).toContainText('Stock bajo');
  await row.click();
  await expect(page.locator('#page-title')).toHaveText('Almohadón 45×45');
  await expect(page.getByTestId('stock-total')).toHaveText('9 u. en total');

  // Ingreso de 5 terracota
  await page.getByRole('button', { name: 'Stock de Terracota' }).click();
  const dlg = page.getByRole('dialog', { name: /Stock · Terracota/ });
  await dlg.getByLabel('Cantidad').fill('5');
  await dlg.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByLabel('Stock de Terracota')).toHaveText('6 u.');
  // Ajuste por conteo: crudo queda en 10
  await page.getByRole('button', { name: 'Stock de Crudo' }).click();
  await page.getByRole('dialog').getByLabel('Tipo de movimiento').selectOption('adjust');
  await page.getByRole('dialog').getByLabel('Cantidad contada').fill('10');
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByLabel('Stock de Crudo')).toHaveText('10 u.');
  await expect(page.getByTestId('stock-total')).toHaveText('20 u. en total');

  // Nueva variante con muestra de color: se guarda con el producto
  await page.getByRole('button', { name: 'Agregar color Lavanda' }).click();
  await page.getByRole('button', { name: 'Guardar producto' }).click();
  await expect(page.getByText('Producto guardado')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stock de Lavanda' })).toBeEnabled();

  // Venta de 3 terracota: descuenta; anular devuelve
  await page.goto('/#/ventas/nueva');
  await page.getByRole('button', { name: 'Agregar producto' }).click();
  await page.getByRole('dialog').getByRole('searchbox').fill('Almoh');
  await page.getByRole('dialog').getByRole('button', { name: /Almohadón/ }).click();
  await page.getByLabel('Color / talle').selectOption({ label: 'Terracota' });
  await expect(page.getByLabel('Descripción')).toHaveValue('Almohadón 45×45 (Terracota)');
  await page.getByLabel('Cant.').fill('9');
  await expect(page.getByText('Stock insuficiente (hay 6)')).toBeVisible();
  await page.getByLabel('Cant.').fill('3');
  await expect(page.getByText(/Stock insuficiente/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Registrar venta' }).click();
  await expect(page.locator('#page-title')).toHaveText(/Venta V-\d+/);
  const saleUrl = page.url();
  await page.goto('/#/stock');
  await expect(page.getByRole('link', { name: /Almohadón/ })).toContainText('Terracota: 3');
  await page.goto(saleUrl);
  await page.getByLabel('Más acciones de la venta').click();
  await page.getByRole('button', { name: 'Anular venta' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Anular' }).click();
  await expect(page.getByText('Venta anulada')).toBeVisible();
  await page.goto('/#/stock');
  await expect(page.getByRole('link', { name: /Almohadón/ })).toContainText('Terracota: 6');
  await noHorizontalScroll(page);
});

test('pedido: seña, saldo, envío calculado y comprobante sin datos internos', async ({ page }) => {
  await loadDemo(page);
  await page.goto('/#/ventas?estado=pendientes');
  const order = page.getByRole('link', { name: /Estudio Norte/ });
  await expect(order).toContainText('Saldo');
  await page.goto('/#/ventas/nueva?tipo=pedido');
  await expect(page.locator('#page-title')).toHaveText('Nuevo pedido');
  await page.getByRole('button', { name: 'Agregar producto' }).click();
  await page.getByRole('dialog').getByRole('searchbox').fill('Lámpara');
  await page.getByRole('dialog').getByRole('button', { name: /Lámpara de pie/ }).click();
  await page.getByLabel('Dirección de entrega').fill('Calle Falsa 123');

  // Calcular envío: 8,5 km ida y vuelta en auto
  await page.getByRole('button', { name: 'Calcular envío' }).click();
  const ship = page.getByRole('dialog', { name: 'Calcular envío' });
  await ship.getByLabel('Distancia').fill('8,5');
  await ship.getByText('Valores de cálculo').click();
  await ship.getByLabel('Nafta / diésel por litro').fill('1250');
  await ship.getByLabel('Valor de tu hora').fill('6000');
  await expect(ship.getByTestId('ship-cost')).toHaveText('$ 6.780,00');
  await expect(ship.getByTestId('ship-suggested')).toHaveText('$ 6.800,00');
  await ship.getByRole('button', { name: 'Aplicar precio al pedido' }).click();
  await expect(page.getByLabel('Envío cobrado')).toHaveValue(/^6\.?800,00$/);

  // Seña del 50 %
  await page.getByRole('button', { name: 'Registrar seña' }).click();
  const total = await page.getByTestId('sale-total').innerText();
  await expect(page.getByTestId('sale-balance')).not.toHaveText('$ 0,00');
  await page.getByRole('button', { name: 'Guardar pedido' }).click();
  await expect(page.locator('#page-title')).toHaveText(/Pedido V-\d+/);
  await expect(page.locator('.page-header').getByText('Confirmado · por entregar')).toBeVisible();

  // Comprobante para el cliente
  await page.getByRole('button', { name: 'Comprobante' }).click();
  const r = page.getByRole('dialog', { name: /Pedido V-\d+ para el cliente/ });
  const text = (await r.getByLabel('Mensaje (podés editarlo)').inputValue()).replace(/ /g, ' ');
  expect(text).toContain('Seña');
  expect(text).toContain(`*Total: ${total.replace(/ /g, ' ')}*`);
  expect(text).toContain('Entrega en: Calle Falsa 123');
  for (const f of ['costo', 'ganancia', 'km', 'nafta', '6.780', 'interno', 'proveedor']) expect(text.toLowerCase()).not.toContain(f);
  const download = page.waitForEvent('download');
  await r.getByRole('button', { name: 'Descargar PDF' }).click();
  expect((await download).suggestedFilename()).toMatch(/^Pedido-V-\d+\.pdf$/);
  await page.keyboard.press('Escape');

  // Entregado: suma y queda saldado al registrar el saldo
  await page.getByLabel('Estado del pedido').selectOption('entregado');
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(page.getByTestId('sale-balance')).toHaveText('$ 0,00');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.locator('.page-header').getByText('Entregado')).toBeVisible();
});

test('menú lateral, panel de gastos, envíos y catálogo en grilla con favoritos', async ({ page }) => {
  await loadDemo(page);
  await nav(page, 'Panel de gastos');
  await expect(page.locator('#page-title')).toHaveText('Panel de gastos');
  await page.getByText('Quincenal', { exact: true }).click();
  await expect(page.getByTestId('period-label')).toContainText(/al/);
  await page.getByRole('button', { name: 'Período anterior' }).click();
  await page.getByText('Mensual', { exact: true }).click();
  await expect(page.getByTestId('exp-total')).toBeVisible();
  await noHorizontalScroll(page);

  await nav(page, 'Envíos');
  await expect(page.locator('#page-title')).toHaveText('Envíos');
  await page.getByText('Colectivo / tren', { exact: true }).click();
  await expect(page.getByLabel('Boletos por tramo')).toBeVisible();

  await nav(page, 'Productos');
  await expect(page.getByRole('list', { name: 'Catálogo' })).toBeVisible();
  await page.getByRole('button', { name: 'Decoración' }).click();
  await expect(page.getByRole('link', { name: /Mesa de roble/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Todas' }).click();
  const fav = page.getByRole('button', { name: 'Favorito: Banco largo' });
  await expect(fav).toHaveAttribute('aria-pressed', 'false');
  await fav.click();
  await expect(fav).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Ver en lista' }).click();
  await expect(page.getByRole('list', { name: 'Catálogo' })).toHaveCount(0);
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'Destacados' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Banco largo/ })).toBeVisible();
  await noHorizontalScroll(page);
});

test('eliminar con confirmación: cancelar no borra, confirmar sí (cliente, producto, venta con stock)', async ({ page }) => {
  await loadDemo(page);
  // Cliente
  await page.goto('/#/clientes');
  await page.getByRole('link', { name: /Café Las Palmas/ }).click();
  await page.getByLabel('Más acciones del cliente').click();
  await page.getByRole('button', { name: 'Eliminar' }).click();
  const dlg = page.getByRole('dialog', { name: 'Eliminar cliente' });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Cancelar' })).toBeFocused(); // Enter no borra por accidente
  await dlg.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('#page-title')).toHaveText('Café Las Palmas');
  await page.getByLabel('Más acciones del cliente').click();
  await page.getByRole('button', { name: 'Eliminar' }).click();
  await page.getByRole('dialog', { name: 'Eliminar cliente' }).getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText('Cliente eliminado')).toBeVisible();
  await expect(page.locator('#page-title')).toHaveText('Clientes');
  await expect(page.getByRole('link', { name: /Café Las Palmas/ })).toHaveCount(0);

  // Pedido confirmado: al eliminarlo vuelve el stock (terracota 1 → 3)
  await page.goto('/#/ventas?estado=pendientes');
  await page.getByRole('link', { name: /Estudio Norte/ }).click();
  await page.getByLabel('Más acciones de la venta').click();
  await page.getByRole('button', { name: 'Eliminar' }).click();
  await page.getByRole('dialog', { name: 'Eliminar pedido' }).getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText('Pedido eliminado')).toBeVisible();
  await page.goto('/#/stock');
  await expect(page.getByRole('link', { name: /Almohadón/ })).toContainText('Terracota: 3');

  // Producto
  await page.goto('/#/productos');
  await page.getByRole('link', { name: /Banco largo/ }).click();
  await page.getByLabel('Más acciones del producto').click();
  await page.getByRole('button', { name: 'Eliminar' }).click();
  await page.getByRole('dialog', { name: 'Eliminar producto' }).getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.locator('#page-title')).toHaveText('Productos');
  await expect(page.getByRole('link', { name: /Banco largo/ })).toHaveCount(0);
  // Persiste al recargar
  await page.reload();
  await expect(page.getByRole('link', { name: /Mesa de roble/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Banco largo/ })).toHaveCount(0);
});
