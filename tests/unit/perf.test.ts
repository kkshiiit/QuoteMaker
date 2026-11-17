/**
 * Rendimiento de cálculos (medido, con límites holgados para detectar regresiones graves).
 * Los tiempos reales se imprimen y se documentan en docs/PERFORMANCE.md.
 */
import { describe, expect, it } from 'vitest';
import { allocate } from '../../src/domain/allocation';
import { lotCosts } from '../../src/domain/costing';
import { computeCommercialTotals, computeInternal } from '../../src/domain/quote';
import type { Expense, Purchase, QuoteItem } from '../../src/domain/types';

const time = (label: string, fn: () => void) => {
  const t = performance.now();
  fn();
  const ms = performance.now() - t;
  console.log(`[perf] ${label}: ${ms.toFixed(1)} ms`);
  return ms;
};

describe('rendimiento de cálculos', () => {
  it('distribuye un gasto entre 1.000 destinos', () => {
    const targets = Array.from({ length: 1000 }, (_, i) => ({ key: `k${i}`, basis: String(1 + (i % 17)) }));
    expect(time('allocate 1.000 destinos', () => void allocate('123456.78', 'units', targets))).toBeLessThan(1000);
  });

  it('presupuesto de 500 ítems (comercial + interno)', () => {
    const items: QuoteItem[] = Array.from({ length: 500 }, (_, i) => ({ id: `i${i}`, productId: null, description: `Ítem ${i}`, unit: 'u', quantity: String(1 + (i % 9)), unitPrice: '1234.56', discountPct: String(i % 15), unitCost: '700.1234' }));
    const ms = time('quote 500 ítems', () => {
      const t = computeCommercialTotals({ items, globalDiscountPct: '7', taxPct: '21', shippingCharged: '1500' });
      computeInternal({ items, shippingCost: '900', globalDiscountPct: '7' }, t);
    });
    expect(ms).toBeLessThan(1000);
  });

  it('costeo de 1.000 compras × 5 artículos con 2.000 gastos asignados', () => {
    const purchases: Purchase[] = Array.from({ length: 1000 }, (_, p) => ({
      id: `p${p}`, createdAt: '2026-01-01T00:00:00Z', updatedAt: '', supplierId: null, date: `2026-01-${String(1 + (p % 28)).padStart(2, '0')}`, reference: '', currency: 'ARS',
      items: Array.from({ length: 5 }, (_, k) => ({ id: `i${k}`, productId: `prod${(p * 5 + k) % 300}`, quantity: '10', unitPrice: '1500', discount: '0', unitWeight: '1', unitVolume: '1' })),
      discount: '100', extraCharges: '250', notes: '', attachment: null, voided: false,
    }));
    const expenses: Expense[] = Array.from({ length: 2000 }, (_, e) => ({
      id: `e${e}`, createdAt: '', updatedAt: '', date: '2026-01-10', category: 'Combustible', description: '', amount: '100', target: 'purchase', purchaseId: `p${e % 1000}`, productIds: [], method: 'units', manualValues: {},
      allocations: [{ lotKey: `p${e % 1000}:i0`, purchaseId: `p${e % 1000}`, itemId: 'i0', productId: 'x', amount: '100.00' }], status: 'allocated', notes: '',
    }));
    expect(time('lotCosts 5.000 lotes + 2.000 gastos', () => void lotCosts(purchases, expenses))).toBeLessThan(5000);
  });
});
