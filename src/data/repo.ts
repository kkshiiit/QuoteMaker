/**
 * Escritura de registros sincronizables. Toda modificación pasa por aquí para que:
 *  - se actualice `updatedAt`,
 *  - se encole la mutación en `outbox` (con mutationId para idempotencia),
 *  - quede visible el estado de sincronización (local / pendiente / sincronizado / error / conflicto).
 * Todo ocurre en una transacción de IndexedDB: un cierre inesperado no deja datos a medias.
 */
import type { BaseRecord, CollectionName } from '../domain/types';
import { db, type OutboxEntry, type SyncStateEntry } from './db';
import { newId, nowIso } from './defaults';

let cloudActive = false;
const listeners = new Set<() => void>();

export function setCloudActive(active: boolean) {
  cloudActive = active;
}
export function isCloudActive() {
  return cloudActive;
}
export function onLocalChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  for (const fn of listeners) fn();
}

const keyOf = (c: CollectionName, id: string) => `${c}:${id}`;

async function enqueue(collection: CollectionName, recordId: string, op: OutboxEntry['op'], payload: unknown | null) {
  // Coalescer con una mutación aún no enviada del mismo registro (nunca con una ya intentada,
  // para no romper la idempotencia si el servidor ya la aplicó).
  const pending = await db.outbox.where('[collection+recordId]').equals([collection, recordId]).toArray();
  const unsent = pending.find((p) => p.attempts === 0);
  if (unsent) {
    await db.outbox.update(unsent.mutationId, { op, payload, createdAt: nowIso() });
  } else {
    await db.outbox.add({
      mutationId: newId(),
      collection,
      recordId,
      op,
      payload,
      baseVersion: 0,
      createdAt: nowIso(),
      attempts: 0,
      lastError: null,
      nextAttemptAt: null,
    });
  }
  const key = keyOf(collection, recordId);
  const prev = await db.syncState.get(key);
  const state: SyncStateEntry = {
    key,
    collection,
    recordId,
    status: cloudActive ? (prev?.status === 'conflict' ? 'conflict' : 'pending') : 'local',
    version: prev?.version ?? 0,
    lastSyncedAt: prev?.lastSyncedAt ?? null,
    error: null,
    remotePayload: prev?.remotePayload ?? null,
    remoteDeleted: prev?.remoteDeleted ?? false,
  };
  await db.syncState.put(state);
}

export async function putRecord<T extends BaseRecord>(collection: CollectionName, record: T, opts: { touch?: boolean } = {}): Promise<T> {
  const next = { ...record, updatedAt: opts.touch === false ? record.updatedAt : nowIso() };
  await db.transaction('rw', [db.coll(collection), db.outbox, db.syncState], async () => {
    await db.coll<T>(collection).put(next);
    await enqueue(collection, next.id, 'upsert', next);
  });
  notify();
  return next;
}

export async function putRecords<T extends BaseRecord>(collection: CollectionName, records: T[]): Promise<void> {
  if (records.length === 0) return;
  await db.transaction('rw', [db.coll(collection), db.outbox, db.syncState], async () => {
    for (const r of records) {
      const next = { ...r, updatedAt: nowIso() };
      await db.coll<T>(collection).put(next);
      await enqueue(collection, next.id, 'upsert', next);
    }
  });
  notify();
}

export async function deleteRecord(collection: CollectionName, id: string): Promise<void> {
  await db.transaction('rw', [db.coll(collection), db.outbox, db.syncState], async () => {
    await db.coll(collection).delete(id);
    await enqueue(collection, id, 'delete', null);
  });
  notify();
}

export function createBase(): BaseRecord {
  const ts = nowIso();
  return { id: newId(), createdAt: ts, updatedAt: ts };
}
