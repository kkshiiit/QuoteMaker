/**
 * Frontera de privacidad.
 *
 * `buildPublicQuoteDocument` es el ÚNICO punto por donde datos de un presupuesto pasan hacia
 * documentos comerciales. Copia campo por campo una allowlist explícita; jamás hace spread
 * (`...quote`) de modelos internos. Los generadores de PDF y WhatsApp sólo aceptan
 * `PublicQuoteDocument`, y `assertPublicDocument` verifica en tiempo de ejecución que el
 * objeto no tenga claves fuera de la allowlist.
 */
import { computeCommercialTotals, effectiveQuote } from '../domain/quote';
import type { BusinessSettings, Quote } from '../domain/types';
import type { Dec } from '../domain/money';
import { socialLinks, type SocialLink } from './social';

export interface PublicBusiness {
  name: string;
  legalName: string;
  taxId: string;
  phone: string;
  email: string;
  address: string;
  website: string;
}

export interface PublicCustomer {
  name: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
}

export interface PublicLine {
  description: string;
  unit: string;
  quantity: Dec;
  unitPrice: Dec;
  discountPct: Dec;
  lineTotal: Dec;
}

export interface PublicTotals {
  subtotal: Dec;
  lineDiscounts: Dec;
  globalDiscountPct: Dec;
  globalDiscount: Dec;
  taxLabel: string;
  taxPct: Dec;
  tax: Dec;
  shipping: Dec;
  total: Dec;
}

export interface PublicQuoteDocument {
  schema: 'quotemaker.public-quote/1';
  isDraft: boolean;
  number: string;
  issueDate: string;
  validUntil: string;
  currency: string;
  locale: string;
  business: PublicBusiness;
  customer: PublicCustomer;
  lines: PublicLine[];
  totals: PublicTotals;
  conditions: string;
  notes: string;
  /** Links a los perfiles del negocio (Instagram, Facebook, TikTok). Vacío si se eligió no incluirlos. */
  socials: SocialLink[];
}

/** Allowlist declarativa: cualquier clave no listada hace fallar `assertPublicDocument`. */
export const PUBLIC_DOCUMENT_ALLOWLIST = {
  root: ['schema', 'isDraft', 'number', 'issueDate', 'validUntil', 'currency', 'locale', 'business', 'customer', 'lines', 'totals', 'conditions', 'notes', 'socials'],
  social: ['network', 'label', 'url'],
  business: ['name', 'legalName', 'taxId', 'phone', 'email', 'address', 'website'],
  customer: ['name', 'phone', 'email', 'address', 'taxId'],
  line: ['description', 'unit', 'quantity', 'unitPrice', 'discountPct', 'lineTotal'],
  totals: ['subtotal', 'lineDiscounts', 'globalDiscountPct', 'globalDiscount', 'taxLabel', 'taxPct', 'tax', 'shipping', 'total'],
} as const;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function buildPublicQuoteDocument(quote: Quote, settings: BusinessSettings, opts: { includeSocials?: boolean } = {}): PublicQuoteDocument {
  const e = effectiveQuote(quote);
  const totals = computeCommercialTotals(e);
  const biz = quote.frozen?.business;
  const business: PublicBusiness = {
    name: str(biz ? biz.businessName : settings.businessName),
    legalName: str(biz ? biz.legalName : settings.legalName),
    taxId: biz ? str(biz.taxId) : settings.showBusinessTaxId ? str(settings.taxId) : '',
    phone: biz ? str(biz.phone) : settings.showBusinessContactPhone ? str(settings.phone) : '',
    email: biz ? str(biz.email) : settings.showBusinessContactEmail ? str(settings.email) : '',
    address: biz ? str(biz.address) : settings.showBusinessAddress ? str(settings.address) : '',
    website: str(biz ? biz.website : settings.website),
  };
  const customer: PublicCustomer = {
    name: str(e.customer.name),
    phone: str(e.customer.phone),
    email: str(e.customer.email),
    address: str(e.customer.address),
    taxId: str(e.customer.taxId),
  };
  const lines: PublicLine[] = totals.lines.map((l) => ({
    description: str(l.description),
    unit: str(l.unit),
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discountPct: l.discountPct,
    lineTotal: l.net,
  }));
  const doc: PublicQuoteDocument = {
    schema: 'quotemaker.public-quote/1',
    isDraft: quote.status === 'draft',
    number: str(quote.number),
    issueDate: str(e.issueDate),
    validUntil: str(e.validUntil),
    currency: str(quote.frozen?.currency ?? settings.currency),
    locale: str(settings.locale) || 'es-AR',
    business,
    customer,
    lines,
    totals: {
      subtotal: totals.subtotal,
      lineDiscounts: totals.lineDiscounts,
      globalDiscountPct: e.globalDiscountPct || '0',
      globalDiscount: totals.globalDiscount,
      taxLabel: str(quote.frozen?.taxLabel ?? settings.taxLabel) || 'Impuestos',
      taxPct: e.taxPct || '0',
      tax: totals.tax,
      shipping: totals.shipping,
      total: totals.total,
    },
    conditions: str(e.conditions),
    notes: str(e.commercialNotes),
    socials: opts.includeSocials === false ? [] : socialLinks(settings).map((l) => ({ network: l.network, label: l.label, url: l.url })),
  };
  assertPublicDocument(doc);
  return doc;
}

export class PrivacyViolationError extends Error {}

function checkKeys(obj: object, allowed: readonly string[], path: string) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) throw new PrivacyViolationError(`Campo no permitido en documento público: ${path}.${k}`);
  }
}

export function assertPublicDocument(doc: PublicQuoteDocument): void {
  const a = PUBLIC_DOCUMENT_ALLOWLIST;
  checkKeys(doc, a.root, 'doc');
  checkKeys(doc.business, a.business, 'business');
  checkKeys(doc.customer, a.customer, 'customer');
  checkKeys(doc.totals, a.totals, 'totals');
  doc.lines.forEach((l, i) => checkKeys(l, a.line, `lines[${i}]`));
  (doc.socials ?? []).forEach((l, i) => checkKeys(l, a.social, `socials[${i}]`));
}

/** Nombre de archivo sin datos sensibles: sólo el número de presupuesto. */
export function publicFileName(doc: Pick<PublicQuoteDocument, 'number'>, ext: 'pdf' | 'txt' = 'pdf'): string {
  const safe = doc.number.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'borrador';
  return `Presupuesto-${safe}.${ext}`;
}
