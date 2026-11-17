/**
 * Modelos de datos INTERNOS de QuoteMaker.
 *
 * Todo lo definido aquí es información privada del emprendedor. Los documentos comerciales
 * (PDF, WhatsApp) NUNCA reciben estos tipos: reciben `PublicQuoteDocument`
 * (ver src/privacy/publicQuote.ts), construido mediante una allowlist explícita.
 */
import type { Dec } from './money';
import type { AllocationMethod } from './allocation';
import type { RoundingRule } from './pricing';

export interface BaseRecord {
  id: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface BusinessSettings extends BaseRecord {
  businessName: string;
  legalName: string;
  taxId: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  currency: string; // ISO 4217
  locale: string;
  defaultTaxPct: Dec;
  taxLabel: string;
  defaultValidityDays: number;
  defaultConditions: string;
  quotePrefix: string;
  nextQuoteNumber: number;
  defaultTargetMarginPct: Dec;
  defaultPctCharges: Dec;
  defaultFixedPerUnit: Dec;
  rounding: RoundingRule;
  estimatedMonthlyUnits: Dec; // para prorratear gastos generales por unidad
  costStaleDays: number; // a partir de cuántos días un costo se considera desactualizado
  showBusinessContactPhone: boolean;
  showBusinessContactEmail: boolean;
  showBusinessAddress: boolean;
  showBusinessTaxId: boolean;
}

export interface Category extends BaseRecord {
  name: string;
  archived: boolean;
}

export interface Supplier extends BaseRecord {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string; // privadas
  archived: boolean;
}

export type CostSource = 'purchase' | 'expense' | 'manual' | 'recalc';

export interface Product extends BaseRecord {
  name: string;
  description: string; // descripción comercial
  sku: string;
  categoryId: string | null;
  unit: string;
  supplierId: string | null;
  active: boolean;
  archived: boolean;
  image: string | null; // data URL WebP/JPEG reducida
  unitWeight: Dec; // kg
  unitVolume: Dec; // litros / dm³
  currentCost: Dec | null; // costo unitario real (escala 4)
  costUpdatedAt: string | null;
  costSource: CostSource | null;
  manualCost: Dec | null; // costo cargado a mano (si no hay compras)
  manualPrice: Dec | null; // precio de venta fijado por la persona usuaria
  targetMarginPct: Dec | null; // si es null se usa el de configuración
  internalNotes: string;
}

export interface CostHistoryEntry extends BaseRecord {
  productId: string;
  unitCost: Dec;
  previousCost: Dec | null;
  source: CostSource;
  refId: string | null; // compra o gasto que originó el cambio
  note: string;
  at: string;
}

export interface PurchaseItem {
  id: string;
  productId: string;
  quantity: Dec;
  unitPrice: Dec; // precio unitario de compra
  discount: Dec; // importe de descuento del renglón
  unitWeight: Dec;
  unitVolume: Dec;
}

export interface Purchase extends BaseRecord {
  supplierId: string | null;
  date: string; // YYYY-MM-DD
  reference: string;
  currency: string;
  /** Unidades de la moneda del negocio por 1 unidad de `currency` (1 si es la misma). Registros viejos sin campo = 1. */
  exchangeRate?: Dec;
  items: PurchaseItem[];
  discount: Dec; // descuento general (importe)
  extraCharges: Dec; // cargos adicionales de la factura (importe)
  notes: string;
  attachment: { name: string; type: string; dataUrl: string } | null;
  voided: boolean;
}

export const EXPENSE_CATEGORIES = [
  'Viaje',
  'Combustible',
  'Peajes',
  'Estacionamiento',
  'Transporte',
  'Alojamiento',
  'Envío de compra',
  'Embalaje',
  'Importación',
  'Comisiones',
  'Mano de obra / tiempo',
  'Gastos operativos',
  'Otros',
] as const;

export type ExpenseTarget = 'unassigned' | 'purchase' | 'products';
export type ExpenseStatus = 'unassigned' | 'allocated' | 'void';

export interface ExpenseAllocation {
  lotKey: string; // `${purchaseId}:${itemId}`
  purchaseId: string;
  itemId: string;
  productId: string;
  amount: Dec;
}

export interface Expense extends BaseRecord {
  date: string;
  category: string;
  description: string;
  amount: Dec;
  target: ExpenseTarget;
  purchaseId: string | null;
  productIds: string[];
  method: AllocationMethod;
  manualValues: Record<string, Dec>; // lotKey → porcentaje o importe manual
  allocations: ExpenseAllocation[];
  status: ExpenseStatus;
  notes: string;
}

export type OverheadFrequency = 'once' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export const OVERHEAD_CATEGORIES = [
  'Alquiler',
  'Electricidad',
  'Internet',
  'Publicidad',
  'Suscripciones',
  'Herramientas',
  'Mantenimiento',
  'Servicios',
  'Otros',
] as const;

export interface Overhead extends BaseRecord {
  name: string;
  category: string;
  amount: Dec;
  currency: string;
  frequency: OverheadFrequency;
  kind: 'fixed' | 'variable';
  startDate: string;
  endDate: string | null;
  active: boolean;
  includeInUnitCost: boolean; // distribuir por unidad estimada en la calculadora
  notes: string;
}

export interface Customer extends BaseRecord {
  name: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  notes: string; // privadas: jamás salen en documentos
  archived: boolean;
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'cancelled';

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Borrador',
  sent: 'Enviado',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  expired: 'Vencido',
  cancelled: 'Cancelado',
};

export interface QuoteItem {
  id: string;
  productId: string | null;
  description: string; // descripción comercial editable
  unit: string;
  quantity: Dec;
  unitPrice: Dec; // precio de venta neto
  discountPct: Dec;
  /** INTERNO: costo unitario congelado al agregar el ítem. */
  unitCost: Dec;
}

export interface QuoteEvent {
  at: string;
  type: 'created' | 'updated' | 'status' | 'pdf' | 'whatsapp' | 'duplicated' | 'issued';
  detail: string;
}

/** Datos del cliente aptos para el documento (allowlist). Sin notas privadas. */
export interface CustomerCommercialSnapshot {
  name: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
}

export interface Quote extends BaseRecord {
  number: string;
  customerId: string | null;
  customerSnapshot: CustomerCommercialSnapshot;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  items: QuoteItem[];
  globalDiscountPct: Dec;
  taxPct: Dec;
  shippingCharged: Dec;
  /** INTERNO: costo real del envío para el negocio. */
  shippingCost: Dec;
  conditions: string;
  commercialNotes: string;
  internalNotes: string;
  /** Copia congelada al marcar como Enviado. Cambios futuros no la alteran. */
  frozen: FrozenQuote | null;
  events: QuoteEvent[];
}

export interface FrozenQuote {
  frozenAt: string;
  business: BusinessCommercialSnapshot;
  customer: CustomerCommercialSnapshot;
  items: QuoteItem[];
  globalDiscountPct: Dec;
  taxPct: Dec;
  taxLabel: string;
  shippingCharged: Dec;
  shippingCost: Dec;
  conditions: string;
  commercialNotes: string;
  issueDate: string;
  validUntil: string;
  currency: string;
}

export interface BusinessCommercialSnapshot {
  businessName: string;
  legalName: string;
  taxId: string;
  phone: string;
  email: string;
  address: string;
  website: string;
}

export interface QuoteDocumentRecord extends BaseRecord {
  quoteId: string;
  kind: 'pdf' | 'whatsapp';
  fileName: string;
  channel: 'download' | 'share' | 'copy' | 'open';
  sha256: string;
}

export interface Preferences {
  id: 'prefs';
  themeMode: 'light' | 'dark' | 'system';
  paletteId: string;
  customAccent: string | null;
  hideInternalByDefault: boolean;
  onboardingDone: boolean;
}

export type CollectionName =
  | 'settings'
  | 'categories'
  | 'suppliers'
  | 'products'
  | 'costHistory'
  | 'purchases'
  | 'expenses'
  | 'overheads'
  | 'customers'
  | 'quotes'
  | 'quoteDocuments';

export const SYNCED_COLLECTIONS: CollectionName[] = [
  'settings',
  'categories',
  'suppliers',
  'products',
  'costHistory',
  'purchases',
  'expenses',
  'overheads',
  'customers',
  'quotes',
  'quoteDocuments',
];
