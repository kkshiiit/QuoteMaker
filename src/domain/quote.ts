/**
 * Cálculos de presupuestos.
 *
 * Comercial (lo que ve el cliente):
 *   subtotal renglón = round2(cantidad × precio)
 *   descuento renglón = round2(subtotal renglón × desc% / 100)
 *   subtotal = Σ (subtotal renglón − descuento renglón)
 *   descuento general = round2(subtotal × descGeneral% / 100)
 *   base imponible = subtotal − descuento general
 *   impuesto = round2(base imponible × impuesto% / 100)
 *   total = base imponible + impuesto + envío cobrado
 * El envío cobrado no lleva impuesto (documentado en docs/USER_GUIDE.md).
 *
 * Interno (QuoteInternalCalculation, NUNCA sale del dispositivo hacia documentos):
 *   costo mercadería = Σ round2(cantidad × costo unitario congelado)
 *   ganancia = base imponible + envío cobrado − costo mercadería − costo de envío
 */
import Big from 'big.js';
import { D, type Dec, pctOf, roundMoney, sum, toDec } from './money';
import { markupPct, marginPct } from './pricing';
import type { Quote, QuoteItem, QuoteStatus } from './types';

export interface CommercialLine {
  id: string;
  description: string;
  unit: string;
  quantity: Dec;
  unitPrice: Dec;
  discountPct: Dec;
  gross: Dec;
  discount: Dec;
  net: Dec;
}

export interface QuoteCommercialTotals {
  lines: CommercialLine[];
  subtotal: Dec;
  lineDiscounts: Dec;
  globalDiscount: Dec;
  taxableBase: Dec;
  tax: Dec;
  shipping: Dec;
  total: Dec;
}

export interface QuoteInternalCalculation {
  goodsCost: Dec;
  shippingCost: Dec;
  revenueNet: Dec; // base imponible + envío cobrado (sin impuesto)
  profit: Dec;
  marginPct: Big | null;
  markupPct: Big | null;
  lines: Array<{ id: string; cost: Dec; revenue: Dec; profit: Dec; marginPct: Big | null; belowCost: boolean }>;
  hasMissingCosts: boolean;
}

type ItemLike = Pick<QuoteItem, 'id' | 'description' | 'unit' | 'quantity' | 'unitPrice' | 'discountPct'>;

export function computeCommercialTotals(input: {
  items: ItemLike[];
  globalDiscountPct: Dec;
  taxPct: Dec;
  shippingCharged: Dec;
}): QuoteCommercialTotals {
  const lines: CommercialLine[] = input.items.map((it) => {
    const gross = roundMoney(D(it.quantity).times(D(it.unitPrice)));
    const discount = roundMoney(pctOf(gross, it.discountPct || '0'));
    return {
      id: it.id,
      description: it.description,
      unit: it.unit,
      quantity: it.quantity,
      unitPrice: toDec(it.unitPrice),
      discountPct: it.discountPct || '0',
      gross: toDec(gross),
      discount: toDec(discount),
      net: toDec(gross.minus(discount)),
    };
  });
  const subtotal = sum(lines.map((l) => l.net));
  const lineDiscounts = sum(lines.map((l) => l.discount));
  const globalDiscount = roundMoney(pctOf(subtotal, input.globalDiscountPct || '0'));
  const taxableBase = subtotal.minus(globalDiscount);
  const tax = roundMoney(pctOf(taxableBase, input.taxPct || '0'));
  const shipping = roundMoney(D(input.shippingCharged || '0'));
  return {
    lines,
    subtotal: toDec(subtotal),
    lineDiscounts: toDec(lineDiscounts),
    globalDiscount: toDec(globalDiscount),
    taxableBase: toDec(taxableBase),
    tax: toDec(tax),
    shipping: toDec(shipping),
    total: toDec(taxableBase.plus(tax).plus(shipping)),
  };
}

export function computeInternal(
  input: { items: QuoteItem[]; shippingCost: Dec; globalDiscountPct: Dec },
  totals: QuoteCommercialTotals,
): QuoteInternalCalculation {
  const gFactor = new Big(1).minus(D(input.globalDiscountPct || '0').div(100));
  const lines = input.items.map((it, i) => {
    const cost = roundMoney(D(it.quantity).times(D(it.unitCost || '0')));
    // ingreso de la línea después del descuento general prorrateado
    const revenue = roundMoney(D(totals.lines[i]!.net).times(gFactor));
    return {
      id: it.id,
      cost: toDec(cost),
      revenue: toDec(revenue),
      profit: toDec(revenue.minus(cost)),
      marginPct: marginPct(revenue, cost),
      belowCost: revenue.lt(cost),
    };
  });
  const goodsCost = sum(lines.map((l) => l.cost));
  const shippingCost = roundMoney(D(input.shippingCost || '0'));
  const revenueNet = D(totals.taxableBase).plus(D(totals.shipping));
  const totalCost = goodsCost.plus(shippingCost);
  return {
    goodsCost: toDec(goodsCost),
    shippingCost: toDec(shippingCost),
    revenueNet: toDec(revenueNet),
    profit: toDec(revenueNet.minus(totalCost)),
    marginPct: marginPct(revenueNet, totalCost),
    markupPct: markupPct(revenueNet, totalCost),
    lines,
    hasMissingCosts: input.items.some((it) => !it.unitCost || D(it.unitCost).lte(0)),
  };
}

/** Devuelve la versión efectiva del presupuesto: la congelada si existe, si no la editable. */
export function effectiveQuote(q: Quote) {
  if (q.frozen) {
    return {
      items: q.frozen.items,
      globalDiscountPct: q.frozen.globalDiscountPct,
      taxPct: q.frozen.taxPct,
      shippingCharged: q.frozen.shippingCharged,
      shippingCost: q.frozen.shippingCost,
      conditions: q.frozen.conditions,
      commercialNotes: q.frozen.commercialNotes,
      issueDate: q.frozen.issueDate,
      validUntil: q.frozen.validUntil,
      customer: q.frozen.customer,
    };
  }
  return {
    items: q.items,
    globalDiscountPct: q.globalDiscountPct,
    taxPct: q.taxPct,
    shippingCharged: q.shippingCharged,
    shippingCost: q.shippingCost,
    conditions: q.conditions,
    commercialNotes: q.commercialNotes,
    issueDate: q.issueDate,
    validUntil: q.validUntil,
    customer: q.customerSnapshot,
  };
}

export function quoteTotals(q: Quote) {
  const e = effectiveQuote(q);
  const totals = computeCommercialTotals(e);
  return { totals, internal: computeInternal(e, totals) };
}

export function validateQuote(q: Pick<Quote, 'items' | 'globalDiscountPct' | 'taxPct' | 'shippingCharged' | 'issueDate' | 'validUntil'>): string[] {
  const errors: string[] = [];
  if (q.items.length === 0) errors.push('Agregá al menos un producto o concepto.');
  q.items.forEach((it, i) => {
    const n = i + 1;
    if (!it.description.trim()) errors.push(`Ítem ${n}: escribí una descripción.`);
    if (D(it.quantity || '0').lte(0)) errors.push(`Ítem ${n}: la cantidad debe ser mayor que cero.`);
    if (D(it.unitPrice || '0').lt(0)) errors.push(`Ítem ${n}: el precio no puede ser negativo.`);
    const dp = D(it.discountPct || '0');
    if (dp.lt(0) || dp.gt(100)) errors.push(`Ítem ${n}: el descuento debe estar entre 0 y 100 %.`);
  });
  const g = D(q.globalDiscountPct || '0');
  if (g.lt(0) || g.gt(100)) errors.push('El descuento general debe estar entre 0 y 100 %.');
  if (D(q.taxPct || '0').lt(0)) errors.push('El impuesto no puede ser negativo.');
  if (D(q.shippingCharged || '0').lt(0)) errors.push('El envío no puede ser negativo.');
  if (q.validUntil && q.issueDate && q.validUntil < q.issueDate) errors.push('La validez no puede ser anterior a la fecha del presupuesto.');
  return errors;
}

/** Transiciones manuales permitidas. Ningún estado cambia automáticamente. */
export const ALLOWED_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['accepted', 'rejected', 'expired', 'cancelled'],
  accepted: ['sent', 'cancelled'],
  rejected: ['sent'],
  expired: ['sent', 'cancelled'],
  cancelled: [],
};

export function formatQuoteNumber(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(5, '0')}`;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isPastValidity(q: Pick<Quote, 'validUntil' | 'status'>, today: string): boolean {
  return q.status === 'sent' && !!q.validUntil && q.validUntil < today;
}
