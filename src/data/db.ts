/**
 * Base local (IndexedDB vía Dexie). Es la fuente de verdad en el dispositivo: la app
 * funciona 100 % offline. La sincronización cloud (opcional) lee la cola `outbox`.
 */
import Dexie, { type Table } from 'dexie';
import type {
  BusinessSettings,
  Category,
  CollectionName,
  CostHistoryEntry,
  Customer,
  Expense,
  Overhead,
  Preferences,
  Product,
  Purchase,
  ProductVideo,
  Quote,
  QuoteDocumentRecord,
  Sale,
  Supplier,
} from '../domain/types';

export type SyncStatus = 'local' | 'pending' | 'synced' | 'error' | 'conflict';

export interface OutboxEntry {
  mutationId: string; // idempotencia: el servidor ignora mutaciones repetidas
  collection: CollectionName;
  recordId: string;
  op: 'upsert' | 'delete';
  payload: unknown | null;
  baseVersion: number; // versión del servidor sobre la que se hizo el cambio
  createdAt: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
}

export interface SyncStateEntry {
  key: string; // `${collection}:${id}`
  collection: CollectionName;
  recordId: string;
  status: SyncStatus;
  version: number; // última versión conocida del servidor (0 = nunca subido)
  lastSyncedAt: string | null;
  error: string | null;
  remotePayload: unknown | null; // en conflicto: copia del servidor para que la persona elija
  remoteDeleted: boolean;
  conflictServerVersion?: number; // versión del servidor que originó el conflicto
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export class QuoteMakerDB extends Dexie {
  settings!: Table<BusinessSettings, string>;
  categories!: Table<Category, string>;
  suppliers!: Table<Supplier, string>;
  products!: Table<Product, string>;
  costHistory!: Table<CostHistoryEntry, string>;
  purchases!: Table<Purchase, string>;
  expenses!: Table<Expense, string>;
  overheads!: Table<Overhead, string>;
  customers!: Table<Customer, string>;
  quotes!: Table<Quote, string>;
  quoteDocuments!: Table<QuoteDocumentRecord, string>;
  sales!: Table<Sale, string>;
  /** Videos de productos: SOLO locales (no se sincronizan ni se incluyen en el respaldo JSON). */
  productVideos!: Table<ProductVideo, string>;
  prefs!: Table<Preferences, string>;
  outbox!: Table<OutboxEntry, string>;
  syncState!: Table<SyncStateEntry, string>;
  meta!: Table<MetaEntry, string>;

  constructor(name = 'quotemaker') {
    super(name);
    this.version(1).stores({
      settings: 'id',
      categories: 'id, name, archived',
      suppliers: 'id, name, archived',
      products: 'id, name, sku, categoryId, supplierId, active, archived, updatedAt',
      costHistory: 'id, productId, at',
      purchases: 'id, date, supplierId, voided',
      expenses: 'id, date, status, purchaseId, category',
      overheads: 'id, active, category',
      customers: 'id, name, archived',
      quotes: 'id, number, status, customerId, issueDate, updatedAt',
      quoteDocuments: 'id, quoteId, createdAt',
      prefs: 'id',
      outbox: 'mutationId, [collection+recordId], createdAt',
      syncState: 'key, status, collection',
      meta: 'key',
    });
    this.version(2).stores({
      sales: 'id, number, date, channel, customerId, quoteId, updatedAt',
      productVideos: 'id, productId, createdAt',
    });
  }

  coll<T>(name: CollectionName): Table<T, string> {
    return this.table<T, string>(name);
  }
}

export let db = new QuoteMakerDB();

/** Sólo para pruebas: abre una base aislada. */
export function openTestDatabase(name: string): QuoteMakerDB {
  db = new QuoteMakerDB(name);
  return db;
}
