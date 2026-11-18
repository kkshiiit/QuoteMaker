/**
 * Frontera de privacidad para recibos de ventas y pedidos.
 *
 * `buildPublicReceipt` copia campo por campo una allowlist explícita de la venta. Nunca pasan
 * costos, ganancia, costo real del envío, notas internas, stock ni proveedores. El generador
 * de PDF sólo acepta `PublicReceipt`, y `assertPublicReceipt` verifica las claves en ejecución.
 */
import type { Dec } from '../domain/money';
import { computeSaleTotals, salePayments, saleStatus } from '../domain/sales';
import { ORDER_STATUS_LABELS, type BusinessSettings, type Sale } from '../domain/types';
import { PrivacyViolationError, type PublicBusiness, type PublicLine, type PublicTotals } from './publicQuote';
import { socialLinks, type SocialLink } from './social';

export interface PublicReceiptPayment {
  date: string;
  note: string;
  method: string;
  amount: Dec;
}

export interface PublicReceipt {
  schema: 'quotemaker.public-receipt/1';
  /** 'Pedido' si está por entregar; 'Recibo' si ya se entregó. */
  kind: 'Pedido' | 'Recibo';
  number: string;
  date: string;
  status: string;
  currency: string;
  locale: string;
  business: PublicBusiness;
  customer: { name: string };
  delivery: { mode: 'retiro' | 'envio'; address: string; date: string };
  lines: PublicLine[];
  totals: PublicTotals;
  payments: PublicReceiptPayment[];
  paid: Dec;
  balance: Dec;
  paymentMethod: string;
  socials: SocialLink[];
}

export const PUBLIC_RECEIPT_ALLOWLIST = {
  root: ['schema', 'kind', 'number', 'date', 'status', 'currency', 'locale', 'business', 'customer', 'delivery', 'lines', 'totals', 'payments', 'paid', 'balance', 'paymentMethod', 'socials'],
  business: ['name', 'legalName', 'taxId', 'phone', 'email', 'address', 'website'],
  customer: ['name'],
  delivery: ['mode', 'address', 'date'],
  line: ['description', 'unit', 'quantity', 'unitPrice', 'discountPct', 'lineTotal'],
  totals: ['subtotal', 'lineDiscounts', 'globalDiscountPct', 'globalDiscount', 'taxLabel', 'taxPct', 'tax', 'shipping', 'total'],
  payment: ['date', 'note', 'method', 'amount'],
  social: ['network', 'label', 'url'],
} as const;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function buildPublicReceipt(sale: Sale, settings: BusinessSettings, opts: { includeSocials?: boolean } = {}): PublicReceipt {
  const t = computeSaleTotals(sale);
  const c = t.commercial;
  const pay = salePayments(sale, t.total);
  const st = saleStatus(sale);
  const doc: PublicReceipt = {
    schema: 'quotemaker.public-receipt/1',
    kind: st === 'entregado' ? 'Recibo' : 'Pedido',
    number: str(sale.number),
    date: str(sale.date),
    status: ORDER_STATUS_LABELS[st],
    currency: str(settings.currency),
    locale: str(settings.locale) || 'es-AR',
    business: {
      name: str(settings.businessName),
      legalName: str(settings.legalName),
      taxId: settings.showBusinessTaxId ? str(settings.taxId) : '',
      phone: settings.showBusinessContactPhone ? str(settings.phone) : '',
      email: settings.showBusinessContactEmail ? str(settings.email) : '',
      address: settings.showBusinessAddress ? str(settings.address) : '',
      website: str(settings.website),
    },
    customer: { name: str(sale.customerName) },
    delivery: { mode: sale.delivery?.mode === 'envio' ? 'envio' : 'retiro', address: sale.delivery?.mode === 'envio' ? str(sale.delivery.address) : '', date: str(sale.delivery?.date) },
    lines: c.lines.map((l) => ({ description: str(l.description), unit: str(l.unit), quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, lineTotal: l.net })),
    totals: {
      subtotal: c.subtotal,
      lineDiscounts: c.lineDiscounts,
      globalDiscountPct: sale.globalDiscountPct || '0',
      globalDiscount: c.globalDiscount,
      taxLabel: str(settings.taxLabel) || 'Impuestos',
      taxPct: sale.taxPct || '0',
      tax: c.tax,
      shipping: c.shipping,
      total: c.total,
    },
    payments: (sale.payments ?? []).map((p) => ({ date: str(p.date), note: str(p.note), method: str(p.method), amount: p.amount })),
    paid: pay.paid,
    balance: pay.balance,
    paymentMethod: str(sale.paymentMethod),
    socials: opts.includeSocials === false ? [] : socialLinks(settings).map((l) => ({ network: l.network, label: l.label, url: l.url })),
  };
  assertPublicReceipt(doc);
  return doc;
}

function checkKeys(obj: object, allowed: readonly string[], path: string) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) throw new PrivacyViolationError(`Campo no permitido en recibo público: ${path}.${k}`);
}

export function assertPublicReceipt(doc: PublicReceipt): void {
  const a = PUBLIC_RECEIPT_ALLOWLIST;
  checkKeys(doc, a.root, 'doc');
  checkKeys(doc.business, a.business, 'business');
  checkKeys(doc.customer, a.customer, 'customer');
  checkKeys(doc.delivery, a.delivery, 'delivery');
  checkKeys(doc.totals, a.totals, 'totals');
  doc.lines.forEach((l, i) => checkKeys(l, a.line, `lines[${i}]`));
  doc.payments.forEach((p, i) => checkKeys(p, a.payment, `payments[${i}]`));
  doc.socials.forEach((s, i) => checkKeys(s, a.social, `socials[${i}]`));
}

/** Nombre de archivo sin datos sensibles: sólo tipo y número. */
export function receiptFileName(doc: Pick<PublicReceipt, 'kind' | 'number'>): string {
  const safe = doc.number.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'venta';
  return `${doc.kind}-${safe}.pdf`;
}

/** Texto para WhatsApp (sólo datos públicos). */
export function receiptText(doc: PublicReceipt, money: (v: Dec) => string): string {
  const out = [`*${doc.kind} ${doc.number}* · ${doc.business.name}`, doc.customer.name ? `Cliente: ${doc.customer.name}` : '', `Estado: ${doc.status}`, ''];
  for (const l of doc.lines) out.push(`• ${l.quantity} × ${l.description}: ${money(l.lineTotal)}`);
  out.push('');
  if (doc.totals.shipping !== '0.00') out.push(`Envío: ${money(doc.totals.shipping)}`);
  out.push(`*Total: ${money(doc.totals.total)}*`);
  if (doc.payments.length) {
    for (const p of doc.payments) out.push(`${p.note || 'Pago'}: ${money(p.amount)}`);
    out.push(`*Saldo: ${money(doc.balance)}*`);
  }
  if (doc.delivery.mode === 'envio') out.push(`Entrega en: ${doc.delivery.address}${doc.delivery.date ? ` (${doc.delivery.date.split('-').reverse().join('/')})` : ''}`);
  if (doc.socials.length) {
    out.push('', 'Seguinos:');
    for (const s of doc.socials) out.push(`${s.label}: ${s.url}`);
  }
  return out.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n').trim();
}
