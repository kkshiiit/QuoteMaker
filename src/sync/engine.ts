/**
 * Motor de sincronización offline-first.
 *
 * - Push: envía la cola `outbox` en orden. Cada mutación lleva `mutationId` (idempotencia)
 *   y la versión del servidor sobre la que se hizo el cambio (control optimista).
 * - Pull: trae cambios del servidor con un cursor monotónico (`seq`).
 * - Conflictos: si el servidor tiene una versión más nueva que la que conocía este dispositivo,
 *   el registro pasa a estado "conflicto" y se guardan AMBAS versiones. Nunca se descarta un
 *   cambio local en silencio: la persona elige "mantener la mía" o "usar la de la nube".
 * - Reintentos con backoff exponencial ante errores de red. Un solo ciclo a la vez.
 */
import type { CollectionName } from '../domain/types';
import { SYNCED_COLLECTIONS } from '../domain/types';
import { db, type OutboxEntry, type SyncStateEntry } from '../data/db';
import { nowIso } from '../data/defaults';

export type PushResult =
  | { status: 'applied' | 'duplicate'; version: number }
  | { status: 'conflict'; version: number; payload: unknown; deleted: boolean };

export interface RemoteRow {
  collection: CollectionName;
  recordId: string;
  payload: unknown;
  version: number;
  deleted: boolean;
  seq: number;
}

export interface SyncRemote {
  push(m: { mutationId: string; collection: CollectionName; recordId: string; op: 'upsert' | 'delete'; payload: unknown; baseVersion: number }): Promise<PushResult>;
  pull(sinceSeq: number, limit: number): Promise<RemoteRow[]>;
}

export interface SyncReport {
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: number;
  skipped: boolean;
}

const keyOf = (c: string, id: string) => `${c}:${id}`;
const CURSOR_KEY = 'pullCursor';
const PAGE = 500;

export function backoffMs(attempts: number): number {
  return Math.min(5 * 60_000, 2_000 * 2 ** Math.max(0, attempts - 1));
}

export class SyncEngine {
  private running: Promise<SyncReport> | null = null;
  constructor(private remote: SyncRemote, private now: () => Date = () => new Date()) {}

  /** Ejecuta un ciclo. Si ya hay uno en curso, devuelve el mismo (evita sincronizaciones duplicadas). */
  sync(): Promise<SyncReport> {
    if (!this.running) {
      this.running = this.run().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async run(): Promise<SyncReport> {
    const report: SyncReport = { pushed: 0, pulled: 0, conflicts: 0, errors: 0, skipped: false };
    const pushOk = await this.pushAll(report);
    if (!pushOk) return report;
    await this.pullAll(report);
    return report;
  }

  private async pushAll(report: SyncReport): Promise<boolean> {
    const queue = await db.outbox.orderBy('createdAt').toArray();
    const nowTs = this.now().toISOString();
    for (const m of queue) {
      const key = keyOf(m.collection, m.recordId);
      const state = await db.syncState.get(key);
      if (state?.status === 'conflict') continue; // espera decisión de la persona
      if (m.nextAttemptAt && m.nextAttemptAt > nowTs) continue;
      const baseVersion = state?.version ?? 0;
      await db.outbox.update(m.mutationId, { attempts: m.attempts + 1 });
      let res: PushResult;
      try {
        res = await this.remote.push({ mutationId: m.mutationId, collection: m.collection, recordId: m.recordId, op: m.op, payload: m.payload, baseVersion });
      } catch (err) {
        const attempts = m.attempts + 1;
        const message = err instanceof Error ? err.message : String(err);
        await db.outbox.update(m.mutationId, { lastError: message, nextAttemptAt: new Date(this.now().getTime() + backoffMs(attempts)).toISOString() });
        await this.setState(m, { status: 'error', error: message });
        report.errors++;
        return false; // probablemente sin conexión: se reintenta en el próximo ciclo
      }
      if (res.status === 'conflict') {
        await this.setState(m, { status: 'conflict', remotePayload: res.payload, remoteDeleted: res.deleted, error: null, version: state?.version ?? 0, conflictServerVersion: res.version });
        report.conflicts++;
        continue;
      }
      await db.transaction('rw', db.outbox, db.syncState, async () => {
        await db.outbox.delete(m.mutationId);
        const more = await db.outbox.where('[collection+recordId]').equals([m.collection, m.recordId]).count();
        await this.setState(m, { status: more > 0 ? 'pending' : 'synced', version: res.version, error: null, lastSyncedAt: nowIso(), remotePayload: null, remoteDeleted: false });
      });
      report.pushed++;
    }
    return true;
  }

  private async pullAll(report: SyncReport) {
    let cursor = Number((await db.meta.get(CURSOR_KEY))?.value ?? 0);
    for (;;) {
      let rows: RemoteRow[];
      try {
        rows = await this.remote.pull(cursor, PAGE);
      } catch {
        report.errors++;
        return;
      }
      for (const row of rows) {
        if (!SYNCED_COLLECTIONS.includes(row.collection)) continue;
        await this.applyRemote(row, report);
        cursor = Math.max(cursor, row.seq);
      }
      await db.meta.put({ key: CURSOR_KEY, value: cursor });
      if (rows.length < PAGE) return;
    }
  }

  private async applyRemote(row: RemoteRow, report: SyncReport) {
    const key = keyOf(row.collection, row.recordId);
    const table = db.coll<{ id: string }>(row.collection);
    await db.transaction('rw', [table, db.syncState, db.outbox], async () => {
      const state = await db.syncState.get(key);
      if (state && state.version >= row.version) return; // ya lo tenemos (p. ej. nuestro propio push)
      const pending = await db.outbox.where('[collection+recordId]').equals([row.collection, row.recordId]).count();
      if (pending > 0) {
        // Cambio local sin subir + cambio remoto más nuevo → conflicto explícito.
        await db.syncState.put({
          key,
          collection: row.collection,
          recordId: row.recordId,
          status: 'conflict',
          version: state?.version ?? 0,
          lastSyncedAt: state?.lastSyncedAt ?? null,
          error: null,
          remotePayload: row.payload,
          remoteDeleted: row.deleted,
          conflictServerVersion: row.version,
        } as SyncStateEntry);
        if (state?.status !== 'conflict') report.conflicts++;
        return;
      }
      if (row.deleted) await table.delete(row.recordId);
      else await table.put(row.payload as { id: string });
      await db.syncState.put({ key, collection: row.collection, recordId: row.recordId, status: 'synced', version: row.version, lastSyncedAt: nowIso(), error: null, remotePayload: null, remoteDeleted: false });
      report.pulled++;
    });
  }

  private async setState(m: OutboxEntry, patch: Partial<SyncStateEntry> & { conflictServerVersion?: number }) {
    const key = keyOf(m.collection, m.recordId);
    const prev = await db.syncState.get(key);
    await db.syncState.put({
      key,
      collection: m.collection,
      recordId: m.recordId,
      status: 'pending',
      version: 0,
      lastSyncedAt: null,
      error: null,
      remotePayload: null,
      remoteDeleted: false,
      ...prev,
      ...patch,
    } as SyncStateEntry);
  }
}

/**
 * Resolución explícita de un conflicto.
 *  - 'local': se conserva la versión del dispositivo; se volverá a subir sobre la versión del servidor.
 *  - 'remote': se adopta la versión de la nube y se descartan los cambios locales de ESE registro
 *    (decisión tomada por la persona, nunca automática).
 */
export async function resolveConflict(key: string, choice: 'local' | 'remote'): Promise<void> {
  const state = (await db.syncState.get(key)) as (SyncStateEntry & { conflictServerVersion?: number }) | undefined;
  if (!state || state.status !== 'conflict') return;
  const serverVersion = state.conflictServerVersion ?? state.version;
  const table = db.coll<{ id: string }>(state.collection);
  await db.transaction('rw', [table, db.syncState, db.outbox], async () => {
    if (choice === 'local') {
      const outbox = await db.outbox.where('[collection+recordId]').equals([state.collection, state.recordId]).count();
      if (outbox === 0) {
        const local = await table.get(state.recordId);
        await db.outbox.add({
          mutationId: crypto.randomUUID(),
          collection: state.collection,
          recordId: state.recordId,
          op: local ? 'upsert' : 'delete',
          payload: local ?? null,
          baseVersion: serverVersion,
          createdAt: nowIso(),
          attempts: 0,
          lastError: null,
          nextAttemptAt: null,
        });
      }
      await db.syncState.put({ ...state, status: 'pending', version: serverVersion, remotePayload: null, remoteDeleted: false, error: null, conflictServerVersion: undefined } as SyncStateEntry);
    } else {
      if (state.remoteDeleted || state.remotePayload === null) await table.delete(state.recordId);
      else await table.put(state.remotePayload as { id: string });
      await db.outbox.where('[collection+recordId]').equals([state.collection, state.recordId]).delete();
      await db.syncState.put({ ...state, status: 'synced', version: serverVersion, remotePayload: null, remoteDeleted: false, error: null, lastSyncedAt: nowIso(), conflictServerVersion: undefined } as SyncStateEntry);
    }
  });
}

/** Al activar la nube por primera vez, encola todo lo que sólo existía localmente. */
export async function enqueueLocalOnly(): Promise<number> {
  let n = 0;
  for (const c of SYNCED_COLLECTIONS) {
    const table = db.coll<{ id: string }>(c);
    const rows = await table.toArray();
    await db.transaction('rw', [db.outbox, db.syncState], async () => {
      for (const r of rows) {
        const key = keyOf(c, r.id);
        const st = await db.syncState.get(key);
        if (st && st.status !== 'local') continue;
        const exists = await db.outbox.where('[collection+recordId]').equals([c, r.id]).count();
        if (!exists) {
          await db.outbox.add({ mutationId: crypto.randomUUID(), collection: c, recordId: r.id, op: 'upsert', payload: r, baseVersion: 0, createdAt: nowIso(), attempts: 0, lastError: null, nextAttemptAt: null });
        }
        await db.syncState.put({ key, collection: c, recordId: r.id, status: 'pending', version: st?.version ?? 0, lastSyncedAt: null, error: null, remotePayload: null, remoteDeleted: false });
        n++;
      }
    });
  }
  return n;
}

export async function syncCounts() {
  const all = await db.syncState.toArray();
  const by = { local: 0, pending: 0, synced: 0, error: 0, conflict: 0 };
  for (const s of all) by[s.status]++;
  return { ...by, outbox: await db.outbox.count() };
}
