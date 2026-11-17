/**
 * Aritmética monetaria decimal.
 *
 * Reglas explícitas (ver docs/ARCHITECTURE.md § Precisión decimal):
 * - Todos los importes se almacenan como string decimal (ej. "1234.5600").
 * - Nunca se opera con `number` de JavaScript: se usa big.js (precisión arbitraria).
 * - Importes monetarios (totales, subtotales, impuestos): escala 2, redondeo half-up.
 * - Costos unitarios: escala 4, redondeo half-up (evita perder centavos al dividir lotes).
 * - Porcentajes: escala 4 al mostrarse; internamente sin redondear.
 */
import Big from 'big.js';

Big.DP = 30;
Big.RM = Big.roundHalfUp;

export type Dec = string;

export const MONEY_SCALE = 2;
export const UNIT_COST_SCALE = 4;
export const PCT_SCALE = 4;

export function D(value: Dec | number | Big | null | undefined): Big {
  if (value === null || value === undefined || value === '') return new Big(0);
  if (value instanceof Big) return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError('Número no finito');
    // Number sólo se acepta para literales enteros/simples (cantidades); se pasa por string.
    return new Big(String(value));
  }
  return new Big(value);
}

export function isValidDec(value: unknown): value is Dec {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    new Big(value);
    return true;
  } catch {
    return false;
  }
}

export const round = (value: Big | Dec, scale: number): Big => D(value).round(scale, Big.roundHalfUp);
export const roundMoney = (value: Big | Dec): Big => round(value, MONEY_SCALE);
export const roundUnitCost = (value: Big | Dec): Big => round(value, UNIT_COST_SCALE);

/** Serializa a string con escala fija. */
export const toDec = (value: Big | Dec, scale = MONEY_SCALE): Dec => round(value, scale).toFixed(scale);

export const sum = (values: Array<Big | Dec>): Big => values.reduce<Big>((acc, v) => acc.plus(D(v)), new Big(0));

export const pctOf = (base: Big | Dec, pct: Big | Dec): Big => D(base).times(D(pct)).div(100);

export function compare(a: Big | Dec, b: Big | Dec): -1 | 0 | 1 {
  return D(a).cmp(D(b)) as -1 | 0 | 1;
}

/**
 * Interpreta texto ingresado por la persona usuaria (formatos es-AR y en-US).
 * "1.234,56" → "1234.56" · "1234,5" → "1234.5" · "1,234.56" → "1234.56" · "12.5" → "12.5"
 * Devuelve null si el texto no es un número válido.
 */
export function parseDecimalInput(raw: string): Dec | null {
  let s = raw.trim().replace(/\s|\$|%/g, '');
  if (s === '') return null;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decSep = lastComma > lastDot ? ',' : '.';
    const thouSep = decSep === ',' ? '.' : ',';
    s = s.split(thouSep).join('');
    if (decSep === ',') s = s.replace(',', '.');
  } else if (lastComma >= 0) {
    if ((s.match(/,/g) ?? []).length > 1) {
      s = s.split(',').join('');
    } else {
      s = s.replace(',', '.');
    }
  } else if (lastDot >= 0 && (s.match(/\./g) ?? []).length > 1) {
    // "1.234.567" → miles
    s = s.split('.').join('');
  }
  if (!/^\d*\.?\d*$/.test(s) || s === '.' ) return null;
  try {
    const b = new Big(s === '' ? '0' : s);
    return (neg ? b.neg() : b).toString();
  } catch {
    return null;
  }
}

const formatterCache = new Map<string, Intl.NumberFormat>();

export function formatMoney(value: Big | Dec, currency = 'ARS', locale = 'es-AR'): string {
  const key = `${locale}|${currency}`;
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    formatterCache.set(key, f);
  }
  // Se formatea desde el string redondeado; Intl recibe un número ya redondeado a 2 decimales,
  // lo que es exacto para la representación visual (no se usa para cálculos).
  return f.format(Number(toDec(value, MONEY_SCALE)));
}

export function formatNumber(value: Big | Dec, maxDecimals = 2, locale = 'es-AR'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxDecimals }).format(Number(round(value, maxDecimals).toString()));
}

export function formatPct(value: Big | Dec | null, decimals = 1, locale = 'es-AR'): string {
  if (value === null) return '—';
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(round(value, decimals).toString()))} %`;
}
