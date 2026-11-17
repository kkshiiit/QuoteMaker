/**
 * Calculadora de costos y precios.
 *
 * Fórmulas (todas con aritmética decimal):
 *   Markup (%)  = (precio − costo) / costo × 100
 *   Margen (%)  = (precio − costo) / precio × 100
 *   Precio con margen simple            = costo / (1 − margen)
 *   Precio con cargos % sobre el precio  = (costo + fijos por unidad) / (1 − cargos% − margen)
 *   Punto de equilibrio                  = (costo + fijos por unidad) / (1 − cargos%)
 *
 * Margen y markup NO son sinónimos: 50 % de markup equivale a 33,3 % de margen.
 */
import Big from 'big.js';
import { D, type Dec, pctOf, roundMoney, toDec, MONEY_SCALE } from './money';

export function markupPct(price: Dec | Big, cost: Dec | Big): Big | null {
  const c = D(cost);
  if (c.lte(0)) return null; // indefinido con costo cero o negativo
  return D(price).minus(c).div(c).times(100);
}

export function marginPct(price: Dec | Big, cost: Dec | Big): Big | null {
  const p = D(price);
  if (p.lte(0)) return null; // indefinido con precio cero
  return p.minus(D(cost)).div(p).times(100);
}

export type PriceSolveResult =
  | { ok: true; price: Big }
  | { ok: false; reason: 'denominator' | 'negative-cost' | 'invalid-margin' };

/**
 * Resuelve el precio que logra `targetMarginPct` sobre el precio final, considerando cargos
 * porcentuales que se cobran sobre el precio (comisiones de pago, marketplace, etc.).
 */
export function solvePrice(params: {
  unitCost: Dec | Big;
  fixedPerUnit?: Dec | Big;
  pctCharges?: Dec | Big;
  targetMarginPct?: Dec | Big;
}): PriceSolveResult {
  const cost = D(params.unitCost).plus(D(params.fixedPerUnit ?? '0'));
  const charges = D(params.pctCharges ?? '0');
  const margin = D(params.targetMarginPct ?? '0');
  if (cost.lt(0)) return { ok: false, reason: 'negative-cost' };
  if (margin.lt(0) || charges.lt(0)) return { ok: false, reason: 'invalid-margin' };
  const denom = new Big(1).minus(charges.div(100)).minus(margin.div(100));
  if (denom.lte(0)) return { ok: false, reason: 'denominator' };
  return { ok: true, price: cost.div(denom) };
}

export const priceForSimpleMargin = (unitCost: Dec | Big, targetMarginPct: Dec | Big) =>
  solvePrice({ unitCost, targetMarginPct });

export const breakEvenPrice = (unitCost: Dec | Big, fixedPerUnit: Dec | Big = '0', pctCharges: Dec | Big = '0') =>
  solvePrice({ unitCost, fixedPerUnit, pctCharges, targetMarginPct: '0' });

export type RoundingRule = 'none' | 'cent10' | 'unit' | 'ten' | 'hundred' | 'thousand' | 'end99';

export const ROUNDING_LABELS: Record<RoundingRule, string> = {
  none: 'Sin redondeo (centavos)',
  cent10: 'Hacia arriba a 0,10',
  unit: 'Hacia arriba a 1',
  ten: 'Hacia arriba a 10',
  hundred: 'Hacia arriba a 100',
  thousand: 'Hacia arriba a 1.000',
  end99: 'Terminado en ,99',
};

/** Redondeo comercial de precios: siempre hacia arriba para no perder margen. */
export function applyRounding(price: Dec | Big, rule: RoundingRule): Big {
  const p = D(price);
  const ceilTo = (step: string) => {
    const s = new Big(step);
    return p.div(s).round(0, Big.roundUp).times(s);
  };
  switch (rule) {
    case 'none':
      return p.round(MONEY_SCALE, Big.roundUp);
    case 'cent10':
      return ceilTo('0.1');
    case 'unit':
      return ceilTo('1');
    case 'ten':
      return ceilTo('10');
    case 'hundred':
      return ceilTo('100');
    case 'thousand':
      return ceilTo('1000');
    case 'end99': {
      const whole = p.round(0, Big.roundDown);
      const candidate = whole.plus('0.99');
      return candidate.gte(p) ? candidate : whole.plus('1.99');
    }
  }
}

export interface PriceAnalysisInput {
  unitCost: Dec; // costo unitario real (compra + gastos asignados)
  price: Dec; // precio de venta neto (sin impuestos)
  quantity?: Dec;
  fixedPerUnit?: Dec; // comisiones fijas, envío no cobrado, embalaje, gastos generales por unidad
  pctCharges?: Dec; // comisiones/cargos % sobre el precio
  taxPct?: Dec; // impuesto que se suma al precio para el cliente
  discountPct?: Dec; // descuento comercial sobre el precio
}

export interface PriceAnalysis {
  netPrice: Big; // precio luego del descuento
  priceWithTax: Big;
  variableCostsPerUnit: Big; // cargos % + fijos
  unitProfit: Big;
  totalProfit: Big;
  grossMarginPct: Big | null; // (precio − costo) / precio
  netMarginPct: Big | null; // después de costos variables
  markupPct: Big | null;
  breakEven: PriceSolveResult;
  isLoss: boolean;
}

export function analyzePrice(input: PriceAnalysisInput): PriceAnalysis {
  const qty = D(input.quantity ?? '1');
  const price = D(input.price);
  const netPrice = price.minus(pctOf(price, input.discountPct ?? '0'));
  const variable = pctOf(netPrice, input.pctCharges ?? '0').plus(D(input.fixedPerUnit ?? '0'));
  const cost = D(input.unitCost);
  const unitProfit = netPrice.minus(cost).minus(variable);
  return {
    netPrice,
    priceWithTax: netPrice.plus(pctOf(netPrice, input.taxPct ?? '0')),
    variableCostsPerUnit: variable,
    unitProfit,
    totalProfit: unitProfit.times(qty),
    grossMarginPct: marginPct(netPrice, cost),
    netMarginPct: netPrice.lte(0) ? null : unitProfit.div(netPrice).times(100),
    markupPct: markupPct(netPrice, cost),
    breakEven: breakEvenPrice(cost, input.fixedPerUnit ?? '0', input.pctCharges ?? '0'),
    isLoss: unitProfit.lt(0),
  };
}

export interface Scenario {
  label: string;
  targetMarginPct: Dec;
  result: PriceSolveResult;
  rounded: Big | null;
  analysis: PriceAnalysis | null;
}

export function buildScenarios(params: {
  unitCost: Dec;
  fixedPerUnit?: Dec;
  pctCharges?: Dec;
  margins: Dec[];
  rounding: RoundingRule;
  quantity?: Dec;
}): Scenario[] {
  return params.margins.map((m) => {
    const result = solvePrice({ unitCost: params.unitCost, fixedPerUnit: params.fixedPerUnit, pctCharges: params.pctCharges, targetMarginPct: m });
    const rounded = result.ok ? applyRounding(result.price, params.rounding) : null;
    return {
      label: `Margen ${m} %`,
      targetMarginPct: m,
      result,
      rounded,
      analysis: rounded
        ? analyzePrice({ unitCost: params.unitCost, price: toDec(rounded), fixedPerUnit: params.fixedPerUnit, pctCharges: params.pctCharges, quantity: params.quantity })
        : null,
    };
  });
}

export const moneyStr = (b: Big) => toDec(roundMoney(b));
