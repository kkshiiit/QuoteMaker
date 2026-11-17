/**
 * Costeo real por lotes.
 *
 * Un "lote" es un renglón de una compra (compra + artículo). Su costo total es:
 *   neto del renglón (cantidad × precio − descuento del renglón)
 *   + parte del cargo adicional de la factura (distribuido por valor)
 *   − parte del descuento general de la factura (distribuido por valor)
 *   + gastos asignados al lote (viajes, combustible, embalaje, etc.)
 * y su costo unitario real = costo total / cantidad (escala 4).
 *
 * El costo actual de un producto es el costo unitario real de su lote más reciente.
 * Si el producto no tiene compras, se usa el costo cargado manualmente.
 *
 * Regla contra la doble contabilización: un gasto con estado 'allocated' forma parte
 * del costo de los productos y NO se suma como gasto general. Los gastos generales
 * (alquiler, internet…) viven en otra colección y sólo se prorratean por unidad en la
 * calculadora si la persona usuaria lo habilita explícitamente.
 */
import Big from 'big.js';
import { allocate, type AllocationTarget } from './allocation';
import { D, type Dec, MONEY_SCALE, sum, toDec, UNIT_COST_SCALE } from './money';
import type { Expense, ExpenseAllocation, Overhead, OverheadFrequency, Product, Purchase, PurchaseItem } from './types';

export interface Lot {
  lotKey: string;
  purchaseId: string;
  itemId: string;
  productId: string;
  date: string;
  createdAt: string;
  quantity: Big;
  net: Big; // neto del renglón
  value: Big; // base "valor de compra"
  weight: Big;
  volume: Big;
  invoiceAdjustment: Big; // cargos − descuento general prorrateados
}

export const lotKeyOf = (purchaseId: string, itemId: string) => `${purchaseId}:${itemId}`;

export function itemNet(item: PurchaseItem): Big {
  return D(item.quantity).times(D(item.unitPrice)).minus(D(item.discount || '0'));
}

export function purchaseTotals(p: Purchase) {
  const itemsNet = sum(p.items.map(itemNet));
  const total = itemsNet.minus(D(p.discount || '0')).plus(D(p.extraCharges || '0'));
  return { itemsNet, total };
}

export function validatePurchase(p: Pick<Purchase, 'items' | 'discount' | 'extraCharges' | 'date'> & Partial<Pick<Purchase, 'currency' | 'exchangeRate'>>, baseCurrency?: string): string[] {
  const errors: string[] = [];
  const foreign = !!baseCurrency && !!p.currency && p.currency !== baseCurrency;
  if (foreign && (!p.exchangeRate || D(p.exchangeRate).lte(0) || D(p.exchangeRate).eq(1))) {
    // Un tipo de cambio 1 entre monedas distintas casi siempre es un olvido: se exige cargarlo.
    errors.push(`La compra está en ${p.currency}: indicá cuántos ${baseCurrency} vale 1 ${p.currency} (tipo de cambio).`);
  } else if (p.exchangeRate && D(p.exchangeRate).lte(0)) {
    errors.push('El tipo de cambio debe ser mayor que cero.');
  }
  if (!p.date) errors.push('Indicá la fecha de la compra.');
  if (p.items.length === 0) errors.push('Agregá al menos un artículo.');
  p.items.forEach((it, i) => {
    const n = i + 1;
    if (!it.productId) errors.push(`Artículo ${n}: elegí un producto.`);
    if (D(it.quantity || '0').lte(0)) errors.push(`Artículo ${n}: la cantidad debe ser mayor que cero.`);
    if (D(it.unitPrice || '0').lt(0)) errors.push(`Artículo ${n}: el precio no puede ser negativo.`);
    if (D(it.discount || '0').lt(0)) errors.push(`Artículo ${n}: el descuento no puede ser negativo.`);
    if (D(it.quantity || '0').gt(0) && itemNet(it).lt(0)) errors.push(`Artículo ${n}: el descuento supera el importe.`);
  });
  if (D(p.discount || '0').lt(0) || D(p.extraCharges || '0').lt(0)) errors.push('Descuento y cargos deben ser positivos.');
  const net = sum(p.items.map((it) => (D(it.quantity || '0').gt(0) ? itemNet(it) : new Big(0))));
  if (D(p.discount || '0').gt(net)) errors.push('El descuento general supera el total de los artículos.');
  return errors;
}

function distributeInvoiceAdjustments(p: Purchase): Map<string, Big> {
  const res = new Map<string, Big>(p.items.map((it) => [it.id, new Big(0)]));
  const values = p.items.map((it) => ({ key: it.id, basis: itemNet(it).toString() }));
  const totalValue = sum(values.map((v) => v.basis));
  const spread = (amount: Big, sign: 1 | -1) => {
    if (amount.lte(0)) return;
    const targets: AllocationTarget[] = totalValue.gt(0)
      ? values
      : p.items.map((it) => ({ key: it.id, basis: it.quantity })); // todo gratis: por unidades
    const r = allocate(amount.toFixed(MONEY_SCALE), totalValue.gt(0) ? 'value' : 'units', targets);
    if (!r.ok) return;
    for (const s of r.shares) res.set(s.key, res.get(s.key)!.plus(D(s.amount).times(sign)));
  };
  spread(D(p.extraCharges || '0'), 1);
  spread(D(p.discount || '0'), -1);
  return res;
}

/** Tipo de cambio de la compra a la moneda del negocio (1 si es la misma moneda). */
export function purchaseRate(p: Pick<Purchase, 'exchangeRate'>): Big {
  const r = D(p.exchangeRate || '1');
  return r.gt(0) ? r : new Big(1);
}

export function lotsOfPurchase(p: Purchase): Lot[] {
  if (p.voided) return [];
  const adj = distributeInvoiceAdjustments(p);
  const rate = purchaseRate(p); // todo el costeo se expresa en la moneda del negocio
  return p.items.map((it) => {
    const qty = D(it.quantity);
    return {
      lotKey: lotKeyOf(p.id, it.id),
      purchaseId: p.id,
      itemId: it.id,
      productId: it.productId,
      date: p.date,
      createdAt: p.createdAt,
      quantity: qty,
      net: itemNet(it).times(rate),
      value: itemNet(it).times(rate),
      weight: D(it.unitWeight || '0').times(qty),
      volume: D(it.unitVolume || '0').times(qty),
      invoiceAdjustment: (adj.get(it.id) ?? new Big(0)).times(rate),
    };
  });
}

export function allLots(purchases: Purchase[]): Lot[] {
  return purchases.flatMap(lotsOfPurchase);
}

const lotOrder = (a: Lot, b: Lot) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date));

export function latestLotByProduct(lots: Lot[]): Map<string, Lot> {
  const m = new Map<string, Lot>();
  for (const lot of [...lots].sort(lotOrder)) m.set(lot.productId, lot);
  return m;
}

/** Calcula las asignaciones de un gasto. No modifica nada: devuelve el desglose para previsualizar. */
export function computeExpenseAllocations(
  expense: Pick<Expense, 'amount' | 'target' | 'purchaseId' | 'productIds' | 'method' | 'manualValues'>,
  purchases: Purchase[],
  productNames: Map<string, string> = new Map(),
): { ok: true; allocations: ExpenseAllocation[] } | { ok: false; error: string } {
  if (expense.target === 'unassigned') return { ok: true, allocations: [] };
  let lots: Lot[];
  if (expense.target === 'purchase') {
    const p = purchases.find((x) => x.id === expense.purchaseId);
    if (!p) return { ok: false, error: 'Elegí la compra a la que corresponde el gasto.' };
    if (p.voided) return { ok: false, error: 'La compra elegida está anulada.' };
    lots = lotsOfPurchase(p);
  } else {
    if (expense.productIds.length === 0) return { ok: false, error: 'Elegí al menos un producto.' };
    const latest = latestLotByProduct(allLots(purchases));
    lots = [];
    for (const pid of expense.productIds) {
      const lot = latest.get(pid);
      if (!lot) {
        return {
          ok: false,
          error: `"${productNames.get(pid) ?? 'Producto'}" no tiene compras registradas. Registrá una compra para poder asignarle gastos.`,
        };
      }
      lots.push(lot);
    }
  }
  const targets: AllocationTarget[] = lots.map((l) => {
    const basis = { units: l.quantity, value: l.value, weight: l.weight, volume: l.volume, percent: null, amount: null }[expense.method];
    return {
      key: l.lotKey,
      basis: basis ? basis.toString() : undefined,
      percent: expense.method === 'percent' ? expense.manualValues[l.lotKey] ?? '0' : undefined,
      amount: expense.method === 'amount' ? expense.manualValues[l.lotKey] ?? '0' : undefined,
    };
  });
  const r = allocate(expense.amount, expense.method, targets);
  if (!r.ok) return r;
  return {
    ok: true,
    allocations: r.shares.map((s) => {
      const lot = lots.find((l) => l.lotKey === s.key)!;
      return { lotKey: lot.lotKey, purchaseId: lot.purchaseId, itemId: lot.itemId, productId: lot.productId, amount: s.amount };
    }),
  };
}

export interface LotCost {
  lot: Lot;
  expenses: Array<{ expenseId: string; category: string; amount: Big }>;
  expensesTotal: Big;
  total: Big;
  unitCost: Big;
}

export function lotCosts(purchases: Purchase[], expenses: Expense[]): Map<string, LotCost> {
  const res = new Map<string, LotCost>();
  for (const lot of allLots(purchases)) {
    res.set(lot.lotKey, { lot, expenses: [], expensesTotal: new Big(0), total: new Big(0), unitCost: new Big(0) });
  }
  for (const e of expenses) {
    if (e.status !== 'allocated') continue; // sólo gastos efectivamente asignados
    for (const a of e.allocations) {
      const lc = res.get(a.lotKey);
      if (!lc) continue; // compra anulada o renglón eliminado: el gasto queda huérfano (se reporta aparte)
      lc.expenses.push({ expenseId: e.id, category: e.category, amount: D(a.amount) });
      lc.expensesTotal = lc.expensesTotal.plus(D(a.amount));
    }
  }
  for (const lc of res.values()) {
    lc.total = lc.lot.net.plus(lc.lot.invoiceAdjustment).plus(lc.expensesTotal);
    lc.unitCost = lc.lot.quantity.gt(0) ? lc.total.div(lc.lot.quantity).round(UNIT_COST_SCALE, Big.roundHalfUp) : new Big(0);
  }
  return res;
}

/** Gastos asignados cuyos lotes ya no existen (compra anulada/editada). Se informan para reasignar. */
export function orphanExpenses(purchases: Purchase[], expenses: Expense[]): Expense[] {
  const keys = new Set(allLots(purchases).map((l) => l.lotKey));
  return expenses.filter((e) => e.status === 'allocated' && e.allocations.some((a) => !keys.has(a.lotKey)));
}

export interface ProductCost {
  unitCost: Dec | null;
  source: 'purchase' | 'manual' | null;
  lotKey: string | null;
  purchaseUnitCost: Dec | null; // sin gastos
  allocatedPerUnit: Dec | null; // gastos asignados por unidad
  date: string | null;
}

export function productCost(product: Pick<Product, 'id' | 'manualCost'>, costs: Map<string, LotCost>): ProductCost {
  let latest: LotCost | null = null;
  for (const lc of costs.values()) {
    if (lc.lot.productId !== product.id) continue;
    if (!latest || lotOrder(latest.lot, lc.lot) < 0) latest = lc;
  }
  if (latest && latest.lot.quantity.gt(0)) {
    const purchaseUnit = latest.lot.net.plus(latest.lot.invoiceAdjustment).div(latest.lot.quantity);
    return {
      unitCost: toDec(latest.unitCost, UNIT_COST_SCALE),
      source: 'purchase',
      lotKey: latest.lot.lotKey,
      purchaseUnitCost: toDec(purchaseUnit, UNIT_COST_SCALE),
      allocatedPerUnit: toDec(latest.expensesTotal.div(latest.lot.quantity), UNIT_COST_SCALE),
      date: latest.lot.date,
    };
  }
  if (product.manualCost !== null && product.manualCost !== '') {
    return { unitCost: toDec(product.manualCost, UNIT_COST_SCALE), source: 'manual', lotKey: null, purchaseUnitCost: null, allocatedPerUnit: null, date: null };
  }
  return { unitCost: null, source: null, lotKey: null, purchaseUnitCost: null, allocatedPerUnit: null, date: null };
}

// ---------------- Gastos generales ----------------

const MONTHLY_FACTOR: Record<OverheadFrequency, Big> = {
  once: new Big(0),
  weekly: new Big(52).div(12),
  monthly: new Big(1),
  quarterly: new Big(1).div(3),
  yearly: new Big(1).div(12),
};

export function overheadMonthlyEquivalent(o: Pick<Overhead, 'amount' | 'frequency'>): Big {
  return D(o.amount).times(MONTHLY_FACTOR[o.frequency]);
}

const MONTH_STEP: Partial<Record<OverheadFrequency, number>> = { monthly: 1, quarterly: 3, yearly: 12 };

/**
 * k-ésima ocurrencia contada desde el inicio, con el día limitado al último del mes
 * (un gasto del 31/01 vence el 28 o 29/02, el 31/03, el 30/04…).
 */
export function nthOccurrence(start: Date, f: OverheadFrequency, k: number): Date {
  if (f === 'weekly') return new Date(start.getTime() + k * 7 * 86400000);
  const step = MONTH_STEP[f] ?? 1;
  const totalMonths = start.getUTCMonth() + k * step;
  const y = start.getUTCFullYear() + Math.floor(totalMonths / 12);
  const m = ((totalMonths % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(start.getUTCDate(), lastDay)));
}

/** Cantidad de ocurrencias de un gasto general dentro de [from, to] (fechas YYYY-MM-DD inclusive). */
export function overheadOccurrences(o: Pick<Overhead, 'frequency' | 'startDate' | 'endDate' | 'active'>, from: string, to: string): number {
  if (!o.active) return 0;
  const start = new Date(`${o.startDate}T00:00:00Z`);
  const end = new Date(`${(o.endDate && o.endDate < to ? o.endDate : to)}T00:00:00Z`);
  const fromD = new Date(`${from}T00:00:00Z`);
  if (o.frequency === 'once') return start >= fromD && start <= end ? 1 : 0;
  let count = 0;
  for (let k = 0; k < 5000; k++) {
    const cur = nthOccurrence(start, o.frequency, k);
    if (cur > end) break;
    if (cur >= fromD) count++;
  }
  return count;
}

export function overheadPerUnit(overheads: Overhead[], estimatedMonthlyUnits: Dec): Big | null {
  const units = D(estimatedMonthlyUnits || '0');
  if (units.lte(0)) return null;
  const monthly = sum(overheads.filter((o) => o.active && o.includeInUnitCost).map(overheadMonthlyEquivalent));
  return monthly.div(units);
}

export interface ExpenseLedger {
  allocatedToCost: Big; // ya incluido en el costo de productos
  unassigned: Big; // pendiente de decidir
  overhead: Big; // gastos generales del período
  total: Big; // cada gasto contado UNA sola vez
  voided: Big; // informativo, no suma
}

export function expenseLedger(expenses: Expense[], overheads: Overhead[], from: string, to: string): ExpenseLedger {
  const inRange = (d: string) => d >= from && d <= to;
  const ex = expenses.filter((e) => inRange(e.date));
  const allocatedToCost = sum(ex.filter((e) => e.status === 'allocated').map((e) => e.amount));
  const unassigned = sum(ex.filter((e) => e.status === 'unassigned').map((e) => e.amount));
  const voided = sum(ex.filter((e) => e.status === 'void').map((e) => e.amount));
  const overhead = sum(overheads.map((o) => D(o.amount).times(overheadOccurrences(o, from, to))));
  return { allocatedToCost, unassigned, overhead, voided, total: allocatedToCost.plus(unassigned).plus(overhead) };
}
