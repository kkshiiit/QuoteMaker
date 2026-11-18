// @vitest-environment node
/**
 * Ventas (cálculos y resúmenes por canal/cliente), perfiles de redes sociales y la frontera
 * de privacidad al COMPARTIR PRODUCTOS y al sumar redes a presupuestos.
 */
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/data/defaults';
import { emptyProduct, emptySale, saleFromQuote } from '../../src/data/services';
import { computeSaleTotals, formatSaleNumber, summarizeSales, validateSale } from '../../src/domain/sales';
import type { BusinessSettings, Product, Quote, Sale, SaleItem } from '../../src/domain/types';
import { assertPublicProduct, buildPublicProduct, productFileBase, productShareText, PublicProductViolation } from '../../src/privacy/publicProduct';
import { assertPublicDocument, buildPublicQuoteDocument, PrivacyViolationError } from '../../src/privacy/publicQuote';
import { normalizeSocial, socialBlock, socialLinks } from '../../src/privacy/social';
import { buildWhatsAppMessage } from '../../src/privacy/whatsapp';

const item = (over: Partial<SaleItem> = {}): SaleItem => ({ id: Math.random().toString(36), productId: null, description: 'Silla', unit: 'u', quantity: '2', unitPrice: '1000', discountPct: '0', unitCost: '600', ...over });
const sale = (over: Partial<Sale> = {}): Sale => ({ ...emptySale(), number: 'V-00001', items: [item()], ...over });

describe('ventas: cálculos', () => {
  it('total con descuento por renglón, descuento general, impuesto y envío; ganancia interna sin impuesto ni envío', () => {
    const t = computeSaleTotals(sale({ items: [item({ quantity: '3', unitPrice: '1000', discountPct: '10', unitCost: '500' })], globalDiscountPct: '5', taxPct: '21', shippingCharged: '1500' }));
    // 3×1000 = 3000 − 10 % = 2700; −5 % = 2565; IVA 21 % = 538,65; + envío 1500
    expect(t.commercial.subtotal).toBe('2700.00');
    expect(t.commercial.globalDiscount).toBe('135.00');
    expect(t.commercial.tax).toBe('538.65');
    expect(t.total).toBe('4603.65');
    expect(t.cost).toBe('1500.00');
    expect(t.profit).toBe('1065.00');
  });

  it('decimales exactos (sin errores de coma flotante)', () => {
    const t = computeSaleTotals(sale({ items: [item({ quantity: '3', unitPrice: '0.10', unitCost: '0' })] }));
    expect(t.total).toBe('0.30');
  });

  it('valida: sin ítems, cantidades, descuentos, impuesto y plataforma online', () => {
    expect(validateSale(sale({ items: [] }))).toContain('Agregá al menos un producto o concepto vendido.');
    const errs = validateSale(sale({ channel: 'online', platform: '', items: [item({ quantity: '0', discountPct: '120', description: '' })], taxPct: '-1' }));
    expect(errs.join('\n')).toMatch(/descripción/);
    expect(errs.join('\n')).toMatch(/cantidad/);
    expect(errs.join('\n')).toMatch(/descuento/);
    expect(errs.join('\n')).toMatch(/impuesto/);
    expect(errs.join('\n')).toMatch(/online/);
    expect(validateSale(sale({ channel: 'online', platform: 'Instagram' }))).toEqual([]);
  });

  it('resumen por canal (local/online), plataforma y cliente; las anuladas no suman', () => {
    const s = summarizeSales([
      sale({ channel: 'presencial', customerName: '' }),
      sale({ channel: 'online', platform: 'Instagram', customerId: 'c1', customerName: 'Lucía' }),
      sale({ channel: 'online', platform: 'Instagram', customerId: 'c1', customerName: 'Lucía' }),
      sale({ channel: 'online', platform: 'Facebook', customerName: 'Pedro' }),
      sale({ channel: 'presencial', cancelled: true }),
    ]);
    expect(s.count).toBe(4);
    expect(s.total).toBe('8000.00');
    expect(s.profit).toBe('3200.00');
    expect(s.byChannel.presencial).toEqual({ count: 1, total: '2000.00' });
    expect(s.byChannel.online).toEqual({ count: 3, total: '6000.00' });
    expect(s.byPlatform[0]).toEqual({ platform: 'Instagram', count: 2, total: '4000.00' });
    expect(s.byCustomer[0]).toMatchObject({ key: 'c1', name: 'Lucía', count: 2, total: '4000.00' });
    expect(s.byCustomer.find((c) => c.name === 'Consumidor final')?.count).toBe(1);
  });

  it('numeración de ventas', () => {
    expect(formatSaleNumber('V-', 7)).toBe('V-00007');
  });

  it('venta desde presupuesto enviado: usa la copia congelada (ítems, impuesto, envío)', () => {
    const q = {
      id: 'q1',
      customerId: 'c9',
      customerSnapshot: { name: 'Borrador', phone: '', email: '', address: '', taxId: '' },
      items: [],
      globalDiscountPct: '0',
      taxPct: '0',
      shippingCharged: '0',
      frozen: {
        frozenAt: '2026-01-01',
        customer: { name: 'Estudio Norte', phone: '', email: '', address: '', taxId: '' },
        items: [item({ id: 'x', description: 'Mesa', unitCost: '900' })],
        globalDiscountPct: '10',
        taxPct: '21',
        shippingCharged: '500',
      },
    } as unknown as Quote;
    const s = saleFromQuote(q);
    expect(s.quoteId).toBe('q1');
    expect(s.customerName).toBe('Estudio Norte');
    expect(s.items[0]!.description).toBe('Mesa');
    expect(s.items[0]!.id).not.toBe('x');
    expect(s.taxPct).toBe('21');
    expect(s.shippingCharged).toBe('500');
  });
});

describe('redes sociales', () => {
  it('normaliza @usuario y links a perfiles directos', () => {
    expect(normalizeSocial('instagram', '@chediek.home')).toBe('https://instagram.com/chediek.home');
    expect(normalizeSocial('instagram', 'https://www.instagram.com/chediek.home/')).toBe('https://instagram.com/chediek.home');
    expect(normalizeSocial('facebook', 'facebook.com/chediekhome')).toBe('https://facebook.com/chediekhome');
    expect(normalizeSocial('facebook', 'https://m.facebook.com/chediekhome')).toBe('https://facebook.com/chediekhome');
    expect(normalizeSocial('tiktok', '@chediek')).toBe('https://tiktok.com/@chediek');
    expect(normalizeSocial('tiktok', 'https://www.tiktok.com/@chediek')).toBe('https://tiktok.com/@chediek');
    expect(normalizeSocial('instagram', '')).toBe('');
  });

  it('rechaza dominios ajenos y valores inválidos', () => {
    expect(normalizeSocial('instagram', 'https://evil.example/instagram.com/x')).toBeNull();
    expect(normalizeSocial('facebook', 'https://instagram.com/x')).toBeNull();
    expect(normalizeSocial('tiktok', 'javascript:alert(1)')).toBeNull();
    expect(normalizeSocial('instagram', 'con espacios')).toBeNull();
    expect(normalizeSocial('facebook', 'https://facebook.com/')).toBeNull();
  });

  it('arma los links en orden Instagram, Facebook, TikTok y el bloque de texto', () => {
    const links = socialLinks({ tiktok: '@b', instagram: '@a', facebook: 'facebook.com/c' });
    expect(links.map((l) => l.network)).toEqual(['instagram', 'facebook', 'tiktok']);
    expect(socialBlock(links)).toBe('Seguinos:\nInstagram: https://instagram.com/a\nFacebook: https://facebook.com/c\nTikTok: https://tiktok.com/@b');
    expect(socialBlock([])).toBe('');
  });
});

// ---------------- Privacidad al compartir productos ----------------

const SECRET = ['7777', '7.777', 'Distribuidora Oculta', 'NOTA INTERNA', 'margen', 'costo', 'proveedor', 'SKU-SECRETO', '4321'];

function bizSettings(): BusinessSettings {
  return { ...defaultSettings(), businessName: 'Chediek Home', instagram: '@chediek.home', facebook: 'facebook.com/chediekhome', tiktok: '@chediek' };
}

function poisonedProduct(): Product {
  return {
    ...emptyProduct(),
    name: 'Sillón Nube',
    description: 'Tela pana, 3 cuerpos',
    sku: 'SKU-SECRETO',
    supplierId: 'Distribuidora Oculta',
    currentCost: '7777.77',
    manualCost: '7777.77',
    targetMarginPct: '43.21',
    internalNotes: 'NOTA INTERNA: comprar a Distribuidora Oculta',
    photos: ['data:image/webp;base64,AAAA'],
  };
}

describe('compartir productos: allowlist anti-filtración', () => {
  it('el documento público sólo tiene nombre, descripción, unidad, precio, negocio y redes', () => {
    const doc = buildPublicProduct(poisonedProduct(), bizSettings(), '150000', { includePrice: true, includeSocials: true });
    expect(Object.keys(doc).sort()).toEqual(['businessName', 'description', 'name', 'price', 'schema', 'socials', 'unit']);
    const json = JSON.stringify(doc);
    for (const s of SECRET) expect(json).not.toContain(s);
    expect(doc.price).toMatch(/150\.000/);
    expect(doc.socials).toHaveLength(3);
  });

  it('el texto para compartir es claro (nombre, descripción, precio, redes) y no filtra datos internos', () => {
    const text = productShareText(buildPublicProduct(poisonedProduct(), bizSettings(), '150000', { includePrice: true, includeSocials: true }));
    expect(text.split('\n')[0]).toBe('*Sillón Nube*');
    expect(text).toContain('Tela pana, 3 cuerpos');
    expect(text).toMatch(/Precio: \$\s?150\.000/);
    expect(text).toContain('Facebook: https://facebook.com/chediekhome');
    expect(text).toContain('Instagram: https://instagram.com/chediek.home');
    expect(text).toContain('TikTok: https://tiktok.com/@chediek');
    for (const s of SECRET) expect(text.toLowerCase()).not.toContain(s.toLowerCase());
  });

  it('se puede compartir sin precio y sin redes', () => {
    const doc = buildPublicProduct(poisonedProduct(), bizSettings(), '150000', { includePrice: false, includeSocials: false });
    const text = productShareText(doc);
    expect(doc.price).toBe('');
    expect(doc.socials).toEqual([]);
    expect(text).not.toMatch(/Precio|Seguinos/);
  });

  it('rechaza campos fuera de la allowlist (incluso dentro de socials)', () => {
    const doc = buildPublicProduct(poisonedProduct(), bizSettings(), null, { includePrice: true, includeSocials: true });
    expect(() => assertPublicProduct({ ...doc, cost: '7777' } as never)).toThrow(PublicProductViolation);
    expect(() => assertPublicProduct({ ...doc, socials: [{ ...doc.socials[0]!, note: 'x' } as never] })).toThrow(PublicProductViolation);
  });

  it('nombre de archivo seguro, sin acentos ni datos internos', () => {
    expect(productFileBase({ name: 'Sillón Nube / 3 cuerpos' })).toBe('Sillon-Nube-3-cuerpos');
  });
});

describe('presupuestos con links a redes', () => {
  const quote = {
    id: 'q',
    number: 'P-00001',
    status: 'sent',
    customerId: null,
    customerSnapshot: { name: 'Ana', phone: '', email: '', address: '', taxId: '' },
    issueDate: '2026-01-01',
    validUntil: '2026-01-15',
    items: [{ id: 'a', productId: null, description: 'Mesa', unit: 'u', quantity: '1', unitPrice: '1000', discountPct: '0', unitCost: '7777.77' }],
    globalDiscountPct: '0',
    taxPct: '0',
    shippingCharged: '0',
    shippingCost: '0',
    conditions: '',
    commercialNotes: '',
    internalNotes: 'NOTA INTERNA',
    frozen: null,
    events: [],
    createdAt: '',
    updatedAt: '',
  } as Quote;

  it('por defecto incluye las redes en el documento y en WhatsApp; se pueden quitar', () => {
    const withSocial = buildPublicQuoteDocument(quote, bizSettings());
    expect(withSocial.socials.map((s) => s.label)).toEqual(['Instagram', 'Facebook', 'TikTok']);
    expect(buildWhatsAppMessage(withSocial).text).toContain('Facebook: https://facebook.com/chediekhome');
    const without = buildPublicQuoteDocument(quote, bizSettings(), { includeSocials: false });
    expect(without.socials).toEqual([]);
    expect(buildWhatsAppMessage(without).text).not.toContain('Seguinos');
    expect(JSON.stringify(withSocial)).not.toContain('7777');
  });

  it('assertPublicDocument rechaza claves extra dentro de socials', () => {
    const doc = buildPublicQuoteDocument(quote, bizSettings());
    expect(() => assertPublicDocument({ ...doc, socials: [{ ...doc.socials[0]!, cost: '1' } as never] })).toThrow(PrivacyViolationError);
  });
});
