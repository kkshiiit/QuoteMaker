import { describe, expect, it } from 'vitest';
import { allocate, largestRemainder } from '../../src/domain/allocation';
import { D, sum } from '../../src/domain/money';
import {
  computeExpenseAllocations,
  expenseLedger,
  lotCosts,
  orphanExpenses,
  overheadMonthlyEquivalent,
  overheadOccurrences,
  overheadPerUnit,
  productCost,
  purchaseTotals,
  validatePurchase,
} from '../../src/domain/costing';
import type { Expense, Overhead, Purchase } from '../../src/domain/types';

const now = '2026-01-01T00:00:00.000Z';

function purchase(id: string, date: string, items: Array<[string, string, string, string?]>, extra: Partial<Purchase> = {}): Purchase {
  return {
    id,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: now,
    supplierId: null,
    date,
    reference: '',
    currency: 'ARS',
    items: items.map(([itemId, productId, qty, price], i) => ({
      id: itemId,
      productId,
      quantity: qty,
      unitPrice: price ?? '0',
      discount: '0',
      unitWeight: String(i + 1),
      unitVolume: '0',
    })),
    discount: '0',
    extraCharges: '0',
    notes: '',
    attachment: null,
    voided: false,
    ...extra,
  };
}

function expense(partial: Partial<Expense>): Expense {
  return {
    id: 'e1',
    createdAt: now,
    updatedAt: now,
    date: '2026-01-10',
    category: 'Combustible',
    description: '',
    amount: '100',
    target: 'unassigned',
    purchaseId: null,
    productIds: [],
    method: 'units',
    manualValues: {},
    allocations: [],
    status: 'unassigned',
    notes: '',
    ...partial,
  };
}

describe('largestRemainder / allocate', () => {
  it('reparte 100 en 3 partes iguales con residuo exacto', () => {
    const parts = largestRemainder(D('100'), [D(1), D(1), D(1)]);
    expect(parts.map((p) => p.toFixed(2))).toEqual(['33.34', '33.33', '33.33']);
    expect(sum(parts).toFixed(2)).toBe('100.00');
  });
  it('la suma siempre coincide con el total (propiedad, 500 casos)', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 500; i++) {
      const total = (Math.floor(rnd() * 1_000_000) / 100 + 0.01).toFixed(2);
      const n = 1 + Math.floor(rnd() * 7);
      const targets = Array.from({ length: n }, (_, k) => ({ key: `k${k}`, basis: String(1 + Math.floor(rnd() * 1000)) }));
      const r = allocate(total, 'units', targets);
      expect(r.ok).toBe(true);
      if (r.ok) expect(sum(r.shares.map((s) => s.amount)).toFixed(2)).toBe(D(total).toFixed(2));
    }
  });
  it('por porcentaje exige 100 %', () => {
    expect(allocate('50', 'percent', [{ key: 'a', percent: '50' }, { key: 'b', percent: '40' }]).ok).toBe(false);
    const r = allocate('50', 'percent', [{ key: 'a', percent: '33.3333' }, { key: 'b', percent: '66.6667' }]);
    expect(r.ok && r.shares.map((s) => s.amount)).toEqual(['16.67', '33.33']);
  });
  it('por importe exige suma exacta', () => {
    expect(allocate('50', 'amount', [{ key: 'a', amount: '20' }, { key: 'b', amount: '20' }]).ok).toBe(false);
    expect(allocate('50', 'amount', [{ key: 'a', amount: '20' }, { key: 'b', amount: '30' }]).ok).toBe(true);
  });
  it('rechaza importes cero/negativos, bases vacías y destinos repetidos', () => {
    expect(allocate('0', 'units', [{ key: 'a', basis: '1' }]).ok).toBe(false);
    expect(allocate('-5', 'units', [{ key: 'a', basis: '1' }]).ok).toBe(false);
    expect(allocate('5', 'weight', [{ key: 'a', basis: '0' }]).ok).toBe(false);
    expect(allocate('5', 'units', [{ key: 'a', basis: '1' }, { key: 'a', basis: '1' }]).ok).toBe(false);
    expect(allocate('5', 'units', []).ok).toBe(false);
  });
});

describe('costeo por lotes', () => {
  const p1 = purchase('p1', '2026-01-05', [
    ['i1', 'A', '10', '100'], // 1000
    ['i2', 'B', '30', '100'], // 3000
  ], { extraCharges: '400', discount: '200' });

  it('calcula totales de compra', () => {
    expect(purchaseTotals(p1).total.toFixed(2)).toBe('4200.00');
  });

  it('distribuye cargos y descuento general por valor', () => {
    const costs = lotCosts([p1], []);
    // A: 1000 + 100 − 50 = 1050 → 105 c/u ; B: 3000 + 300 − 150 = 3150 → 105 c/u
    expect(costs.get('p1:i1')!.unitCost.toFixed(4)).toBe('105.0000');
    expect(costs.get('p1:i2')!.unitCost.toFixed(4)).toBe('105.0000');
    const total = sum([...costs.values()].map((c) => c.total));
    expect(total.toFixed(2)).toBe(purchaseTotals(p1).total.toFixed(2));
  });

  it('asigna un gasto a la compra por unidades y actualiza el costo unitario', () => {
    const e = expense({ target: 'purchase', purchaseId: 'p1', amount: '400', method: 'units' });
    const r = computeExpenseAllocations(e, [p1]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.allocations.map((a) => a.amount)).toEqual(['100.00', '300.00']);
    const costs = lotCosts([p1], [{ ...e, allocations: r.allocations, status: 'allocated' }]);
    expect(costs.get('p1:i1')!.unitCost.toFixed(4)).toBe('115.0000');
    expect(costs.get('p1:i2')!.unitCost.toFixed(4)).toBe('115.0000');
  });

  it('por valor y por peso dan resultados distintos y exactos', () => {
    const byValue = computeExpenseAllocations(expense({ target: 'purchase', purchaseId: 'p1', amount: '100', method: 'value' }), [p1]);
    expect(byValue.ok && byValue.allocations.map((a) => a.amount)).toEqual(['25.00', '75.00']);
    // pesos unitarios 1 y 2 → totales 10 y 60
    const byWeight = computeExpenseAllocations(expense({ target: 'purchase', purchaseId: 'p1', amount: '100', method: 'weight' }), [p1]);
    expect(byWeight.ok && byWeight.allocations.map((a) => a.amount)).toEqual(['14.29', '85.71']);
  });

  it('asignación a productos usa el lote más reciente de cada producto', () => {
    const p2 = purchase('p2', '2026-02-01', [['j1', 'A', '5', '120']]);
    const r = computeExpenseAllocations(expense({ target: 'products', productIds: ['A', 'B'], amount: '90', method: 'units' }), [p1, p2]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.allocations.map((a) => [a.lotKey, a.amount])).toEqual([
      ['p2:j1', '12.86'],
      ['p1:i2', '77.14'],
    ]);
  });

  it('error claro si un producto no tiene compras', () => {
    const r = computeExpenseAllocations(expense({ target: 'products', productIds: ['Z'], amount: '10' }), [p1], new Map([['Z', 'Tornillo']]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Tornillo');
  });

  it('el costo actual del producto viene del lote más reciente; manual sólo si no hay compras', () => {
    const p2 = purchase('p2', '2026-02-01', [['j1', 'A', '5', '120']]);
    const costs = lotCosts([p1, p2], []);
    expect(productCost({ id: 'A', manualCost: '1' }, costs).unitCost).toBe('120.0000');
    expect(productCost({ id: 'C', manualCost: '7.5' }, costs)).toMatchObject({ unitCost: '7.5000', source: 'manual' });
    expect(productCost({ id: 'D', manualCost: null }, costs).unitCost).toBeNull();
  });

  it('una compra anulada deja de aportar costo y sus gastos quedan huérfanos para reasignar', () => {
    const e = expense({ target: 'purchase', purchaseId: 'p1', amount: '40', status: 'allocated' });
    const r = computeExpenseAllocations(e, [p1]);
    const allocated = { ...e, allocations: r.ok ? r.allocations : [] };
    const voided = { ...p1, voided: true };
    expect(lotCosts([voided], [allocated]).size).toBe(0);
    expect(orphanExpenses([voided], [allocated]).map((x) => x.id)).toEqual(['e1']);
  });

  it('los gastos no asignados o anulados no modifican costos', () => {
    const r = computeExpenseAllocations(expense({ target: 'purchase', purchaseId: 'p1', amount: '400' }), [p1]);
    const allocs = r.ok ? r.allocations : [];
    const costs = lotCosts([p1], [
      expense({ id: 'x', status: 'void', allocations: allocs }),
      expense({ id: 'y', status: 'unassigned' }),
    ]);
    expect(costs.get('p1:i1')!.unitCost.toFixed(4)).toBe('105.0000');
  });

  it('valida compras', () => {
    expect(validatePurchase({ date: '', items: [], discount: '0', extraCharges: '0' })).toHaveLength(2);
    const bad = purchase('x', '2026-01-01', [['i', 'A', '0', '10']]);
    expect(validatePurchase(bad).join(' ')).toContain('cantidad');
    const over = purchase('x', '2026-01-01', [['i', 'A', '1', '10']], { discount: '11' });
    expect(validatePurchase(over).join(' ')).toContain('descuento general');
  });
});

describe('gastos generales y doble contabilización', () => {
  const rent: Overhead = {
    id: 'o1', createdAt: now, updatedAt: now, name: 'Alquiler', category: 'Alquiler', amount: '1000', currency: 'ARS',
    frequency: 'monthly', kind: 'fixed', startDate: '2026-01-01', endDate: null, active: true, includeInUnitCost: true, notes: '',
  };

  it('equivalente mensual', () => {
    expect(overheadMonthlyEquivalent({ amount: '1200', frequency: 'yearly' }).toFixed(2)).toBe('100.00');
    expect(overheadMonthlyEquivalent({ amount: '12', frequency: 'weekly' }).toFixed(2)).toBe('52.00');
    expect(overheadMonthlyEquivalent({ amount: '300', frequency: 'quarterly' }).toFixed(2)).toBe('100.00');
  });

  it('ocurrencias en un período', () => {
    expect(overheadOccurrences(rent, '2026-01-01', '2026-03-31')).toBe(3);
    expect(overheadOccurrences({ ...rent, active: false }, '2026-01-01', '2026-03-31')).toBe(0);
    expect(overheadOccurrences({ ...rent, frequency: 'once', startDate: '2026-02-10' }, '2026-01-01', '2026-03-31')).toBe(1);
    expect(overheadOccurrences({ ...rent, endDate: '2026-01-31' }, '2026-01-01', '2026-03-31')).toBe(1);
  });

  it('gasto general por unidad', () => {
    expect(overheadPerUnit([rent], '200')!.toFixed(2)).toBe('5.00');
    expect(overheadPerUnit([rent], '0')).toBeNull();
    expect(overheadPerUnit([{ ...rent, includeInUnitCost: false }], '200')!.toFixed(2)).toBe('0.00');
  });

  it('cada gasto se cuenta una sola vez en el libro', () => {
    const ledger = expenseLedger(
      [
        expense({ id: 'a', amount: '100', status: 'allocated' }),
        expense({ id: 'b', amount: '50', status: 'unassigned' }),
        expense({ id: 'c', amount: '999', status: 'void' }),
      ],
      [rent],
      '2026-01-01',
      '2026-01-31',
    );
    expect(ledger.allocatedToCost.toFixed(2)).toBe('100.00');
    expect(ledger.unassigned.toFixed(2)).toBe('50.00');
    expect(ledger.overhead.toFixed(2)).toBe('1000.00');
    expect(ledger.total.toFixed(2)).toBe('1150.00');
  });
});
