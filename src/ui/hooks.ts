import { useLiveQuery } from 'dexie-react-hooks';
import { stockBalances } from '../domain/stock';
import { useCallback, useMemo } from 'react';
import { db } from '../data/db';
import { defaultPreferences, defaultSettings, SETTINGS_ID } from '../data/defaults';
import { formatMoney, formatPct, type Dec } from '../domain/money';
import type Big from 'big.js';
import type { BusinessSettings, Preferences } from '../domain/types';

export function useSettings(): BusinessSettings {
  const s = useLiveQuery(() => db.settings.get(SETTINGS_ID), []);
  return useMemo(() => ({ ...defaultSettings(), ...(s ?? {}) }), [s]);
}

export function usePrefs(): [Preferences, (patch: Partial<Preferences>) => Promise<void>] {
  const p = useLiveQuery(() => db.prefs.get('prefs'), []);
  const prefs = useMemo(() => ({ ...defaultPreferences(), ...(p ?? {}) }), [p]);
  const update = useCallback(async (patch: Partial<Preferences>) => {
    const cur = { ...defaultPreferences(), ...((await db.prefs.get('prefs')) ?? {}) };
    const next = { ...cur, ...patch, id: 'prefs' as const };
    await db.prefs.put(next);
    try {
      localStorage.setItem('qm-theme', JSON.stringify({ themeMode: next.themeMode, paletteId: next.paletteId, customAccent: next.customAccent }));
    } catch {
      /* almacenamiento no disponible: el tema igual se aplica desde IndexedDB */
    }
  }, []);
  return [prefs, update];
}

export function useMoney() {
  const s = useSettings();
  return useCallback((v: Dec | Big | null | undefined) => (v === null || v === undefined || v === '' ? '—' : formatMoney(v, s.currency, s.locale)), [s.currency, s.locale]);
}

export const pct = (v: Big | null) => formatPct(v);

/** Saldos de stock (todos los productos, o sólo uno). Se recalculan solos al cambiar movimientos. */
export function useStockBalances(productId?: string): Map<string, string> | undefined {
  return useLiveQuery(async () => stockBalances(productId ? await db.stockMoves.where('productId').equals(productId).toArray() : await db.stockMoves.toArray()), [productId]);
}

/** «1 venta» / «3 ventas»: plurales correctos en lugar de «venta(s)». */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
