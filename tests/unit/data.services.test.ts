import { beforeEach, describe, expect, it } from 'vitest';
import { db, useTestDatabase } from '../../src/data/db';
import { setCloudActive } from '../../src/data/repo';
import {
  changeQuoteStatus,
  createQuote,
  duplicateQuote,
  emptyCustomer,
  emptyExpense,
  emptyProduct,
  emptyPurchase,
  getSettings,
  itemFromProduct,
  saveExpense,
  savePurchase,
  saveProduct,
  saveQuote,
  saveSettings,
  setPurchaseVoided,
  suggestedPrice,
  validateProduct,
  customerSnapshot,
  findDuplicateCustomer,
  recordQuoteDocument,
} from '../../src/data/services';
import { putRecord } from '../../src/data/repo';
import { exportBackup, importBackup, validateBackup } from '../../src/data/backup';
import { quoteTotals } from '../../src/domain/quote';
import { buildPublicQuoteDocument } from '../../src/privacy/publicQuote';
import type { Product } from '../../src/domain/types';

let n = 0;
beforeEach(() => {
  useTestDatabase(`svc-${++n}`);
  setCloudActive(false);
});

async function product(name: string, extra: Partial<Product> = {}) {
  return saveProduct({ ...emptyProduct(), name, ...extra });
}

async function buy(productId: string, qty: string, price: string, date = '2026-01-10') {
  const p = emptyPurchase();
  p.date = date;
  p.items = [{ id: `it-${productId}-${date}`, productId, quantity: qty, unitPrice: price, discount: '0', unitWeight: '0', unitVolume: '0' }];
  await savePurchase(p);
  return p;
}

describe('persistencia local', () => {
  it('los datos persisten al reabrir la base (cierre y apertura de la app)', async () => {
    const name = `persist-${n}`;
    useTestDatabase(name);
    const p = await product('Taza');
    db.close();
    const reopened = useTestDatabase(name);
    expect((await reopened.products.get(p.id))!.name).toBe('Taza');
    expect(await reopened.outbox.count()).toBeGreaterThan(0); // cola durable para sincronizar luego
  });

  it('sin nube los registros quedan como "local" (nunca se muestran como sincronizados)', async () => {
    const p = await product('Taza');
    expect((await db.syncState.get(`products:${p.id}`))!.status).toBe('local');
  });

  it('coalesce mutaciones no enviadas del mismo registro', async () => {
    const p = await product('Taza');
    await saveProduct({ ...p, description: 'Cerámica' });
    const rows = await db.outbox.where('[collection+recordId]').equals(['products', p.id]).toArray();
    expect(rows).toHaveLength(1);
    expect((rows[0]!.payload as Product).description).toBe('Cerámica');
  });
});

describe('productos', () => {
  it('evita duplicados por nombre y SKU', async () => {
    await product('Mate', { sku: 'M-1' });
    const errs = await validateProduct({ ...emptyProduct(), name: ' mate ', sku: 'm-1' });
    expect(errs).toHaveLength(2);
  });
  it('valida campos', async () => {
    const errs = await validateProduct({ ...emptyProduct(), name: '', unit: '', manualPrice: '-1', targetMarginPct: '100' });
    expect(errs.length).toBeGreaterThanOrEqual(4);
  });
});

describe('costos e historial', () => {
  it('compras y gastos actualizan el costo y registran historial sin borrar entradas', async () => {
    const mesa = await product('Mesa');
    const purchase = await buy(mesa.id, '4', '100');
    expect((await db.products.get(mesa.id))!.currentCost).toBe('100.0000');

    const e = { ...emptyExpense(), amount: '40', category: 'Combustible', target: 'purchase' as const, purchaseId: purchase.id };
    expect(await saveExpense(e)).toEqual({ ok: true });
    const p = (await db.products.get(mesa.id))!;
    expect(p.currentCost).toBe('110.0000');
    expect(p.costSource).toBe('expense');

    await buy(mesa.id, '2', '130', '2026-02-01');
    expect((await db.products.get(mesa.id))!.currentCost).toBe('130.0000');

    const hist = await db.costHistory.where('productId').equals(mesa.id).sortBy('at');
    expect(hist.map((h) => [h.unitCost, h.source])).toEqual([
      ['100.0000', 'purchase'],
      ['110.0000', 'expense'],
      ['130.0000', 'purchase'],
    ]);
  });

  it('gasto sin asignar no cambia costos; anular la compra vuelve al costo manual', async () => {
    const silla = await product('Silla', { manualCost: '50' });
    expect((await db.products.get(silla.id))!.currentCost).toBe('50.0000');
    const pur = await buy(silla.id, '1', '80');
    expect((await db.products.get(silla.id))!.currentCost).toBe('80.0000');
    await saveExpense({ ...emptyExpense(), amount: '999' });
    expect((await db.products.get(silla.id))!.currentCost).toBe('80.0000');
    await setPurchaseVoided((await db.purchases.get(pur.id))!, true);
    expect((await db.products.get(silla.id))!.currentCost).toBe('50.0000');
  });

  it('rechaza asignar gastos a productos sin compras', async () => {
    const x = await product('Sin compras');
    const r = await saveExpense({ ...emptyExpense(), amount: '10', target: 'products', productIds: [x.id] });
    expect(r.ok).toBe(false);
  });

  it('precio sugerido usa costo real, margen y redondeo', async () => {
    const s = { ...(await getSettings()), defaultTargetMarginPct: '40', defaultPctCharges: '10', rounding: 'ten' as const };
    expect(suggestedPrice({ currentCost: '100', targetMarginPct: null }, s)).toBe('200.00');
    expect(suggestedPrice({ currentCost: '100', targetMarginPct: '20' }, s)).toBe('150.00'); // 142.86 → 150
    expect(suggestedPrice({ currentCost: null, targetMarginPct: null }, s)).toBeNull();
    expect(suggestedPrice({ currentCost: '100', targetMarginPct: '95' }, s)).toBeNull();
  });
});

describe('presupuestos', () => {
  it('numeración correlativa y duplicado con número nuevo', async () => {
    await saveSettings({ ...(await getSettings()), quotePrefix: 'Q-' });
    const q1 = await createQuote();
    const q2 = await createQuote();
    expect([q1.number, q2.number]).toEqual(['Q-00001', 'Q-00002']);
    const dup = await duplicateQuote(q1);
    expect(dup.number).toBe('Q-00003');
    expect(dup.events.some((e) => e.type === 'duplicated')).toBe(true);
  });

  it('al marcar como Enviado se congela: cambios de costos, precios, negocio y cliente no alteran el histórico', async () => {
    await saveSettings({ ...(await getSettings()), businessName: 'Negocio Viejo' });
    const mesa = await product('Mesa', { manualPrice: '300' });
    await buy(mesa.id, '1', '100');
    const fresh = (await db.products.get(mesa.id))!;
    const customer = { ...emptyCustomer(), name: 'Ana', notes: 'privado' };
    let q = await createQuote(customer);
    q = await saveQuote({ ...q, items: [itemFromProduct(fresh, null)] });
    q = await changeQuoteStatus(q, 'sent');
    const before = quoteTotals(q);
    expect(before.internal.goodsCost).toBe('100.00');

    // Cambian costos, precios, datos del negocio
    await buy(mesa.id, '1', '250', '2026-03-01');
    await saveProduct({ ...(await db.products.get(mesa.id))!, manualPrice: '999' });
    await saveSettings({ ...(await getSettings()), businessName: 'Negocio Nuevo' });

    const stored = (await db.quotes.get(q.id))!;
    const after = quoteTotals(stored);
    expect(after.totals.total).toBe(before.totals.total);
    expect(after.internal.goodsCost).toBe('100.00');
    const doc = buildPublicQuoteDocument(stored, await getSettings());
    expect(doc.business.name).toBe('Negocio Viejo');
    expect(doc.customer.name).toBe('Ana');
    await expect(saveQuote(stored)).rejects.toThrow(/congelado/);
  });

  it('los estados sólo cambian manualmente y respetan transiciones', async () => {
    const q = await createQuote();
    await expect(changeQuoteStatus(q, 'accepted')).rejects.toThrow();
    await expect(changeQuoteStatus(q, 'sent')).rejects.toThrow(/al menos un ítem/);
    const c = await changeQuoteStatus(q, 'cancelled');
    expect(c.status).toBe('cancelled');
    expect(c.events.at(-1)!.detail).toBe('Borrador → Cancelado');
  });

  it('registra documentos generados en el historial', async () => {
    const mesa = await product('Mesa', { manualPrice: '10' });
    let q = await createQuote();
    q = await saveQuote({ ...q, items: [itemFromProduct(mesa, null)] });
    await recordQuoteDocument(q, 'pdf', 'Presupuesto-P-00001.pdf', 'download', new Uint8Array([1, 2, 3]));
    const docs = await db.quoteDocuments.where('quoteId').equals(q.id).toArray();
    expect(docs).toHaveLength(1);
    expect(docs[0]!.sha256).toHaveLength(64);
    expect((await db.quotes.get(q.id))!.events.at(-1)!.type).toBe('pdf');
  });
});

describe('clientes', () => {
  it('snapshot comercial excluye notas privadas', () => {
    const s = customerSnapshot({ ...emptyCustomer(), name: 'X', notes: 'secreto' });
    expect(Object.keys(s).sort()).toEqual(['address', 'email', 'name', 'phone', 'taxId']);
  });
  it('detecta posibles duplicados por nombre o teléfono', async () => {
    const a = await putRecord('customers', { ...emptyCustomer(), name: 'Juan Pérez', phone: '11 5555-1234' });
    expect(await findDuplicateCustomer({ ...emptyCustomer(), name: 'juan pérez' })).toMatchObject({ id: a.id });
    expect(await findDuplicateCustomer({ ...emptyCustomer(), name: 'Otro', phone: '(11) 5555 1234' })).toMatchObject({ id: a.id });
    expect(await findDuplicateCustomer({ ...emptyCustomer(), name: 'Otro', phone: '' })).toBeUndefined();
  });
});

describe('backup', () => {
  it('exporta e importa (reemplazo) sin perder datos', async () => {
    const mesa = await product('Mesa');
    await buy(mesa.id, '2', '10');
    await createQuote();
    const file = JSON.parse(JSON.stringify(await exportBackup()));
    expect(file.format).toBe('quotemaker-backup');
    useTestDatabase(`restore-${n}`);
    const r = await importBackup(file, 'replace');
    expect(r.ok).toBe(true);
    expect((await db.products.get(mesa.id))!.currentCost).toBe('10.0000');
    expect(await db.quotes.count()).toBe(1);
    expect(await db.purchases.count()).toBe(1);
  });
  it('merge no borra lo existente', async () => {
    const a = await product('A');
    const file = JSON.parse(JSON.stringify(await exportBackup()));
    useTestDatabase(`merge-${n}`);
    const b = await product('B');
    await importBackup(file, 'merge');
    expect(await db.products.get(a.id)).toBeDefined();
    expect(await db.products.get(b.id)).toBeDefined();
  });
  it('rechaza archivos inválidos o de versiones futuras', () => {
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup({ format: 'otro' }).ok).toBe(false);
    expect(validateBackup({ format: 'quotemaker-backup', version: 99, data: {} }).ok).toBe(false);
    expect(validateBackup({ format: 'quotemaker-backup', version: 1, data: { hackers: [] } }).ok).toBe(false);
    expect(validateBackup({ format: 'quotemaker-backup', version: 1, data: { products: [{ name: 'sin id' }] } }).ok).toBe(false);
  });
});
