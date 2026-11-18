/**
 * Generador de PDF comercial. Recibe EXCLUSIVAMENTE un PublicQuoteDocument.
 * jsPDF se importa dinámicamente para no penalizar la carga inicial.
 */
import type { jsPDF as JsPDFType } from 'jspdf';
import { formatMoney, formatNumber } from '../domain/money';
import { assertPublicDocument, publicFileName, type PublicQuoteDocument } from './publicQuote';

export function formatDate(iso: string, locale = 'es-AR'): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/** Las fuentes estándar de PDF usan WinAnsi: se normalizan caracteres no representables. */
export function pdfSafe(text: string): string {
  return (
    text
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014\u2212]/g, '-')
      .replace(/[\u00A0\u202F]/g, ' ')
      // Conserva tab/saltos, ASCII imprimible, Latin-1 y € • … (representables en WinAnsi)
      .replace(/[^\t\n\r\x20-\x7E\xA1-\xFF\u20AC\u2022\u2026]/g, '')
  );
}

export interface PdfOptions {
  accent?: string; // hex
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [20, 83, 45];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export async function generateQuotePdf(doc: PublicQuoteDocument, opts: PdfOptions = {}): Promise<{ bytes: Uint8Array; fileName: string }> {
  assertPublicDocument(doc);
  const { jsPDF } = await import('jspdf');
  const pdf: JsPDFType = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const money = (v: string) => pdfSafe(formatMoney(v, doc.currency, doc.locale));
  const accent = hexToRgb(opts.accent ?? '#14532d');
  const W = 210;
  const M = 16;
  const ink: [number, number, number] = [28, 28, 30];
  const muted: [number, number, number] = [96, 96, 104];
  let y = M;

  pdf.setProperties({
    title: pdfSafe(`Presupuesto ${doc.number}`),
    subject: 'Presupuesto comercial',
    author: pdfSafe(doc.business.name),
    creator: 'Chediek Home',
    keywords: '',
  });

  // --- Encabezado ---
  pdf.setFillColor(...accent);
  pdf.rect(0, 0, W, 4, 'F');
  // Marca: insignia con una casa de líneas simples (sin imágenes externas)
  pdf.setFillColor(...accent);
  pdf.roundedRect(M, y + 2, 12, 12, 3, 3, 'F');
  pdf.setDrawColor(255, 255, 255);
  pdf.setLineWidth(0.9);
  pdf.setLineCap('round');
  pdf.setLineJoin('round');
  pdf.line(M + 2.8, y + 7.6, M + 6, y + 4.9); // techo izq.
  pdf.line(M + 6, y + 4.9, M + 9.2, y + 7.6); // techo der.
  pdf.line(M + 3.4, y + 7.2, M + 3.4, y + 11.6); // pared izq.
  pdf.line(M + 8.6, y + 7.2, M + 8.6, y + 11.6); // pared der.
  pdf.line(M + 3.4, y + 11.6, M + 8.6, y + 11.6); // piso
  pdf.line(M + 5.1, y + 11.6, M + 5.1, y + 9.4); // puerta
  pdf.line(M + 6.9, y + 11.6, M + 6.9, y + 9.4);
  pdf.line(M + 5.1, y + 9.4, M + 6.9, y + 9.4);

  pdf.setTextColor(...ink);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text(pdfSafe(doc.business.name || 'Mi negocio'), M + 16, y + 7.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(...muted);
  const bizLines = [
    doc.business.legalName,
    doc.business.taxId ? `CUIT/ID fiscal: ${doc.business.taxId}` : '',
    [doc.business.phone, doc.business.email].filter(Boolean).join('  ·  '),
    doc.business.address,
    doc.business.website,
    (doc.socials ?? []).map((l) => `${l.label}: ${l.url.replace(/^https:\/\//, '')}`).join('  ·  '),
  ].filter(Boolean);
  bizLines.forEach((l, i) => pdf.text(pdfSafe(l), M + 16, y + 12 + i * 3.8));

  pdf.setTextColor(...accent);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text(doc.isDraft ? 'PRESUPUESTO (BORRADOR)' : 'PRESUPUESTO', W - M, y + 7.5, { align: 'right' });
  pdf.setFontSize(9);
  pdf.setTextColor(...ink);
  pdf.setFont('helvetica', 'normal');
  const meta = [`N.º ${doc.number}`, `Fecha: ${formatDate(doc.issueDate, doc.locale)}`, doc.validUntil ? `Válido hasta: ${formatDate(doc.validUntil, doc.locale)}` : ''].filter(Boolean);
  meta.forEach((l, i) => pdf.text(pdfSafe(l), W - M, y + 13 + i * 4.2, { align: 'right' }));

  y += Math.max(16 + bizLines.length * 3.8, 28);

  // --- Cliente ---
  pdf.setDrawColor(225, 225, 228);
  pdf.setLineWidth(0.3);
  pdf.line(M, y, W - M, y);
  y += 6;
  pdf.setFontSize(8);
  pdf.setTextColor(...muted);
  pdf.text('PARA', M, y);
  y += 4.5;
  pdf.setFontSize(11);
  pdf.setTextColor(...ink);
  pdf.setFont('helvetica', 'bold');
  pdf.text(pdfSafe(doc.customer.name || 'Cliente'), M, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(...muted);
  const custLines = [
    doc.customer.taxId ? `ID fiscal: ${doc.customer.taxId}` : '',
    [doc.customer.phone, doc.customer.email].filter(Boolean).join('  ·  '),
    doc.customer.address,
  ].filter(Boolean);
  custLines.forEach((l) => {
    y += 4;
    pdf.text(pdfSafe(l), M, y);
  });
  y += 8;

  // --- Tabla de ítems ---
  const cols = { desc: M, qty: 118, price: 146, disc: 160, total: W - M };
  const header = () => {
    pdf.setFillColor(244, 244, 241);
    pdf.rect(M, y - 4.5, W - 2 * M, 7, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...muted);
    pdf.text('DESCRIPCIÓN', cols.desc + 2, y);
    pdf.text('CANT.', cols.qty, y, { align: 'right' });
    pdf.text('P. UNIT.', cols.price, y, { align: 'right' });
    pdf.text('DESC.', cols.disc, y, { align: 'right' });
    pdf.text('IMPORTE', cols.total - 2, y, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    y += 7;
  };
  const pageBottom = 297 - 22;
  header();
  pdf.setFontSize(9);
  for (const line of doc.lines) {
    const descLines = pdf.splitTextToSize(pdfSafe(line.description), cols.qty - cols.desc - 22) as string[];
    const h = descLines.length * 4.2 + 3;
    if (y + h > pageBottom) {
      pdf.addPage();
      y = M + 6;
      header();
      pdf.setFontSize(9);
    }
    pdf.setTextColor(...ink);
    pdf.text(descLines, cols.desc + 2, y);
    const qty = `${formatNumber(line.quantity, 3, doc.locale)}${line.unit ? ` ${line.unit}` : ''}`;
    pdf.text(pdfSafe(qty), cols.qty, y, { align: 'right' });
    pdf.text(money(line.unitPrice), cols.price, y, { align: 'right' });
    pdf.text(line.discountPct && line.discountPct !== '0' ? pdfSafe(`${formatNumber(line.discountPct, 2, doc.locale)}%`) : '-', cols.disc, y, { align: 'right' });
    pdf.text(money(line.lineTotal), cols.total - 2, y, { align: 'right' });
    y += h - 3;
    pdf.setDrawColor(236, 236, 238);
    pdf.line(M, y, W - M, y);
    y += 5;
  }

  // --- Totales ---
  const t = doc.totals;
  const rows: Array<[string, string, boolean?]> = [['Subtotal', money(t.subtotal)]];
  if (t.globalDiscount !== '0.00') rows.push([`Descuento (${formatNumber(t.globalDiscountPct, 2, doc.locale)}%)`, `- ${money(t.globalDiscount)}`]);
  if (t.tax !== '0.00') rows.push([`${t.taxLabel} (${formatNumber(t.taxPct, 2, doc.locale)}%)`, money(t.tax)]);
  if (t.shipping !== '0.00') rows.push(['Envío', money(t.shipping)]);
  rows.push(['TOTAL', money(t.total), true]);
  if (y + rows.length * 6 + 8 > pageBottom) {
    pdf.addPage();
    y = M + 6;
  }
  y += 2;
  for (const [label, value, strong] of rows) {
    if (strong) {
      pdf.setFillColor(...accent);
      pdf.roundedRect(118, y - 5, W - M - 118, 9, 1.5, 1.5, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text(label, 122, y + 0.8);
      pdf.text(value, W - M - 3, y + 0.8, { align: 'right' });
      y += 10;
    } else {
      pdf.setTextColor(...muted);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(pdfSafe(label), 122, y);
      pdf.setTextColor(...ink);
      pdf.text(value, W - M - 3, y, { align: 'right' });
      y += 5.5;
    }
  }

  // --- Condiciones y notas ---
  const block = (title: string, body: string) => {
    if (!body.trim()) return;
    const lines = pdf.splitTextToSize(pdfSafe(body), W - 2 * M) as string[];
    if (y + 8 + lines.length * 4 > pageBottom) {
      pdf.addPage();
      y = M + 6;
    }
    y += 4;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...muted);
    pdf.text(title, M, y);
    y += 4.5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...ink);
    pdf.text(lines, M, y);
    y += lines.length * 4;
  };
  block('CONDICIONES', doc.conditions);
  block('NOTAS', doc.notes);

  // --- Pie ---
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7.5);
    pdf.setTextColor(...muted);
    pdf.text(pdfSafe(`${doc.business.name} · Presupuesto ${doc.number}`), M, 297 - 10);
    pdf.text(`Página ${i} de ${pages}`, W - M, 297 - 10, { align: 'right' });
  }

  const bytes = new Uint8Array(pdf.output('arraybuffer'));
  return { bytes, fileName: publicFileName(doc) };
}
