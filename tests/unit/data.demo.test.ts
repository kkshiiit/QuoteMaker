import { describe, expect, it } from 'vitest';
import { db, openTestDatabase } from '../../src/data/db';
import { isDatabaseEmpty, loadDemoData } from '../../src/data/demo';
import { quoteTotals } from '../../src/domain/quote';
import { expenseLedger } from '../../src/domain/costing';
import { sum } from '../../src/domain/money';

describe('datos de ejemplo', () => {
  it('se cargan con la lógica real y quedan coherentes', async () => {
    openTestDatabase('demo-1');
    expect(await isDatabaseEmpty()).toBe(true);
    await loadDemoData();
    expect(await isDatabaseEmpty()).toBe(false);
    const products = await db.products.toArray();
    expect(products.filter((p) => p.currentCost).length).toBe(6);
    const mesa = products.find((p) => p.sku === 'MES-120')!;
    // Último lote: 2 × 165.000 sin gastos
    expect(mesa.currentCost).toBe('165000.0000');
    const quotes = await db.quotes.toArray();
    expect(quotes).toHaveLength(4);
    expect(quotes.filter((q) => q.frozen).length).toBe(3);
    for (const q of quotes) expect(Number(quoteTotals(q).totals.total)).toBeGreaterThan(0);
    const expenses = await db.expenses.toArray();
    const ledger = expenseLedger(expenses, [], '2000-01-01', '2100-01-01');
    expect(ledger.total.toFixed(2)).toBe(sum(expenses.map((e) => e.amount)).toFixed(2));
    expect(ledger.unassigned.toFixed(2)).toBe('4500.00');
  });
});
