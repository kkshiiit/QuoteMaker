/**
 * Distribución de gastos entre lotes/productos.
 *
 * Se usa el método del "mayor resto" a nivel centavo: cada destino recibe su parte
 * truncada al centavo y los centavos residuales se asignan a los destinos con mayor
 * fracción descartada (desempate estable por orden de entrada). Así la suma de las
 * partes es SIEMPRE exactamente igual al importe del gasto.
 */
import Big from 'big.js';
import { D, type Dec, MONEY_SCALE, sum } from './money';

export type AllocationMethod = 'units' | 'value' | 'weight' | 'volume' | 'percent' | 'amount';

export const ALLOCATION_METHOD_LABELS: Record<AllocationMethod, string> = {
  units: 'Por cantidad de unidades',
  value: 'Por valor de compra',
  weight: 'Por peso',
  volume: 'Por volumen',
  percent: 'Por porcentaje manual',
  amount: 'Por importe manual',
};

export const ALLOCATION_METHOD_HELP: Record<AllocationMethod, string> = {
  units: 'Cada artículo recibe una parte proporcional a la cantidad de unidades compradas.',
  value: 'Los artículos más caros (precio × cantidad) absorben una parte mayor del gasto.',
  weight: 'Proporcional al peso total de cada artículo (peso unitario × cantidad).',
  volume: 'Proporcional al volumen total de cada artículo (volumen unitario × cantidad).',
  percent: 'Indicás el porcentaje de cada artículo. Los porcentajes deben sumar 100 %.',
  amount: 'Indicás el importe exacto de cada artículo. Deben sumar el total del gasto.',
};

export interface AllocationTarget {
  key: string;
  /** Base de distribución: unidades, valor, peso o volumen totales del destino. */
  basis?: Dec;
  /** Para método 'percent'. */
  percent?: Dec;
  /** Para método 'amount'. */
  amount?: Dec;
}

export type AllocationResult =
  | { ok: true; shares: Array<{ key: string; amount: Dec }> }
  | { ok: false; error: string };

export function largestRemainder(total: Big, weights: Big[]): Big[] {
  const unit = new Big(1).div(new Big(10).pow(MONEY_SCALE)); // 0.01
  const totalWeight = weights.reduce((a, w) => a.plus(w), new Big(0));
  if (totalWeight.lte(0)) throw new Error('La base de distribución total debe ser mayor que cero');
  const raw = weights.map((w) => total.times(w).div(totalWeight));
  const floored = raw.map((r) => r.round(MONEY_SCALE, Big.roundDown));
  let remainder = total.minus(floored.reduce((a, f) => a.plus(f), new Big(0)));
  const order = raw
    .map((r, i) => ({ i, frac: r.minus(floored[i]!) }))
    .sort((a, b) => b.frac.cmp(a.frac) || a.i - b.i);
  let k = 0;
  while (remainder.gte(unit) && order.length > 0) {
    const idx = order[k % order.length]!.i;
    floored[idx] = floored[idx]!.plus(unit);
    remainder = remainder.minus(unit);
    k++;
  }
  return floored;
}

export function allocate(totalAmount: Dec, method: AllocationMethod, targets: AllocationTarget[]): AllocationResult {
  if (targets.length === 0) return { ok: false, error: 'Elegí al menos un destino para el gasto.' };
  const keys = new Set(targets.map((t) => t.key));
  if (keys.size !== targets.length) return { ok: false, error: 'Hay destinos repetidos.' };
  let total: Big;
  try {
    total = D(totalAmount).round(MONEY_SCALE, Big.roundHalfUp);
  } catch {
    return { ok: false, error: 'Importe inválido.' };
  }
  if (total.lte(0)) return { ok: false, error: 'El importe del gasto debe ser mayor que cero.' };

  if (method === 'amount') {
    const amounts = targets.map((t) => D(t.amount ?? '0'));
    if (amounts.some((a) => a.lt(0))) return { ok: false, error: 'Los importes no pueden ser negativos.' };
    const s = sum(amounts);
    if (!s.eq(total)) {
      return { ok: false, error: `Los importes suman ${s.toFixed(2)} y deben sumar exactamente ${total.toFixed(2)}.` };
    }
    return { ok: true, shares: targets.map((t, i) => ({ key: t.key, amount: amounts[i]!.toFixed(MONEY_SCALE) })) };
  }

  let weights: Big[];
  if (method === 'percent') {
    weights = targets.map((t) => D(t.percent ?? '0'));
    if (weights.some((w) => w.lt(0))) return { ok: false, error: 'Los porcentajes no pueden ser negativos.' };
    const s = sum(weights);
    if (!s.eq(100)) return { ok: false, error: `Los porcentajes suman ${s.toString()} % y deben sumar 100 %.` };
  } else {
    weights = targets.map((t) => D(t.basis ?? '0'));
    if (weights.some((w) => w.lt(0))) return { ok: false, error: 'La base de distribución no puede ser negativa.' };
    if (sum(weights).lte(0)) {
      const what = { units: 'unidades', value: 'valor de compra', weight: 'peso', volume: 'volumen' }[method];
      return { ok: false, error: `No hay ${what} cargado en los destinos elegidos para distribuir.` };
    }
  }
  const parts = largestRemainder(total, weights);
  return { ok: true, shares: targets.map((t, i) => ({ key: t.key, amount: parts[i]!.toFixed(MONEY_SCALE) })) };
}
