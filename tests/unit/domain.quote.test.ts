import { describe, expect, it } from 'vitest';
import { ALLOWED_TRANSITIONS, addDays, computeCommercialTotals, computeInternal, formatQuoteNumber, isPastValidity, validateQuote } from '../../src/domain/quote';
import type { QuoteItem } from '../../src/domain/types';

const item = (id: string, quantity: string, unitPrice: string, discountPct = '0', unitCost = '0'): QuoteItem => ({
  id, productId: null, description: `Item ${id}`, unit: 'u', quantity, unitPrice, discountPct, unitCost,
});

describe('totales comerciales', () => {
  it('calcula subtotal, descuentos, impuesto, envío y total', () => {
    const t = computeCommercialTotals({
      items: [item('a', '3', '33.333'), item('b', '2', '50', '10')],
      globalDiscountPct: '5',
      taxPct: '21',
      shippingCharged: '1500',
    });
    // a: 3 × 33.333 = 99.999 → 100.00 ; b: 100 − 10 = 90
    expect(t.lines.map((l) => l.net)).toEqual(['100.00', '90.00']);
    expect(t.subtotal).toBe('190.00');
    expect(t.lineDiscounts).toBe('10.00');
    expect(t.globalDiscount).toBe('9.50');
    expect(t.taxableBase).toBe('180.50');
    expect(t.tax).toBe('37.91'); // 37.905 → half-up
    expect(t.shipping).toBe('1500.00');
    expect(t.total).toBe('1718.41');
  });

  it('presupuesto vacío da cero', () => {
    const t = computeCommercialTotals({ items: [], globalDiscountPct: '0', taxPct: '21', shippingCharged: '0' });
    expect(t.total).toBe('0.00');
  });

  it('cantidades fraccionarias y montos grandes', () => {
    const t = computeCommercialTotals({ items: [item('a', '1.5', '999999999.99')], globalDiscountPct: '0', taxPct: '0', shippingCharged: '0' });
    expect(t.total).toBe('1499999999.99'); // 1499999999.985 → .99
  });
});

describe('cálculo interno', () => {
  it('ganancia, margen y markup incluyendo costo de envío', () => {
    const items = [item('a', '2', '100', '0', '60'), item('b', '1', '50', '0', '55')];
    const totals = computeCommercialTotals({ items, globalDiscountPct: '10', taxPct: '21', shippingCharged: '20' });
    const internal = computeInternal({ items, shippingCost: '15', globalDiscountPct: '10' }, totals);
    // base 250 − 25 = 225 ; ingreso neto 225 + 20 = 245 ; costo 120 + 55 + 15 = 190
    expect(internal.goodsCost).toBe('175.00');
    expect(internal.profit).toBe('55.00');
    expect(internal.marginPct!.toFixed(2)).toBe('22.45');
    expect(internal.markupPct!.toFixed(2)).toBe('28.95');
    // b: ingreso 45 < costo 55 → bajo costo
    expect(internal.lines[1]!.belowCost).toBe(true);
    expect(internal.lines[0]!.belowCost).toBe(false);
  });
  it('detecta costos faltantes', () => {
    const items = [item('a', '1', '10')];
    const totals = computeCommercialTotals({ items, globalDiscountPct: '0', taxPct: '0', shippingCharged: '0' });
    expect(computeInternal({ items, shippingCost: '0', globalDiscountPct: '0' }, totals).hasMissingCosts).toBe(true);
  });
});

describe('validación y estados', () => {
  it('valida ítems y fechas', () => {
    const errors = validateQuote({
      items: [{ ...item('a', '0', '-1', '150'), description: ' ' }],
      globalDiscountPct: '101', taxPct: '-1', shippingCharged: '-3', issueDate: '2026-02-01', validUntil: '2026-01-01',
    });
    expect(errors).toHaveLength(8);
  });
  it('las transiciones son manuales y cancelado es terminal', () => {
    expect(ALLOWED_TRANSITIONS.cancelled).toEqual([]);
    expect(ALLOWED_TRANSITIONS.draft).toContain('sent');
    expect(ALLOWED_TRANSITIONS.draft).not.toContain('accepted');
  });
  it('vencimiento sólo se sugiere, no cambia el estado', () => {
    expect(isPastValidity({ status: 'sent', validUntil: '2026-01-01' }, '2026-01-02')).toBe(true);
    expect(isPastValidity({ status: 'draft', validUntil: '2026-01-01' }, '2026-01-02')).toBe(false);
  });
  it('numeración y fechas', () => {
    expect(formatQuoteNumber('P-', 7)).toBe('P-00007');
    expect(addDays('2026-01-30', 15)).toBe('2026-02-14');
  });
});
