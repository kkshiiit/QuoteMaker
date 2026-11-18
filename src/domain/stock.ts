/**
 * Stock por producto y variante (color / talle).
 *
 * El saldo NUNCA se guarda: es la suma de movimientos inmutables (`StockMove`). Así:
 *  - dos dispositivos pueden ingresar o vender a la vez sin pisarse (no hay conflicto de sync),
 *  - queda un historial completo de entradas, ventas, ajustes y pérdidas,
 *  - corregir un error es agregar otro movimiento, nunca borrar.
 */
import type Big from 'big.js';
import { D, type Dec, toDec } from './money';
import type { Product, ProductVariant, Sale, StockMove } from './types';
import { saleCounts } from './sales';

export const stockKey = (productId: string, variantId = '') => `${productId}|${variantId}`;

/** Cantidades enteras (unidades) con signo. */
export const toQty = (v: Dec | number | Big): Dec => D(v).round(0, 0).toFixed(0);

/** Saldos por `stockKey`. */
export function stockBalances(moves: Pick<StockMove, 'productId' | 'variantId' | 'qty'>[]): Map<string, Dec> {
  const m = new Map<string, Dec>();
  for (const mv of moves) {
    const k = stockKey(mv.productId, mv.variantId);
    m.set(k, toQty(D(m.get(k) ?? '0').plus(D(mv.qty || '0'))));
  }
  return m;
}

export function variantLabel(v: Pick<ProductVariant, 'color' | 'size'> | undefined | null): string {
  if (!v) return '';
  return [v.color.trim(), v.size.trim()].filter(Boolean).join(' · ');
}

export interface StockLine {
  variantId: string;
  label: string;
  qty: Dec;
  low: boolean;
}

/** Stock de un producto: una línea por variante (o una sola si no tiene) + total. */
export function productStock(p: Pick<Product, 'id' | 'variants' | 'lowStockAt'>, balances: Map<string, Dec>): { lines: StockLine[]; total: Dec; low: boolean } {
  const threshold = p.lowStockAt ? D(p.lowStockAt) : null;
  const vs = p.variants ?? [];
  const lines: StockLine[] = vs.length
    ? vs.map((v) => {
        const qty = balances.get(stockKey(p.id, v.id)) ?? '0';
        return { variantId: v.id, label: variantLabel(v) || 'Variante', qty, low: threshold !== null && D(qty).lte(threshold) };
      })
    : [{ variantId: '', label: 'Stock', qty: balances.get(stockKey(p.id)) ?? '0', low: false }];
  // Movimientos de variantes ya borradas: se suman al total para no "perder" unidades.
  let total = D(0);
  for (const [k, q] of balances) if (k.startsWith(`${p.id}|`)) total = total.plus(D(q));
  const t = toQty(total);
  if (!vs.length && lines[0]) lines[0].low = threshold !== null && D(t).lte(threshold);
  return { lines, total: t, low: lines.some((l) => l.low) };
}

/** Cantidad a registrar para que el saldo pase de `current` a `target` (ajuste por conteo). */
export function adjustmentDelta(current: Dec, target: Dec): Dec {
  return toQty(D(target).minus(D(current)));
}

/** ¿Este estado de pedido descuenta stock? Borrador y cancelado no; confirmado y entregado sí. */
export const saleConsumesStock = (s: Pick<Sale, 'status' | 'cancelled'>): boolean => saleCounts(s);

export interface StockDelta {
  productId: string;
  variantId: string;
  qty: Dec;
}

/**
 * Movimientos compensatorios para que el stock refleje la venta tal como está ahora.
 * Idempotente: si ya se descontó lo correcto, no devuelve nada. Sirve para registrar, editar
 * cantidades, cambiar de variante, cancelar o restaurar.
 */
export function saleStockDeltas(sale: Sale, existing: Pick<StockMove, 'productId' | 'variantId' | 'qty'>[], tracked: (productId: string) => boolean): StockDelta[] {
  const want = new Map<string, Dec>();
  if (saleConsumesStock(sale)) {
    for (const it of sale.items) {
      if (!it.productId || !tracked(it.productId)) continue;
      const k = stockKey(it.productId, it.variantId ?? '');
      want.set(k, toQty(D(want.get(k) ?? '0').minus(D(it.quantity || '0'))));
    }
  }
  const have = stockBalances(existing);
  const keys = new Set([...want.keys(), ...have.keys()]);
  const out: StockDelta[] = [];
  for (const k of keys) {
    const d = D(want.get(k) ?? '0').minus(D(have.get(k) ?? '0'));
    if (d.eq(0)) continue;
    const [productId, variantId = ''] = k.split('|');
    out.push({ productId: productId!, variantId, qty: toQty(d) });
  }
  return out;
}

/** Renglones de la venta que piden más unidades de las disponibles (aviso, no bloqueo). */
export function stockShortages(sale: Sale, balances: Map<string, Dec>, alreadyTaken: Map<string, Dec>, tracked: (productId: string) => boolean): string[] {
  const need = new Map<string, Dec>();
  for (const it of sale.items) {
    if (!it.productId || !tracked(it.productId)) continue;
    const k = stockKey(it.productId, it.variantId ?? '');
    need.set(k, toDec(D(need.get(k) ?? '0').plus(D(it.quantity || '0'))));
  }
  const out: string[] = [];
  for (const [k, q] of need) {
    // lo que esta misma venta ya descontó vuelve a estar disponible para ella
    const available = D(balances.get(k) ?? '0').minus(D(alreadyTaken.get(k) ?? '0'));
    if (D(q).gt(available)) out.push(k);
  }
  return out;
}

export function validateVariants(vs: ProductVariant[]): string[] {
  const e: string[] = [];
  const seen = new Set<string>();
  vs.forEach((v, i) => {
    if (!v.color.trim() && !v.size.trim()) e.push(`Variante ${i + 1}: indicá un color, un talle o ambos.`);
    if (v.colorHex && !/^#[0-9a-f]{6}$/i.test(v.colorHex)) e.push(`Variante ${i + 1}: el color de muestra no es válido.`);
    const k = `${v.color.trim().toLocaleLowerCase('es')}|${v.size.trim().toLocaleLowerCase('es')}`;
    if (seen.has(k)) e.push(`Variante ${i + 1}: «${variantLabel(v)}» está repetida.`);
    seen.add(k);
  });
  return e;
}

/** Colores con nombre listos para elegir (nombre en español → muestra). */
export const COLOR_PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'Blanco', hex: '#ffffff' },
  { name: 'Crudo', hex: '#efe6d2' },
  { name: 'Beige', hex: '#d9c3a0' },
  { name: 'Arena', hex: '#c8b08a' },
  { name: 'Gris perla', hex: '#c9c9c9' },
  { name: 'Gris topo', hex: '#8a7f76' },
  { name: 'Negro', hex: '#1f1f1f' },
  { name: 'Rosa viejo', hex: '#c9939a' },
  { name: 'Rosa', hex: '#f2b8c6' },
  { name: 'Terracota', hex: '#c0643f' },
  { name: 'Mostaza', hex: '#d4a72c' },
  { name: 'Verde salvia', hex: '#9cb59a' },
  { name: 'Verde oliva', hex: '#6f7a3a' },
  { name: 'Celeste', hex: '#a9cfe6' },
  { name: 'Azul', hex: '#2f5d8a' },
  { name: 'Lavanda', hex: '#b9a7d8' },
  { name: 'Bordó', hex: '#6d1f2b' },
  { name: 'Marrón', hex: '#6b4a32' },
];

/** Talles frecuentes por rubro (se pueden escribir otros). */
export const SIZE_PRESETS: Record<string, string[]> = {
  Blanquería: ['1 plaza', '1½ plaza', '2 plazas', 'Queen', 'King'],
  Ropa: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  Niños: ['2', '4', '6', '8', '10', '12', '14', '16'],
  Bebé: ['0-3 m', '3-6 m', '6-9 m', '9-12 m', '12-18 m'],
};

/** Nombre aproximado para un color elegido libremente (el más cercano de la lista). */
export function nearestColorName(hex: string): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '';
  const [r, g, b] = rgb(hex);
  let best = COLOR_PRESETS[0]!;
  let bestD = Infinity;
  for (const c of COLOR_PRESETS) {
    const [cr, cg, cb] = rgb(c.hex);
    const d = (r! - cr!) ** 2 * 0.3 + (g! - cg!) ** 2 * 0.59 + (b! - cb!) ** 2 * 0.11;
    if (d < bestD) [best, bestD] = [c, d];
  }
  return best.name;
}
