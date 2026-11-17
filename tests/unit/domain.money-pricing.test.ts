import { describe, expect, it } from 'vitest';
import { D, parseDecimalInput, roundMoney, toDec, sum } from '../../src/domain/money';
import { analyzePrice, applyRounding, breakEvenPrice, buildScenarios, markupPct, marginPct, solvePrice } from '../../src/domain/pricing';

describe('money', () => {
  it('no sufre errores de coma flotante', () => {
    expect(D('0.1').plus('0.2').toString()).toBe('0.3');
    expect(toDec(sum(Array.from({ length: 10 }, () => '0.1')))).toBe('1.00');
  });
  it('redondea half-up a 2 decimales', () => {
    expect(toDec(roundMoney('2.345'))).toBe('2.35');
    expect(toDec(roundMoney('2.344999'))).toBe('2.34');
    expect(toDec(roundMoney('-2.345'))).toBe('-2.35');
  });
  it('maneja cantidades grandes sin perder precisión', () => {
    expect(D('99999999999.99').times('1000000').toFixed(2)).toBe('99999999999990000.00');
  });
  it.each([
    ['1.234,56', '1234.56'],
    ['1234,5', '1234.5'],
    ['1,234.56', '1234.56'],
    ['12.5', '12.5'],
    ['1.234.567', '1234567'],
    ['$ 1.000,00', '1000'],
    ['-3,5', '-3.5'],
    ['0', '0'],
    ['abc', null],
    ['', null],
    ['1,2,3', '123'],
  ])('parseDecimalInput(%s) → %s', (input, expected) => {
    expect(parseDecimalInput(input)).toBe(expected);
  });
});

describe('margen vs markup', () => {
  it('distingue margen y markup', () => {
    // costo 100, precio 150 → markup 50 %, margen 33,33 %
    expect(markupPct('150', '100')!.toFixed(2)).toBe('50.00');
    expect(marginPct('150', '100')!.toFixed(2)).toBe('33.33');
  });
  it('devuelve null en denominadores cero', () => {
    expect(markupPct('100', '0')).toBeNull();
    expect(marginPct('0', '10')).toBeNull();
  });
  it('margen negativo cuando se vende bajo costo', () => {
    expect(marginPct('80', '100')!.toFixed(2)).toBe('-25.00');
  });
});

describe('solvePrice', () => {
  it('precio con margen simple = costo / (1 − margen)', () => {
    const r = solvePrice({ unitCost: '60', targetMarginPct: '40' });
    expect(r.ok && r.price.toFixed(2)).toBe('100.00');
  });
  it('con cargos porcentuales y fijos', () => {
    // (80 + 20) / (1 − 0.10 − 0.40) = 200
    const r = solvePrice({ unitCost: '80', fixedPerUnit: '20', pctCharges: '10', targetMarginPct: '40' });
    expect(r.ok && r.price.toFixed(2)).toBe('200.00');
  });
  it('rechaza cargos + margen ≥ 100 %', () => {
    expect(solvePrice({ unitCost: '10', pctCharges: '60', targetMarginPct: '40' })).toEqual({ ok: false, reason: 'denominator' });
    expect(solvePrice({ unitCost: '10', pctCharges: '70', targetMarginPct: '40' })).toEqual({ ok: false, reason: 'denominator' });
  });
  it('rechaza costos o márgenes negativos', () => {
    expect(solvePrice({ unitCost: '-1' })).toEqual({ ok: false, reason: 'negative-cost' });
    expect(solvePrice({ unitCost: '1', targetMarginPct: '-5' })).toEqual({ ok: false, reason: 'invalid-margin' });
  });
  it('punto de equilibrio', () => {
    const r = breakEvenPrice('90', '0', '10');
    expect(r.ok && r.price.toFixed(2)).toBe('100.00');
  });
  it('costo cero da precio cero', () => {
    const r = solvePrice({ unitCost: '0', targetMarginPct: '50' });
    expect(r.ok && r.price.toFixed(2)).toBe('0.00');
  });
});

describe('redondeo comercial', () => {
  it.each([
    ['none', '123.451', '123.46'],
    ['cent10', '123.41', '123.50'],
    ['unit', '123.01', '124'],
    ['ten', '123', '130'],
    ['hundred', '101', '200'],
    ['thousand', '1001', '2000'],
    ['end99', '123.40', '123.99'],
    ['end99', '123.995', '124.99'],
    ['unit', '123', '123'],
  ] as const)('%s(%s) = %s', (rule, price, expected) => {
    expect(applyRounding(price, rule).toString()).toBe(D(expected).toString());
  });
});

describe('analyzePrice', () => {
  it('calcula ganancia unitaria y total, márgenes bruto y neto', () => {
    const a = analyzePrice({ unitCost: '100', price: '200', quantity: '3', pctCharges: '10', fixedPerUnit: '5', taxPct: '21' });
    expect(a.variableCostsPerUnit.toFixed(2)).toBe('25.00');
    expect(a.unitProfit.toFixed(2)).toBe('75.00');
    expect(a.totalProfit.toFixed(2)).toBe('225.00');
    expect(a.grossMarginPct!.toFixed(2)).toBe('50.00');
    expect(a.netMarginPct!.toFixed(2)).toBe('37.50');
    expect(a.markupPct!.toFixed(2)).toBe('100.00');
    expect(a.priceWithTax.toFixed(2)).toBe('242.00');
    expect(a.isLoss).toBe(false);
  });
  it('aplica descuento antes de calcular', () => {
    const a = analyzePrice({ unitCost: '100', price: '200', discountPct: '50' });
    expect(a.netPrice.toFixed(2)).toBe('100.00');
    expect(a.unitProfit.toFixed(2)).toBe('0.00');
  });
  it('detecta pérdida', () => {
    expect(analyzePrice({ unitCost: '100', price: '90' }).isLoss).toBe(true);
  });
});

describe('escenarios', () => {
  it('genera escenarios y marca los imposibles', () => {
    const s = buildScenarios({ unitCost: '50', pctCharges: '10', margins: ['20', '40', '95'], rounding: 'unit' });
    expect(s[0]!.rounded!.toString()).toBe('72'); // 50 / 0.7 = 71.43 → 72
    expect(s[1]!.rounded!.toString()).toBe('100');
    expect(s[2]!.result.ok).toBe(false);
    expect(s[2]!.rounded).toBeNull();
  });
});
