/** Eliminar registros: se sincroniza el borrado y se conservan los históricos. */
import { beforeEach, describe, expect, it } from 'vitest';
import { db, openTestDatabase } from '../../src/data/db';
import { putRecord, setCloudActive } from '../../src/data/repo';
import {
  addStockMove,
  canDeleteQuote,
  createQuote,
  deleteCategory,
  deleteCustomer,
  deleteExpense,
  deleteProduct,
  deleteQuote,
  deleteSale,
  deleteSupplier,
  emptyCustomer,
  emptyExpense,
  emptyProduct,
  emptySale,
  saveProduct,
  saveSale,
} from '../../src/data/services';
import { createBase } from '../../src/data/repo';
import { stockBalances, stockKey } from '../../src/domain/stock';

let n = 0;
beforeEach(() => {
  openTestDatabase(`del-${++n}`);
  setCloudActive(true);
});

describe('eliminar', () => {
  it('cliente: se borra y el borrado queda en la cola de sincronización; sus ventas conservan el nombre', async () => {
    const c = await putRecord('customers', { ...emptyCustomer(), name: 'Ana' });
    const s = await saveSale({ ...emptySale(), customerId: c.id, customerName: 'Ana', items: [{ id: 'i', productId: null, description: 'x', unit: 'u', quantity: '1', unitPrice: '10', discountPct: '0', unitCost: '0' }] });
    await deleteCustomer(c.id);
    expect(await db.customers.get(c.id)).toBeUndefined();
    expect((await db.outbox.where('[collection+recordId]').equals(['customers', c.id]).first())?.op).toBe('delete');
    expect((await db.sales.get(s.id))!.customerName).toBe('Ana');
  });

  it('proveedor y categoría: los productos quedan sin proveedor / sin categoría', async () => {
    const sup = await putRecord('suppliers', { ...createBase(), name: 'Prov', contactName: '', phone: '', email: '', address: '', notes: '', archived: false });
    const cat = await putRecord('categories', { ...createBase(), name: 'Deco', archived: false });
    const p = await saveProduct({ ...emptyProduct(), name: 'Vela', supplierId: sup.id, categoryId: cat.id });
    await deleteSupplier(sup.id);
    await deleteCategory(cat.id);
    expect(await db.suppliers.get(sup.id)).toBeUndefined();
    expect(await db.categories.get(cat.id)).toBeUndefined();
    expect(await db.products.get(p.id)).toMatchObject({ supplierId: null, categoryId: null });
  });

  it('producto: se borran sus videos locales; el historial de costos se conserva', async () => {
    const p = await saveProduct({ ...emptyProduct(), name: 'Lámpara', manualCost: '100' });
    await db.productVideos.add({ id: 'v', productId: p.id, name: 'v.mp4', mime: 'video/mp4', size: 1, blob: new Blob(['a']), createdAt: '' });
    const hist = await db.costHistory.where('productId').equals(p.id).count();
    await deleteProduct(p.id);
    expect(await db.products.get(p.id)).toBeUndefined();
    expect(await db.productVideos.count()).toBe(0);
    expect(await db.costHistory.where('productId').equals(p.id).count()).toBe(hist);
  });

  it('venta: devuelve el stock antes de borrarse', async () => {
    const p = await saveProduct({ ...emptyProduct(), name: 'Sábana', trackStock: true });
    await addStockMove(p.id, '', '10', 'in', '');
    const s = await saveSale({ ...emptySale(), items: [{ id: 'i', productId: p.id, variantId: '', description: 'Sábana', unit: 'u', quantity: '3', unitPrice: '10', discountPct: '0', unitCost: '0' }] });
    const bal = async () => stockBalances(await db.stockMoves.toArray()).get(stockKey(p.id)) ?? '0';
    expect(await bal()).toBe('7');
    await deleteSale(s);
    expect(await db.sales.get(s.id)).toBeUndefined();
    expect(await bal()).toBe('10');
  });

  it('presupuestos: sólo en borrador; los enviados (congelados) no se pueden borrar', async () => {
    const c = await putRecord('customers', { ...emptyCustomer(), name: 'Ana' });
    const draft = await createQuote(c);
    expect(canDeleteQuote(draft)).toBe(true);
    const other = await createQuote(c);
    const sent = await putRecord('quotes', { ...other, status: 'sent' as const });
    expect(canDeleteQuote(sent)).toBe(false);
    await expect(deleteQuote(sent)).rejects.toThrow(/borrador/);
    await deleteQuote(draft);
    expect(await db.quotes.get(draft.id)).toBeUndefined();
    expect(await db.quotes.get(sent.id)).toBeDefined();
  });

  it('gastos: sólo anulados', async () => {
    const e = await putRecord('expenses', { ...emptyExpense(), amount: '100', status: 'unassigned' as const });
    await expect(deleteExpense(e)).rejects.toThrow(/Anulá/);
    await deleteExpense({ ...e, status: 'void' });
    expect(await db.expenses.get(e.id)).toBeUndefined();
  });
});
