/**
 * PDF de recibo / pedido. Recibe EXCLUSIVAMENTE un PublicReceipt (sin costos ni datos internos).
 * jsPDF se importa dinámicamente para no penalizar la carga inicial.
 */
import type { jsPDF as JsPDFType } from 'jspdf';
import { formatMoney, formatNumber } from '../domain/money';
import { formatDate, hexToRgb, pdfSafe, type PdfOptions } from './pdf';
import { assertPublicReceipt, receiptFileName, type PublicReceipt } from './publicReceipt';

export async function generateReceiptPdf(doc: PublicReceipt, opts: PdfOptions = {}): Promise<{ bytes: Uint8Array; fileName: string }> {
  assertPublicReceipt(doc);
  const { jsPDF } = await import('jspdf');
  const pdf: JsPDFType = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const money = (v: string) => pdfSafe(formatMoney(v, doc.currency, doc.locale));
  const accent = hexToRgb(opts.accent ?? '#14532d');
  const W = 210;
  const M = 16;
  const ink: [number, number, number] = [28, 28, 30];
  const muted: [number, number, number] = [96, 96, 104];
  const pageBottom = 297 - 22;
  let y = M;
  pdf.setProperties({ title: pdfSafe(`${doc.kind} ${doc.number}`), subject: doc.kind === 'Recibo' ? 'Recibo de venta' : 'Pedido', author: pdfSafe(doc.business.name), creator: 'Chediek Home', keywords: '' });

  pdf.setFillColor(...accent);
  pdf.rect(0, 0, W, 4, 'F');
  pdf.setTextColor(...ink);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text(pdfSafe(doc.business.name || 'Mi negocio'), M, y + 7.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(...muted);
  const biz = [
    doc.business.legalName,
    doc.business.taxId ? `CUIT/ID fiscal: ${doc.business.taxId}` : '',
    [doc.business.phone, doc.business.email].filter(Boolean).join('  ·  '),
    doc.business.address,
    doc.business.website,
    doc.socials.map((l) => `${l.label}: ${l.url.replace(/^https:\/\//, '')}`).join('  ·  '),
  ].filter(Boolean);
  biz.forEach((l, i) => pdf.text(pdfSafe(l), M, y + 12 + i * 3.8));
  pdf.setTextColor(...accent);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text(doc.kind.toUpperCase(), W - M, y + 7.5, { align: 'right' });
  pdf.setFontSize(9);
  pdf.setTextColor(...ink);
  pdf.setFont('helvetica', 'normal');
  [`N.º ${doc.number}`, `Fecha: ${formatDate(doc.date, doc.locale)}`, `Estado: ${doc.status}`].forEach((l, i) => pdf.text(pdfSafe(l), W - M, y + 13 + i * 4.2, { align: 'right' }));
  y += Math.max(16 + biz.length * 3.8, 28);

  pdf.setDrawColor(225, 225, 228);
  pdf.setLineWidth(0.3);
  pdf.line(M, y, W - M, y);
  y += 6;
  pdf.setFontSize(8);
  pdf.setTextColor(...muted);
  pdf.text('CLIENTE', M, y);
  pdf.text('ENTREGA', 110, y);
  y += 4.5;
  pdf.setFontSize(10.5);
  pdf.setTextColor(...ink);
  pdf.setFont('helvetica', 'bold');
  pdf.text(pdfSafe(doc.customer.name || 'Consumidor final'), M, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const del = pdf.splitTextToSize(pdfSafe([doc.delivery.mode === 'envio' ? `Envío a ${doc.delivery.address}` : 'Retira en el local', doc.delivery.date ? `Fecha: ${formatDate(doc.delivery.date, doc.locale)}` : ''].filter(Boolean).join('\n')), W - M - 110) as string[];
  pdf.text(del, 110, y);
  y += Math.max(8, del.length * 4.2 + 4);

  const cols = { desc: M, qty: 128, price: 158, total: W - M };
  const header = () => {
    pdf.setFillColor(244, 244, 241);
    pdf.rect(M, y - 4.5, W - 2 * M, 7, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...muted);
    pdf.text('DESCRIPCIÓN', cols.desc + 2, y);
    pdf.text('CANT.', cols.qty, y, { align: 'right' });
    pdf.text('P. UNIT.', cols.price, y, { align: 'right' });
    pdf.text('IMPORTE', cols.total - 2, y, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    y += 7;
  };
  header();
  pdf.setFontSize(9);
  for (const line of doc.lines) {
    const d = pdf.splitTextToSize(pdfSafe(line.description), cols.qty - cols.desc - 22) as string[];
    const h = d.length * 4.2 + 3;
    if (y + h > pageBottom) {
      pdf.addPage();
      y = M + 6;
      header();
      pdf.setFontSize(9);
    }
    pdf.setTextColor(...ink);
    pdf.text(d, cols.desc + 2, y);
    pdf.text(pdfSafe(`${formatNumber(line.quantity, 3, doc.locale)}${line.unit ? ` ${line.unit}` : ''}`), cols.qty, y, { align: 'right' });
    pdf.text(money(line.unitPrice), cols.price, y, { align: 'right' });
    pdf.text(money(line.lineTotal), cols.total - 2, y, { align: 'right' });
    y += h - 3;
    pdf.setDrawColor(236, 236, 238);
    pdf.line(M, y, W - M, y);
    y += 5;
  }

  const t = doc.totals;
  const rows: Array<[string, string, boolean?]> = [['Subtotal', money(t.subtotal)]];
  if (t.globalDiscount !== '0.00') rows.push([`Descuento (${formatNumber(t.globalDiscountPct, 2, doc.locale)}%)`, `- ${money(t.globalDiscount)}`]);
  if (t.tax !== '0.00') rows.push([`${t.taxLabel} (${formatNumber(t.taxPct, 2, doc.locale)}%)`, money(t.tax)]);
  if (t.shipping !== '0.00') rows.push(['Envío', money(t.shipping)]);
  rows.push(['TOTAL', money(t.total), true]);
  for (const p of doc.payments) rows.push([`${p.note || 'Pago'} ${formatDate(p.date, doc.locale)} (${p.method})`, `- ${money(p.amount)}`]);
  if (doc.payments.length) rows.push(['SALDO', money(doc.balance), true]);
  else rows.push([`Pagado (${doc.paymentMethod})`, money(doc.paid)]);
  if (y + rows.length * 7 + 8 > pageBottom) {
    pdf.addPage();
    y = M + 6;
  }
  y += 2;
  for (const [label, value, strong] of rows) {
    if (strong) {
      pdf.setFillColor(...accent);
      pdf.roundedRect(110, y - 5, W - M - 110, 9, 1.5, 1.5, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text(label, 114, y + 0.8);
      pdf.text(value, W - M - 3, y + 0.8, { align: 'right' });
      y += 10;
    } else {
      pdf.setTextColor(...muted);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(pdfSafe(label), 114, y);
      pdf.setTextColor(...ink);
      pdf.text(value, W - M - 3, y, { align: 'right' });
      y += 5.5;
    }
  }
  y += 6;
  pdf.setFontSize(8);
  pdf.setTextColor(...muted);
  pdf.text(pdfSafe('Comprobante no válido como factura.'), M, Math.min(y, pageBottom));

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7.5);
    pdf.setTextColor(...muted);
    pdf.text(pdfSafe(`${doc.business.name} · ${doc.kind} ${doc.number}`), M, 297 - 10);
    pdf.text(`Página ${i} de ${pages}`, W - M, 297 - 10, { align: 'right' });
  }
  return { bytes: new Uint8Array(pdf.output('arraybuffer')), fileName: receiptFileName(doc) };
}
