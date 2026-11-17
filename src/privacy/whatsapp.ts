/**
 * Mensaje comercial para WhatsApp. Recibe EXCLUSIVAMENTE un PublicQuoteDocument.
 * El texto es editable por la persona usuaria antes de compartirlo; QuoteMaker nunca
 * envía mensajes automáticamente (abre WhatsApp o el selector del sistema y el envío
 * lo confirma la persona).
 */
import { formatMoney, formatNumber } from '../domain/money';
import { formatDate } from './pdf';
import { assertPublicDocument, type PublicQuoteDocument } from './publicQuote';

export interface WhatsAppQuoteMessage {
  text: string;
  phone: string; // sólo dígitos; puede estar vacío
}

export function buildWhatsAppMessage(doc: PublicQuoteDocument): WhatsAppQuoteMessage {
  assertPublicDocument(doc);
  const m = (v: string) => formatMoney(v, doc.currency, doc.locale);
  const firstName = doc.customer.name.trim().split(/\s+/)[0] ?? '';
  const out: string[] = [];
  out.push(`Hola${firstName ? ` ${firstName}` : ''}! Te comparto el presupuesto *${doc.number}*${doc.business.name ? ` de ${doc.business.name}` : ''}:`);
  out.push('');
  for (const l of doc.lines) {
    const disc = l.discountPct && l.discountPct !== '0' ? ` (−${formatNumber(l.discountPct, 2, doc.locale)} %)` : '';
    out.push(`• ${formatNumber(l.quantity, 3, doc.locale)}${l.unit ? ` ${l.unit}` : ''} × ${l.description} — ${m(l.lineTotal)}${disc}`);
  }
  out.push('');
  const t = doc.totals;
  if (t.globalDiscount !== '0.00' || t.tax !== '0.00' || t.shipping !== '0.00') out.push(`Subtotal: ${m(t.subtotal)}`);
  if (t.globalDiscount !== '0.00') out.push(`Descuento: −${m(t.globalDiscount)}`);
  if (t.tax !== '0.00') out.push(`${t.taxLabel} (${formatNumber(t.taxPct, 2, doc.locale)} %): ${m(t.tax)}`);
  if (t.shipping !== '0.00') out.push(`Envío: ${m(t.shipping)}`);
  out.push(`*Total: ${m(t.total)}*`);
  if (doc.validUntil) out.push(`Válido hasta el ${formatDate(doc.validUntil, doc.locale)}.`);
  if (doc.conditions.trim()) {
    out.push('');
    out.push(doc.conditions.trim());
  }
  if (doc.notes.trim()) {
    out.push('');
    out.push(doc.notes.trim());
  }
  out.push('');
  out.push('Cualquier consulta, quedo a disposición.');
  return { text: out.join('\n'), phone: normalizePhone(doc.customer.phone) };
}

export function normalizePhone(raw: string): string {
  return raw.replace(/\D+/g, '');
}

/** URL que abre WhatsApp con el texto precargado. El envío lo confirma la persona usuaria. */
export function whatsappUrl(text: string, phone = ''): string {
  const p = normalizePhone(phone);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}
