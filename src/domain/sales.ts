/**
 * Ventas: historial de lo efectivamente vendido, por canal (presencial en el local u online)
 * y por cliente. Los importes usan las mismas reglas decimales que los presupuestos
 * (renglón con descuento %, descuento general %, impuesto %, envío cobrado). Por defecto el
 * impuesto es 0: el precio cargado es el precio final cobrado.
 *
 * La ganancia es INTERNA (usa el costo unitario congelado al registrar la venta).
 */
import { D, type Dec, roundMoney, sum, toDec } from './money';
import { computeCommercialTotals, type QuoteCommercialTotals } from './quote';
import type { OrderStatus, Sale, SaleChannel } from './types';

export interface SaleTotals {
  commercial: QuoteCommercialTotals;
  total: Dec;
  /** INTERNO */
  cost: Dec;
  /** INTERNO: base sin impuesto ni envío − costo de mercadería. */
  profit: Dec;
}

export function computeSaleTotals(sale: Pick<Sale, 'items' | 'globalDiscountPct' | 'shippingCharged' | 'taxPct'>): SaleTotals {
  const commercial = computeCommercialTotals({ items: sale.items, globalDiscountPct: sale.globalDiscountPct, taxPct: sale.taxPct || '0', shippingCharged: sale.shippingCharged });
  const cost = sum(sale.items.map((it) => roundMoney(D(it.quantity).times(D(it.unitCost || '0')))));
  const profit = D(commercial.taxableBase).minus(cost);
  return { commercial, total: commercial.total, cost: toDec(cost), profit: toDec(profit) };
}

/** Estado efectivo (registros viejos sin `status` = entregado; `cancelled` manda). */
export function saleStatus(s: Pick<Sale, 'status' | 'cancelled'>): OrderStatus {
  if (s.cancelled) return 'cancelado';
  return s.status ?? 'entregado';
}

/** ¿Suma en el historial de ventas? Borradores y cancelados no. */
export const saleCounts = (s: Pick<Sale, 'status' | 'cancelled'>) => {
  const st = saleStatus(s);
  return st === 'confirmado' || st === 'entregado';
};

export interface SalePaymentInfo {
  paid: Dec;
  balance: Dec;
  fullyPaid: boolean;
}

/** Cobrado y saldo. Sin lista de pagos = cobrada en su totalidad. */
export function salePayments(s: Pick<Sale, 'payments'>, total: Dec): SalePaymentInfo {
  if (!s.payments) return { paid: toDec(D(total)), balance: '0.00', fullyPaid: true };
  const paid = toDec(sum(s.payments.map((p) => roundMoney(D(p.amount || '0')))));
  const balance = toDec(D(total).minus(D(paid)));
  return { paid, balance, fullyPaid: D(balance).lte(0) };
}

export function validateSale(s: Sale): string[] {
  const e: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) e.push('Indicá la fecha de la venta.');
  if (s.items.length === 0) e.push('Agregá al menos un producto o concepto vendido.');
  s.items.forEach((it, i) => {
    const n = i + 1;
    if (!it.description.trim()) e.push(`Renglón ${n}: falta la descripción.`);
    if (!it.quantity || D(it.quantity).lte(0)) e.push(`Renglón ${n}: la cantidad debe ser mayor que 0.`);
    if (!it.unitPrice || D(it.unitPrice).lt(0)) e.push(`Renglón ${n}: el precio no puede ser negativo.`);
    if (it.discountPct && (D(it.discountPct).lt(0) || D(it.discountPct).gt(100))) e.push(`Renglón ${n}: el descuento debe estar entre 0 y 100 %.`);
  });
  if (s.globalDiscountPct && (D(s.globalDiscountPct).lt(0) || D(s.globalDiscountPct).gt(100))) e.push('El descuento general debe estar entre 0 y 100 %.');
  if (s.shippingCharged && D(s.shippingCharged).lt(0)) e.push('El envío no puede ser negativo.');
  if (s.taxPct && (D(s.taxPct).lt(0) || D(s.taxPct).gt(100))) e.push('El impuesto debe estar entre 0 y 100 %.');
  if (s.channel === 'online' && !s.platform.trim()) e.push('Indicá por dónde se hizo la venta online.');
  (s.payments ?? []).forEach((p, i) => {
    if (!p.amount || D(p.amount).lte(0)) e.push(`Pago ${i + 1}: el importe debe ser mayor que 0.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) e.push(`Pago ${i + 1}: indicá la fecha.`);
  });
  if (s.delivery?.mode === 'envio' && !s.delivery.address.trim()) e.push('Indicá la dirección de entrega.');
  if (s.delivery && D(s.delivery.internalCost || '0').lt(0)) e.push('El costo del envío no puede ser negativo.');
  return e;
}

export interface SalesSummary {
  count: number;
  total: Dec;
  profit: Dec; // INTERNO
  byChannel: Record<SaleChannel, { count: number; total: Dec }>;
  byPlatform: Array<{ platform: string; count: number; total: Dec }>;
  byCustomer: Array<{ key: string; name: string; count: number; total: Dec }>;
}

/** Resume ventas confirmadas o entregadas (sin borradores ni cancelaciones). `byCustomer` agrupa por cliente registrado o por nombre libre. */
export function summarizeSales(sales: Sale[]): SalesSummary {
  const live = sales.filter(saleCounts);
  const totals = live.map((s) => ({ s, t: computeSaleTotals(s) }));
  const byChannel: SalesSummary['byChannel'] = {
    presencial: { count: 0, total: '0.00' },
    online: { count: 0, total: '0.00' },
  };
  const platform = new Map<string, { count: number; total: Dec }>();
  const customer = new Map<string, { name: string; count: number; total: Dec }>();
  for (const { s, t } of totals) {
    const ch = byChannel[s.channel];
    ch.count += 1;
    ch.total = toDec(D(ch.total).plus(D(t.total)));
    if (s.channel === 'online') {
      const p = platform.get(s.platform) ?? { count: 0, total: '0.00' };
      platform.set(s.platform, { count: p.count + 1, total: toDec(D(p.total).plus(D(t.total))) });
    }
    const key = s.customerId ?? `nombre:${s.customerName.trim().toLocaleLowerCase('es') || 'consumidor final'}`;
    const c = customer.get(key) ?? { name: s.customerName.trim() || 'Consumidor final', count: 0, total: '0.00' };
    customer.set(key, { name: c.name, count: c.count + 1, total: toDec(D(c.total).plus(D(t.total))) });
  }
  const byTotal = <T extends { total: Dec }>(a: T, b: T) => D(b.total).cmp(D(a.total));
  return {
    count: live.length,
    total: toDec(sum(totals.map((x) => x.t.total))),
    profit: toDec(sum(totals.map((x) => x.t.profit))),
    byChannel,
    byPlatform: [...platform.entries()].map(([p, v]) => ({ platform: p, ...v })).sort(byTotal),
    byCustomer: [...customer.entries()].map(([key, v]) => ({ key, ...v })).sort(byTotal),
  };
}

export function formatSaleNumber(prefix: string, n: number) {
  return `${prefix}${String(n).padStart(5, '0')}`;
}
