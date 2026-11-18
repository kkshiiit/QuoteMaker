/**
 * Frontera de privacidad para COMPARTIR PRODUCTOS (fotos, videos, descripción, precio y redes).
 *
 * `buildPublicProduct` copia campo por campo una allowlist explícita desde el producto interno.
 * Jamás se copian costo, margen, proveedor, notas internas, SKU interno ni historial.
 * `assertPublicProduct` verifica en tiempo de ejecución que no haya claves extra.
 */
import { formatMoney } from '../domain/money';
import type { BusinessSettings, Product } from '../domain/types';
import { socialBlock, socialLinks, type SocialLink } from './social';

export interface PublicProduct {
  schema: 'chediek.public-product/1';
  name: string;
  description: string;
  unit: string;
  /** Precio de venta formateado ('' si no se incluye o no hay precio). */
  price: string;
  businessName: string;
  socials: SocialLink[];
}

export const PUBLIC_PRODUCT_ALLOWLIST = {
  root: ['schema', 'name', 'description', 'unit', 'price', 'businessName', 'socials'],
  social: ['network', 'label', 'url'],
} as const;

export interface ShareOptions {
  includePhotos: boolean;
  includeVideos: boolean;
  includePrice: boolean;
  includeSocials: boolean;
}

export const DEFAULT_SHARE_OPTIONS: ShareOptions = { includePhotos: true, includeVideos: true, includePrice: true, includeSocials: true };

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function buildPublicProduct(p: Product, settings: BusinessSettings, salePrice: string | null, opts: Pick<ShareOptions, 'includePrice' | 'includeSocials'>): PublicProduct {
  const doc: PublicProduct = {
    schema: 'chediek.public-product/1',
    name: str(p.name).trim(),
    description: str(p.description).trim(),
    unit: str(p.unit),
    price: opts.includePrice && salePrice ? formatMoney(salePrice, settings.currency, settings.locale || 'es-AR') : '',
    businessName: str(settings.businessName).trim(),
    socials: opts.includeSocials ? socialLinks(settings).map((l) => ({ network: l.network, label: l.label, url: l.url })) : [],
  };
  assertPublicProduct(doc);
  return doc;
}

export class PublicProductViolation extends Error {}

export function assertPublicProduct(doc: PublicProduct) {
  for (const k of Object.keys(doc)) if (!(PUBLIC_PRODUCT_ALLOWLIST.root as readonly string[]).includes(k)) throw new PublicProductViolation(`Campo no permitido al compartir producto: ${k}`);
  doc.socials.forEach((s, i) => {
    for (const k of Object.keys(s)) if (!(PUBLIC_PRODUCT_ALLOWLIST.social as readonly string[]).includes(k)) throw new PublicProductViolation(`Campo no permitido en socials[${i}]: ${k}`);
  });
}

/** Texto listo para compartir: entendible a primera vista (nombre, descripción, precio, redes). */
export function productShareText(doc: PublicProduct): string {
  assertPublicProduct(doc);
  const out: string[] = [`*${doc.name}*`];
  if (doc.description) out.push(doc.description);
  if (doc.price) out.push(`Precio: ${doc.price}${doc.unit && doc.unit !== 'u' ? ` por ${doc.unit}` : ''}`);
  out.push('');
  out.push(doc.businessName ? `Consultas por mensaje privado · ${doc.businessName}` : 'Consultas por mensaje privado.');
  const social = socialBlock(doc.socials);
  if (social) {
    out.push('');
    out.push(social);
  }
  return out.join('\n');
}

/** Nombre de archivo sin datos sensibles. */
export function productFileBase(doc: Pick<PublicProduct, 'name'>): string {
  return (
    doc.name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'producto'
  );
}
