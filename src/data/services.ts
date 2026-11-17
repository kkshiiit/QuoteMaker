/**
 * Operaciones de negocio sobre la base local. La UI sólo llama a estas funciones.
 */
import { computeExpenseAllocations, lotCosts, productCost } from '../domain/costing';
import { D, type Dec } from '../domain/money';
import { applyRounding, solvePrice } from '../domain/pricing';
import { ALLOWED_TRANSITIONS, addDays, formatQuoteNumber } from '../domain/quote';
import type {
  BusinessSettings,
  CostHistoryEntry,
  Customer,
  CustomerCommercialSnapshot,
  Expense,
  Product,
  Purchase,
  Quote,
  QuoteDocumentRecord,
  QuoteEvent,
  QuoteItem,
  QuoteStatus,
  Supplier,
} from '../domain/types';
import { QUOTE_STATUS_LABELS } from '../domain/types';
import { db } from './db';
import { defaultSettings, newId, nowIso, SETTINGS_ID, todayIso } from './defaults';
import { createBase, putRecord, putRecords } from './repo';

export async function getSettings(): Promise<BusinessSettings> {
  const s = await db.settings.get(SETTINGS_ID);
  if (s) return { ...defaultSettings(), ...s };
  const d = defaultSettings();
  await db.settings.put(d); // no se encola: sólo se sincroniza cuando la persona la edita
  return d;
}

export async function saveSettings(s: BusinessSettings) {
  return putRecord('settings', s);
}

const norm = (s: string) => s.trim().toLocaleLowerCase('es');

// ---------------- Productos ----------------

export function emptyProduct(): Product {
  return {
    ...createBase(),
    name: '',
    description: '',
    sku: '',
    categoryId: null,
    unit: 'u',
    supplierId: null,
    active: true,
    archived: false,
    image: null,
    unitWeight: '0',
    unitVolume: '0',
    currentCost: null,
    costUpdatedAt: null,
    costSource: null,
    manualCost: null,
    manualPrice: null,
    targetMarginPct: null,
    internalNotes: '',
  };
}

export async function validateProduct(p: Product): Promise<string[]> {
  const errors: string[] = [];
  if (!p.name.trim()) errors.push('El nombre es obligatorio.');
  if (p.name.length > 120) errors.push('El nombre no puede superar 120 caracteres.');
  if (!p.unit.trim()) errors.push('Indicá la unidad de medida.');
  for (const [label, v] of [['El costo manual', p.manualCost], ['El precio de venta', p.manualPrice], ['El margen objetivo', p.targetMarginPct]] as const) {
    if (v !== null && v !== '' && D(v).lt(0)) errors.push(`${label} no puede ser negativo.`);
  }
  if (p.targetMarginPct && D(p.targetMarginPct).gte(100)) errors.push('El margen objetivo debe ser menor a 100 %.');
  const others = (await db.products.toArray()).filter((x) => x.id !== p.id && !x.archived);
  if (others.some((x) => norm(x.name) === norm(p.name))) errors.push(`Ya existe un producto llamado "${p.name.trim()}".`);
  if (p.sku.trim() && others.some((x) => x.sku && norm(x.sku) === norm(p.sku))) errors.push(`El código "${p.sku.trim()}" ya está en uso.`);
  return errors;
}

export async function saveProduct(p: Product): Promise<Product> {
  const prev = await db.products.get(p.id);
  const saved = await putRecord('products', { ...p, name: p.name.trim(), sku: p.sku.trim() });
  if ((prev?.manualCost ?? null) !== (p.manualCost ?? null)) await recalcCosts(`Costo manual actualizado`);
  return (await db.products.get(saved.id)) ?? saved;
}

// ---------------- Costos ----------------

/**
 * Recalcula el costo actual de todos los productos a partir de compras y gastos asignados.
 * Registra en el historial cada cambio (nunca borra historial). No toca presupuestos:
 * cada ítem de presupuesto guarda su propio costo congelado.
 */
export async function recalcCosts(note = 'Recalculado'): Promise<number> {
  const [products, purchases, expenses, history] = await Promise.all([
    db.products.toArray(),
    db.purchases.toArray(),
    db.expenses.toArray(),
    db.costHistory.toArray(),
  ]);
  const costs = lotCosts(purchases, expenses);
  const lastHistory = new Map<string, CostHistoryEntry>();
  for (const h of history.sort((a, b) => a.at.localeCompare(b.at))) lastHistory.set(h.productId, h);
  const changedProducts: Product[] = [];
  const newHistory: CostHistoryEntry[] = [];
  const ts = nowIso();
  for (const p of products) {
    const pc = productCost(p, costs);
    const same = pc.unitCost === p.currentCost || (pc.unitCost !== null && p.currentCost !== null && D(pc.unitCost).eq(D(p.currentCost)));
    if (same) continue;
    const last = lastHistory.get(p.id);
    const source = pc.source === 'manual' ? 'manual' : pc.source === 'purchase' ? (last?.refId === pc.lotKey ? 'expense' : 'purchase') : 'recalc';
    changedProducts.push({ ...p, currentCost: pc.unitCost, costUpdatedAt: pc.unitCost ? ts : null, costSource: pc.unitCost ? source : null });
    if (pc.unitCost !== null) {
      newHistory.push({ ...createBase(), productId: p.id, unitCost: pc.unitCost, previousCost: p.currentCost, source, refId: pc.lotKey, note, at: ts });
    }
  }
  await putRecords('products', changedProducts);
  await putRecords('costHistory', newHistory);
  return changedProducts.length;
}

// ---------------- Proveedores / clientes ----------------

export function emptySupplier(): Supplier {
  return { ...createBase(), name: '', contactName: '', phone: '', email: '', address: '', notes: '', archived: false };
}

export function emptyCustomer(): Customer {
  return { ...createBase(), name: '', phone: '', email: '', address: '', taxId: '', notes: '', archived: false };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContact(c: { name: string; email: string; phone: string }, kind: 'cliente' | 'proveedor'): string[] {
  const e: string[] = [];
  if (!c.name.trim()) e.push(`El nombre del ${kind} es obligatorio.`);
  if (c.email.trim() && !EMAIL_RE.test(c.email.trim())) e.push('El email no tiene un formato válido.');
  if (c.phone.trim() && c.phone.replace(/\D/g, '').length < 6) e.push('El teléfono parece incompleto.');
  return e;
}

export async function findDuplicateCustomer(c: Customer): Promise<Customer | undefined> {
  const all = await db.customers.toArray();
  const phone = c.phone.replace(/\D/g, '');
  return all.find((x) => x.id !== c.id && !x.archived && (norm(x.name) === norm(c.name) || (phone.length >= 6 && x.phone.replace(/\D/g, '') === phone)));
}

/** Allowlist: sólo datos comerciales del cliente (sin notas privadas). */
export function customerSnapshot(c: Customer | null | undefined): CustomerCommercialSnapshot {
  return { name: c?.name ?? '', phone: c?.phone ?? '', email: c?.email ?? '', address: c?.address ?? '', taxId: c?.taxId ?? '' };
}

// ---------------- Compras y gastos ----------------

export function emptyPurchase(currency = 'ARS'): Purchase {
  return { ...createBase(), supplierId: null, date: todayIso(), reference: '', currency, exchangeRate: '1', items: [], discount: '0', extraCharges: '0', notes: '', attachment: null, voided: false };
}

export async function savePurchase(p: Purchase) {
  await putRecord('purchases', p);
  await recalcCosts(`Compra ${p.reference || p.date}`);
}

export async function setPurchaseVoided(p: Purchase, voided: boolean) {
  await putRecord('purchases', { ...p, voided });
  await recalcCosts(voided ? 'Compra anulada' : 'Compra restaurada');
}

export function emptyExpense(): Expense {
  return {
    ...createBase(),
    date: todayIso(),
    category: 'Combustible',
    description: '',
    amount: '',
    target: 'unassigned',
    purchaseId: null,
    productIds: [],
    method: 'units',
    manualValues: {},
    allocations: [],
    status: 'unassigned',
    notes: '',
  };
}

export async function saveExpense(e: Expense): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!e.amount || D(e.amount).lte(0)) return { ok: false, error: 'El importe debe ser mayor que cero.' };
  if (!e.category) return { ok: false, error: 'Elegí una categoría.' };
  if (e.status === 'void') {
    await putRecord('expenses', e);
    await recalcCosts('Gasto anulado');
    return { ok: true };
  }
  const purchases = await db.purchases.toArray();
  const names = new Map((await db.products.toArray()).map((p) => [p.id, p.name]));
  const r = computeExpenseAllocations(e, purchases, names);
  if (!r.ok) return r;
  const status = e.target === 'unassigned' ? 'unassigned' : 'allocated';
  await putRecord('expenses', { ...e, allocations: r.allocations, status });
  await recalcCosts(`Gasto ${e.category}${e.description ? `: ${e.description}` : ''}`);
  return { ok: true };
}

export async function voidExpense(e: Expense) {
  return saveExpense({ ...e, status: 'void' });
}

// ---------------- Presupuestos ----------------

function event(type: QuoteEvent['type'], detail: string): QuoteEvent {
  return { at: nowIso(), type, detail };
}

export async function createQuote(customer?: Customer | null): Promise<Quote> {
  return db.transaction('rw', [db.settings, db.quotes, db.outbox, db.syncState], async () => {
    const s = await getSettings();
    const number = formatQuoteNumber(s.quotePrefix, s.nextQuoteNumber);
    await putRecord('settings', { ...s, nextQuoteNumber: s.nextQuoteNumber + 1 });
    const today = todayIso();
    const q: Quote = {
      ...createBase(),
      number,
      customerId: customer?.id ?? null,
      customerSnapshot: customerSnapshot(customer),
      status: 'draft',
      issueDate: today,
      validUntil: addDays(today, s.defaultValidityDays),
      items: [],
      globalDiscountPct: '0',
      taxPct: s.defaultTaxPct,
      shippingCharged: '0',
      shippingCost: '0',
      conditions: s.defaultConditions,
      commercialNotes: '',
      internalNotes: '',
      frozen: null,
      events: [event('created', `Presupuesto ${number} creado`)],
    };
    return putRecord('quotes', q);
  });
}

export async function saveQuote(q: Quote): Promise<Quote> {
  if (q.frozen) throw new Error('Este presupuesto ya fue enviado y está congelado. Duplicalo para modificarlo.');
  const last = q.events[q.events.length - 1];
  const events = last && last.type === 'updated' && Date.now() - Date.parse(last.at) < 10 * 60_000 ? q.events : [...q.events, event('updated', 'Borrador editado')];
  return putRecord('quotes', { ...q, events });
}

export async function duplicateQuote(q: Quote): Promise<Quote> {
  const fresh = await createQuote(null);
  const src = q.frozen
    ? { items: q.frozen.items, customer: q.frozen.customer, globalDiscountPct: q.frozen.globalDiscountPct, taxPct: q.frozen.taxPct, shippingCharged: q.frozen.shippingCharged, shippingCost: q.frozen.shippingCost, conditions: q.frozen.conditions, commercialNotes: q.frozen.commercialNotes }
    : { items: q.items, customer: q.customerSnapshot, globalDiscountPct: q.globalDiscountPct, taxPct: q.taxPct, shippingCharged: q.shippingCharged, shippingCost: q.shippingCost, conditions: q.conditions, commercialNotes: q.commercialNotes };
  const dup: Quote = {
    ...fresh,
    customerId: q.customerId,
    customerSnapshot: { ...src.customer },
    items: src.items.map((it) => ({ ...it, id: newId() })),
    globalDiscountPct: src.globalDiscountPct,
    taxPct: src.taxPct,
    shippingCharged: src.shippingCharged,
    shippingCost: src.shippingCost,
    conditions: src.conditions,
    commercialNotes: src.commercialNotes,
    internalNotes: q.internalNotes,
    events: [...fresh.events, event('duplicated', `Duplicado de ${q.number}`)],
  };
  return putRecord('quotes', dup);
}

export async function changeQuoteStatus(q: Quote, status: QuoteStatus): Promise<Quote> {
  if (!ALLOWED_TRANSITIONS[q.status].includes(status)) {
    throw new Error(`No se puede pasar de ${QUOTE_STATUS_LABELS[q.status]} a ${QUOTE_STATUS_LABELS[status]}.`);
  }
  let frozen = q.frozen;
  const events = [...q.events];
  if (status === 'sent' && !frozen) {
    if (q.items.length === 0) throw new Error('Agregá al menos un ítem antes de marcarlo como enviado.');
    const s = await getSettings();
    frozen = {
      frozenAt: nowIso(),
      business: {
        businessName: s.businessName,
        legalName: s.legalName,
        taxId: s.showBusinessTaxId ? s.taxId : '',
        phone: s.showBusinessContactPhone ? s.phone : '',
        email: s.showBusinessContactEmail ? s.email : '',
        address: s.showBusinessAddress ? s.address : '',
        website: s.website,
      },
      customer: { ...q.customerSnapshot },
      items: q.items.map((it) => ({ ...it })),
      globalDiscountPct: q.globalDiscountPct,
      taxPct: q.taxPct,
      taxLabel: s.taxLabel,
      shippingCharged: q.shippingCharged,
      shippingCost: q.shippingCost,
      conditions: q.conditions,
      commercialNotes: q.commercialNotes,
      issueDate: q.issueDate,
      validUntil: q.validUntil,
      currency: s.currency,
    };
    events.push(event('issued', 'Datos comerciales y costos congelados'));
  }
  events.push(event('status', `${QUOTE_STATUS_LABELS[q.status]} → ${QUOTE_STATUS_LABELS[status]}`));
  return putRecord('quotes', { ...q, status, frozen, events });
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function recordQuoteDocument(q: Quote, kind: QuoteDocumentRecord['kind'], fileName: string, channel: QuoteDocumentRecord['channel'], content: Uint8Array | string) {
  const rec: QuoteDocumentRecord = { ...createBase(), quoteId: q.id, kind, fileName, channel, sha256: await sha256Hex(content) };
  await putRecord('quoteDocuments', rec);
  const label = kind === 'pdf' ? `PDF ${fileName}` : 'Mensaje de WhatsApp';
  const how = { download: 'descargado', share: 'compartido', copy: 'copiado', open: 'abierto en WhatsApp' }[channel];
  const fresh = (await db.quotes.get(q.id)) ?? q;
  await putRecord('quotes', { ...fresh, events: [...fresh.events, event(kind, `${label} ${how}`)] });
}

export function itemFromProduct(p: Product, suggested: Dec | null): QuoteItem {
  return {
    id: newId(),
    productId: p.id,
    description: p.description.trim() ? `${p.name} — ${p.description.trim()}` : p.name,
    unit: p.unit,
    quantity: '1',
    unitPrice: p.manualPrice ?? suggested ?? '0',
    discountPct: '0',
    unitCost: p.currentCost ?? '0',
  };
}

/** Precio sugerido = costo real ⟶ margen objetivo con cargos de configuración, redondeado. */
export function suggestedPrice(p: Pick<Product, 'currentCost' | 'targetMarginPct'>, s: BusinessSettings, overheadUnit: Dec = '0'): Dec | null {
  if (!p.currentCost) return null;
  const r = solvePrice({
    unitCost: p.currentCost,
    fixedPerUnit: D(s.defaultFixedPerUnit || '0').plus(D(overheadUnit)),
    pctCharges: s.defaultPctCharges,
    targetMarginPct: p.targetMarginPct ?? s.defaultTargetMarginPct,
  });
  return r.ok ? applyRounding(r.price, s.rounding).toFixed(2) : null;
}
