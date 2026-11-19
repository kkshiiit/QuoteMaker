// @vitest-environment node
/**
 * Pruebas anti-filtración: generan PDF y WhatsApp reales a partir de un presupuesto cargado
 * con datos internos "trampa" y fallan si alguno aparece en el contenido, metadatos,
 * nombre de archivo o payload público.
 */
import { describe, expect, it } from 'vitest';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { inflateSync } from 'node:zlib';
import { buildPublicQuoteDocument, assertPublicDocument, PrivacyViolationError, publicFileName, type PublicQuoteDocument } from '../../src/privacy/publicQuote';
import { generateQuotePdf } from '../../src/privacy/pdf';
import { buildWhatsAppMessage, whatsappUrl } from '../../src/privacy/whatsapp';
import type { BusinessSettings, Quote } from '../../src/domain/types';
import { defaultSettings } from '../../src/data/defaults';

GlobalWorkerOptions.workerSrc = new URL('../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href;

// Valores internos ficticios y reconocibles
const SECRET_COST = '7777.77';
const SECRET_SHIPPING_COST = '6543.21';
const INTERNAL_NOTE = 'NOTA INTERNA: pagar al proveedor Distribuidora Oculta SRL';
const CUSTOMER_PRIVATE_NOTE = 'Cliente moroso, pedir seña ZZPRIVADOZZ';

const FORBIDDEN_TERMS = [
  'costo de compra',
  'costo unitario',
  'proveedor',
  'combustible',
  'peaje',
  'estacionamiento',
  'mano de obra',
  'margen',
  'markup',
  'ganancia',
  'rentabilidad',
  'Distribuidora Oculta',
  'ZZPRIVADOZZ',
  'NOTA INTERNA',
  '7777',
  '7.777',
  '6543',
  '6.543',
];

function settings(): BusinessSettings {
  return {
    ...defaultSettings(),
    businessName: 'Taller Aurora',
    phone: '+54 9 11 5555-0000',
    email: 'ventas@aurora.example',
    address: 'Calle Falsa 123',
    taxId: '20-11111111-1',
    showBusinessTaxId: true,
  };
}

function quote(status: Quote['status'] = 'sent'): Quote {
  const items = [
    { id: 'a', productId: 'p1', description: 'Mesa de roble 120 cm', unit: 'u', quantity: '2', unitPrice: '150000', discountPct: '5', unitCost: SECRET_COST },
    { id: 'b', productId: 'p2', description: 'Silla tapizada', unit: 'u', quantity: '4', unitPrice: '45000', discountPct: '0', unitCost: SECRET_COST },
  ];
  const customer = { name: 'Lucía Fernández', phone: '+54 9 11 4444-1234', email: 'lucia@example.com', address: 'Av. Siempreviva 742', taxId: '' };
  const base: Quote = {
    id: 'q1',
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
    number: 'P-00042',
    customerId: 'c1',
    customerSnapshot: customer,
    status,
    issueDate: '2026-03-01',
    validUntil: '2026-03-16',
    items,
    globalDiscountPct: '0',
    taxPct: '21',
    shippingCharged: '8000',
    shippingCost: SECRET_SHIPPING_COST,
    conditions: 'Seña del 50 %. Entrega en 10 días hábiles.',
    commercialNotes: 'Incluye armado.',
    internalNotes: INTERNAL_NOTE,
    frozen: null,
    events: [{ at: '2026-03-01T10:00:00Z', type: 'created', detail: INTERNAL_NOTE }],
  };
  return base;
}

/** Contaminamos intencionalmente objetos de entrada con claves internas extra. */
function poisoned(q: Quote): Quote {
  return {
    ...q,
    customerSnapshot: { ...q.customerSnapshot, ...{ notes: CUSTOMER_PRIVATE_NOTE } },
    items: q.items.map((it) => ({ ...it, ...{ supplier: 'Distribuidora Oculta SRL', margin: '45', costoUnitario: SECRET_COST } })),
  } as Quote;
}

async function extractPdf(bytes: Uint8Array) {
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: false, isEvalSupported: false }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
  }
  const meta = await pdf.getMetadata();
  return { text, meta: JSON.stringify(meta.info ?? {}) + JSON.stringify(meta.metadata?.getAll?.() ?? {}) };
}

/** Texto crudo del PDF incluyendo streams descomprimidos. */
function rawPdfText(bytes: Uint8Array): string {
  const latin = Buffer.from(bytes).toString('latin1');
  let out = latin;
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin))) {
    try {
      out += inflateSync(Buffer.from(m[1]!, 'latin1')).toString('latin1');
    } catch {
      /* stream no comprimido */
    }
  }
  return out;
}

function expectClean(haystack: string, where: string) {
  const lower = haystack.toLowerCase();
  for (const term of FORBIDDEN_TERMS) {
    expect(lower.includes(term.toLowerCase()), `"${term}" filtrado en ${where}`).toBe(false);
  }
}

describe('privacidad del documento público', () => {
  it('el payload público sólo contiene claves de la allowlist y ningún dato interno', () => {
    const doc = buildPublicQuoteDocument(poisoned(quote()), settings());
    const json = JSON.stringify(doc);
    expectClean(json, 'PublicQuoteDocument');
    expect(json).not.toContain('unitCost');
    expect(json).not.toContain('internalNotes');
    expect(json).not.toContain('shippingCost');
  });

  it('assertPublicDocument rechaza claves no permitidas', () => {
    const doc = buildPublicQuoteDocument(quote(), settings());
    const bad = { ...doc, lines: [{ ...doc.lines[0]!, unitCost: '1' }] } as unknown as PublicQuoteDocument;
    expect(() => assertPublicDocument(bad)).toThrow(PrivacyViolationError);
    const bad2 = { ...doc, internal: { profit: '1' } } as unknown as PublicQuoteDocument;
    expect(() => assertPublicDocument(bad2)).toThrow(PrivacyViolationError);
  });

  it('el nombre de archivo sólo usa el número', () => {
    const doc = buildPublicQuoteDocument(quote(), settings());
    expect(publicFileName(doc)).toBe('Presupuesto-P-00042.pdf');
    expect(publicFileName({ number: '../../etc' })).toBe('Presupuesto-etc.pdf');
  });

  it('respeta las preferencias de datos de contacto del negocio', () => {
    const s = { ...settings(), showBusinessContactPhone: false, showBusinessTaxId: false };
    const doc = buildPublicQuoteDocument(quote(), s);
    expect(doc.business.phone).toBe('');
    expect(doc.business.taxId).toBe('');
  });
});

describe('PDF sin filtraciones', () => {
  it('texto, metadatos y streams crudos no contienen información interna', async () => {
    const doc = buildPublicQuoteDocument(poisoned(quote()), settings());
    const { bytes, fileName } = await generateQuotePdf(doc);
    expect(fileName).toBe('Presupuesto-P-00042.pdf');
    const { text, meta } = await extractPdf(bytes);
    // Contenido esperado presente (el PDF es útil)
    expect(text).toContain('Taller Aurora');
    expect(text).toContain('P-00042');
    expect(text).toContain('Lucía Fernández');
    expect(text).toContain('Mesa de roble 120 cm');
    expect(text).toContain('TOTAL');
    expect(text.replace(/\s/g, '')).toContain('$570.650,00'.replace(/\s/g, ''));
    // Nada interno
    expectClean(text, 'texto del PDF');
    expectClean(meta, 'metadatos del PDF');
    expectClean(rawPdfText(bytes), 'bytes crudos del PDF');
  });

  it('pagina presupuestos largos', async () => {
    const q = quote();
    q.items = Array.from({ length: 60 }, (_, i) => ({ ...q.items[0]!, id: `x${i}`, description: `Artículo número ${i + 1} con una descripción comercial bastante extensa para forzar el salto de línea` }));
    const { bytes } = await generateQuotePdf(buildPublicQuoteDocument(q, settings()));
    const { text } = await extractPdf(bytes);
    expect(text).toContain('Artículo número 60');
    expect(text).toMatch(/Página 1 de [3-9]/);
    expectClean(text, 'PDF largo');
  });

  it('marca los borradores', async () => {
    const { bytes } = await generateQuotePdf(buildPublicQuoteDocument(quote('draft'), settings()));
    const { text } = await extractPdf(bytes);
    expect(text).toContain('BORRADOR');
  });
});

describe('WhatsApp sin filtraciones', () => {
  it('el mensaje incluye resumen y total pero no datos internos', () => {
    const doc = buildPublicQuoteDocument(poisoned(quote()), settings());
    const msg = buildWhatsAppMessage(doc);
    expect(msg.text).toContain('P-00042');
    expect(msg.text).toContain('Hola Lucía');
    expect(msg.text).toMatch(/\*Total: \$\s?570\.650,00\*/);
    expect(msg.text).toContain('Envío');
    expectClean(msg.text, 'mensaje de WhatsApp');
    expect(msg.phone).toBe('5491144441234');
    const url = whatsappUrl(msg.text, msg.phone);
    expect(url.startsWith('https://wa.me/5491144441234?text=')).toBe(true);
    expectClean(decodeURIComponent(url), 'URL de WhatsApp');
  });
});

// ---------------- Recibos de ventas y pedidos ----------------
import { assertPublicReceipt, buildPublicReceipt, receiptFileName, receiptText, type PublicReceipt } from '../../src/privacy/publicReceipt';
import { generateReceiptPdf } from '../../src/privacy/receiptPdf';
import { formatMoney } from '../../src/domain/money';
import type { Sale } from '../../src/domain/types';

function sale(): Sale {
  return {
    id: 's1',
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
    number: 'V-00042',
    date: '2026-03-02',
    channel: 'online',
    platform: 'Instagram',
    customerId: 'c1',
    customerName: 'Lucía Fernández',
    items: [
      { id: 'a', productId: 'p1', variantId: 'v1', description: 'Sábana algodón (Rosa · Queen)', unit: 'u', quantity: '2', unitPrice: '24990', discountPct: '0', unitCost: SECRET_COST },
      { id: 'b', productId: 'p2', description: 'Vela de soja', unit: 'u', quantity: '1', unitPrice: '3990', discountPct: '0', unitCost: SECRET_COST },
    ],
    globalDiscountPct: '0',
    taxPct: '0',
    shippingCharged: '3500',
    paymentMethod: 'Transferencia',
    quoteId: null,
    notes: INTERNAL_NOTE,
    cancelled: false,
    status: 'confirmado',
    payments: [{ id: 'p', date: '2026-03-02', amount: '26735', method: 'Transferencia', note: 'Seña' }],
    delivery: { mode: 'envio', address: 'Av. Siempreviva 742', date: '2026-03-05', internalCost: SECRET_SHIPPING_COST, internalNote: 'ZZPRIVADOZZ combustible 8,5 km ida y vuelta' },
  };
}

describe('recibo de venta / pedido sin filtraciones', () => {
  it('el documento público sólo tiene campos permitidos y montos correctos', () => {
    const doc = buildPublicReceipt(sale(), settings());
    expectClean(JSON.stringify(doc), 'payload del recibo');
    expect(doc.kind).toBe('Pedido');
    expect(doc.totals.total).toBe('57470.00'); // 2 × 24.990 + 3.990 + 3.500
    expect(doc.paid).toBe('26735.00');
    expect(doc.balance).toBe('30735.00');
    expect(doc.delivery).toEqual({ mode: 'envio', address: 'Av. Siempreviva 742', date: '2026-03-05' });
    expect(() => assertPublicReceipt({ ...doc, cost: '1' } as unknown as PublicReceipt)).toThrow(PrivacyViolationError);
    expect(() => assertPublicReceipt({ ...doc, lines: [{ ...doc.lines[0]!, unitCost: '1' }] } as unknown as PublicReceipt)).toThrow(PrivacyViolationError);
    expect(buildPublicReceipt({ ...sale(), status: 'entregado' }, settings()).kind).toBe('Recibo');
  });

  it('PDF real: contenido comercial, saldo, sin datos internos en texto, streams ni metadatos', async () => {
    const doc = buildPublicReceipt(sale(), settings());
    const { bytes, fileName } = await generateReceiptPdf(doc);
    expect(fileName).toBe('Pedido-V-00042.pdf');
    expectClean(fileName, 'nombre de archivo');
    const { text, meta } = await extractPdf(bytes);
    expect(text).toContain('Lucía Fernández');
    expect(text).toContain('Sábana algodón (Rosa · Queen)'.replace('·', '·'));
    expect(text).toContain('SALDO');
    expect(text).toContain('Av. Siempreviva 742');
    expectClean(text, 'texto del PDF');
    expectClean(meta, 'metadatos del PDF');
    expectClean(rawPdfText(bytes), 'streams del PDF');
  });

  it('texto para WhatsApp sin datos internos', () => {
    const doc = buildPublicReceipt(sale(), settings());
    const t = receiptText(doc, (v) => formatMoney(v, 'ARS', 'es-AR'));
    expect(t).toContain('*Pedido V-00042*');
    expect(t).toContain('Seña');
    expect(t).toMatch(/Saldo: \$\s?30\.735,00/);
    expectClean(t, 'texto de WhatsApp');
    expect(receiptFileName({ kind: 'Recibo', number: '../x' })).toBe('Recibo-x.pdf');
  });
});
