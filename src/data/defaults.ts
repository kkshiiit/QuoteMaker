import type { BusinessSettings, Preferences } from '../domain/types';

export const SETTINGS_ID = 'business';

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayIso(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function newId(): string {
  const c = globalThis.crypto as Crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  // Fallback RFC4122 v4
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function defaultSettings(): BusinessSettings {
  const ts = nowIso();
  return {
    id: SETTINGS_ID,
    createdAt: ts,
    updatedAt: ts,
    businessName: '',
    legalName: '',
    taxId: '',
    phone: '',
    email: '',
    address: '',
    website: '',
    currency: 'ARS',
    locale: 'es-AR',
    defaultTaxPct: '0',
    taxLabel: 'IVA',
    defaultValidityDays: 15,
    defaultConditions: 'Precios expresados en pesos. Sujeto a disponibilidad de stock.',
    quotePrefix: 'P-',
    nextQuoteNumber: 1,
    defaultTargetMarginPct: '35',
    defaultPctCharges: '0',
    defaultFixedPerUnit: '0',
    rounding: 'unit',
    estimatedMonthlyUnits: '0',
    costStaleDays: 90,
    showBusinessContactPhone: true,
    showBusinessContactEmail: true,
    showBusinessAddress: true,
    showBusinessTaxId: false,
  };
}

export function defaultPreferences(): Preferences {
  return { id: 'prefs', themeMode: 'system', paletteId: 'bosque', customAccent: null, hideInternalByDefault: false, onboardingDone: false };
}
