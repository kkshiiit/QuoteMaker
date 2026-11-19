/**
 * Stock por variante (color / talle) y pedidos: estados, pagos (seña / saldo) y descuento
 * de stock idempotente al registrar, editar, cancelar y restaurar.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { db, openTestDatabase } from '../../src/data/db';
import { setCloudActive } from '../../src/data/repo';
import { addStockMove, adjustStockTo, emptyProduct, emptySale, saveProduct, saveSale, setSaleCancelled, setSaleStatus } from '../../src/data/services';
import { saleCounts, salePayments, saleStatus, summarizeSales, validateSale } from '../../src/domain/sales';
import { adjustmentDelta, nearestColorName, productStock, saleStockDeltas, stockBalances, stockKey, stockShortages, validateVariants, variantLabel } from '../../src/domain/stock';
import type { Product, Sale, SaleItem } from '../../src/domain/types';

let n = 0;
beforeEach(() => {
  openTestDatabase(`stock-${++n}`);
  setCloudActive(false);
});

const sabana = async (): Promise<Product> =>
  saveProduct({
    ...emptyProduct(),
    name: 'Sábana algodón',
    trackStock: true,
    lowStockAt: '2',
    variants: [
      { id: 'rosa-q', color: 'Rosa', colorHex: '#f2b8c6', size: 'Queen' },
      { id: 'rosa-k', color: 'Rosa', colorHex: '#f2b8c6', size: 'King' },
      { id: 'gris-q', color: 'Gris perla', colorHex: '#c9c9c9', size: 'Queen' },
    ],
  });

const item = (productId: string | null, qty: string, variantId = ''): SaleItem => ({ id: `${productId}-${variantId}-${qty}`, productId, variantId, description: 'x', unit: 'u', quantity: qty, unitPrice: '10000', discountPct: '0', unitCost: '6000' });

async function balance(productId: string, variantId = '') {
  return stockBalances(await db.stockMoves.where('productId').equals(productId).toArray()).get(stockKey(productId, variantId)) ?? '0';
}

describe('stock: dominio', () => {
  it('saldo = suma de movimientos, por variante, con total y aviso de stock bajo', () => {
    const p = { id: 'p', lowStockAt: '2', variants: [{ id: 'a', color: 'Rosa', colorHex: '', size: 'Queen' }, { id: 'b', color: 'Gris', colorHex: '', size: '' }] };
    const b = stockBalances([
      { productId: 'p', variantId: 'a', qty: '10' },
      { productId: 'p', variantId: 'a', qty: '-3' },
      { productId: 'p', variantId: 'b', qty: '2' },
      { productId: 'otro', variantId: '', qty: '99' },
    ]);
    const s = productStock(p, b);
    expect(s.lines.map((l) => [l.label, l.qty, l.low])).toEqual([
      ['Rosa · Queen', '7', false],
      ['Gris', '2', true],
    ]);
    expect(s.total).toBe('9');
    expect(s.low).toBe(true);
    expect(productStock({ id: 'otro', variants: [], lowStockAt: null }, b).total).toBe('99');
  });

  it('ajuste por conteo = diferencia exacta, también hacia abajo', () => {
    expect(adjustmentDelta('7', '10')).toBe('3');
    expect(adjustmentDelta('7', '0')).toBe('-7');
    expect(adjustmentDelta('-2', '0')).toBe('2');
  });

  it('venta: movimientos compensatorios idempotentes (editar, cambiar variante, cancelar)', () => {
    const sale = { ...emptySale(), id: 's', items: [item('p', '2', 'a'), item('p', '1', 'a'), item('libre', '5')] } as Sale;
    const tracked = (pid: string) => pid === 'p';
    const first = saleStockDeltas(sale, [], tracked);
    expect(first).toEqual([{ productId: 'p', variantId: 'a', qty: '-3' }]);
    // repetir con lo ya aplicado no genera nada
    expect(saleStockDeltas(sale, first, tracked)).toEqual([]);
    // cambiar a otra variante: devuelve a 'a' y descuenta de 'b'
    const moved = { ...sale, items: [item('p', '3', 'b')] };
    expect(saleStockDeltas(moved, first, tracked)).toEqual(expect.arrayContaining([{ productId: 'p', variantId: 'a', qty: '3' }, { productId: 'p', variantId: 'b', qty: '-3' }]));
    // borrador y cancelado no descuentan
    expect(saleStockDeltas({ ...sale, status: 'borrador' }, first, tracked)).toEqual([{ productId: 'p', variantId: 'a', qty: '3' }]);
    expect(saleStockDeltas({ ...sale, cancelled: true }, first, tracked)).toEqual([{ productId: 'p', variantId: 'a', qty: '3' }]);
  });

  it('avisa faltantes sin contar lo que la misma venta ya descontó', () => {
    const sale = { ...emptySale(), items: [item('p', '4', 'a')] } as Sale;
    const bal = new Map([[stockKey('p', 'a'), '3']]);
    expect(stockShortages(sale, bal, new Map(), () => true)).toEqual([stockKey('p', 'a')]);
    // ya se habían descontado 2 por esta venta: hay 3 + 2 = 5 disponibles para ella
    expect(stockShortages(sale, bal, new Map([[stockKey('p', 'a'), '-2']]), () => true)).toEqual([]);
  });

  it('variantes: etiqueta, validación de repetidas y nombre de color aproximado', () => {
    expect(variantLabel({ color: 'Rosa', size: '' })).toBe('Rosa');
    expect(variantLabel({ color: '', size: 'M' })).toBe('M');
    expect(validateVariants([{ id: '1', color: 'Rosa', colorHex: '', size: 'M' }, { id: '2', color: 'rosa', colorHex: '', size: 'm' }])).toHaveLength(1);
    expect(validateVariants([{ id: '1', color: '', colorHex: '', size: '' }])).toHaveLength(1);
    expect(validateVariants([{ id: '1', color: 'X', colorHex: 'rojo', size: '' }])).toHaveLength(1);
    expect(nearestColorName('#f3b9c7')).toBe('Rosa');
    expect(nearestColorName('#202020')).toBe('Negro');
  });
});

describe('pedidos: estados y pagos', () => {
  it('registros viejos: entregado; cancelled manda; borrador no suma', () => {
    expect(saleStatus({ cancelled: false })).toBe('entregado');
    expect(saleStatus({ cancelled: true, status: 'confirmado' })).toBe('cancelado');
    expect(saleCounts({ cancelled: false, status: 'borrador' })).toBe(false);
    const s = (status: Sale['status']) => ({ ...emptySale(), status, items: [item(null, '1')] }) as Sale;
    expect(summarizeSales([s('borrador'), s('confirmado'), s('entregado'), { ...s('entregado'), cancelled: true }]).count).toBe(2);
  });

  it('seña y saldo con decimales exactos; sin lista de pagos = cobrado', () => {
    expect(salePayments({}, '50450.00')).toEqual({ paid: '50450.00', balance: '0.00', fullyPaid: true });
    const p = salePayments({ payments: [{ id: '1', date: '2026-11-18', amount: '25225.10', method: 'Transferencia', note: 'Seña' }] }, '50450.00');
    expect(p).toEqual({ paid: '25225.10', balance: '25224.90', fullyPaid: false });
    expect(salePayments({ payments: [] }, '100.00').balance).toBe('100.00');
  });

  it('valida pagos y dirección de envío', () => {
    const base = { ...emptySale(), items: [item(null, '1')] } as Sale;
    expect(validateSale({ ...base, payments: [{ id: '1', date: '', amount: '0', method: 'Efectivo', note: '' }] })).toHaveLength(2);
    expect(validateSale({ ...base, delivery: { mode: 'envio', address: ' ', date: '', internalCost: '0', internalNote: '' } })).toContain('Indicá la dirección de entrega.');
    expect(validateSale({ ...base, delivery: { mode: 'retiro', address: '', date: '', internalCost: '0', internalNote: '' } })).toEqual([]);
  });
});

describe('stock en la base local', () => {
  it('ingreso, ajuste y movimientos sincronizables', async () => {
    const p = await sabana();
    await addStockMove(p.id, 'rosa-q', '10', 'in', 'Compra a proveedor');
    await addStockMove(p.id, 'rosa-q', '-1', 'loss', 'Mancha');
    expect(await balance(p.id, 'rosa-q')).toBe('9');
    await adjustStockTo(p.id, 'rosa-q', '7', 'Conteo');
    expect(await balance(p.id, 'rosa-q')).toBe('7');
    expect(await addStockMove(p.id, 'rosa-q', '0', 'in', '')).toBeNull();
    expect(await db.outbox.where('collection').equals('stockMoves').count()).toBe(3);
  });

  it('vender descuenta; editar, cancelar y restaurar dejan el saldo correcto', async () => {
    const p = await sabana();
    await addStockMove(p.id, 'rosa-q', '10', 'in', '');
    const s = await saveSale({ ...emptySale(), items: [item(p.id, '3', 'rosa-q')] });
    expect(await balance(p.id, 'rosa-q')).toBe('7');
    // guardar de nuevo sin cambios no descuenta dos veces
    await saveSale(s);
    expect(await balance(p.id, 'rosa-q')).toBe('7');
    const edited = await saveSale({ ...s, items: [item(p.id, '1', 'rosa-q'), item(p.id, '2', 'gris-q')] });
    expect(await balance(p.id, 'rosa-q')).toBe('9');
    expect(await balance(p.id, 'gris-q')).toBe('-2');
    const cancelled = await setSaleCancelled(edited, true);
    expect(cancelled.status).toBe('cancelado');
    expect(await balance(p.id, 'rosa-q')).toBe('10');
    expect(await balance(p.id, 'gris-q')).toBe('0');
    await setSaleStatus(cancelled, 'confirmado');
    expect(await balance(p.id, 'rosa-q')).toBe('9');
    const moves = await db.stockMoves.where('refId').equals(s.id).toArray();
    expect(moves.every((m) => m.kind === 'sale' && m.reason === `Venta ${s.number}`)).toBe(true);
  });

  it('borrador no descuenta hasta confirmarlo; productos sin control de stock no generan movimientos', async () => {
    const p = await sabana();
    const libre = await saveProduct({ ...emptyProduct(), name: 'Servicio de armado' });
    const draft = await saveSale({ ...emptySale(), status: 'borrador', items: [item(p.id, '2', 'rosa-k'), item(libre.id, '1')] });
    expect(await balance(p.id, 'rosa-k')).toBe('0');
    await setSaleStatus(draft, 'confirmado');
    expect(await balance(p.id, 'rosa-k')).toBe('-2');
    expect(await db.stockMoves.where('productId').equals(libre.id).count()).toBe(0);
  });
});
