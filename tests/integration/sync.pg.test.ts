// @vitest-environment node
/**
 * Pruebas de integración REALES contra PostgreSQL:
 *  - aplica la migración de supabase/migrations sobre una base limpia (dos veces: idempotencia),
 *  - verifica RLS con dos usuarios distintos y con el rol anónimo, ejecutando como lo hace
 *    PostgREST/Supabase (SET ROLE authenticated + request.jwt.claims),
 *  - ejecuta el motor de sincronización completo con dos dispositivos (dos IndexedDB).
 *
 * Requiere un Postgres accesible en QM_PG_URL (por defecto postgres://postgres:postgres@localhost:5432/postgres).
 * Si no hay Postgres, las pruebas se SALTEAN (y se informa), nunca se simulan.
 */
import 'fake-indexeddb/auto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDatabase, db } from '../../src/data/db';
import { putRecord, setCloudActive } from '../../src/data/repo';
import { SyncEngine, resolveConflict, enqueueLocalOnly, type PushResult, type RemoteRow, type SyncRemote } from '../../src/sync/engine';
import type { CollectionName, Product } from '../../src/domain/types';
import { emptyProduct } from '../../src/data/services';

const ADMIN_URL = process.env.QM_PG_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DB = 'quotemaker_it';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

let available = false;
let pool: pg.Pool;

async function canConnect() {
  const c = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
}

const root = join(__dirname, '..', '..');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();

async function applyMigrations(client: pg.Client | pg.PoolClient) {
  for (const f of migrations) await client.query(readFileSync(join(root, 'supabase/migrations', f), 'utf8'));
}

/** Ejecuta `fn` como lo haría PostgREST para un JWT con `sub = userId` (o como anon). */
async function asUser<T>(userId: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${userId ? 'authenticated' : 'anon'}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' })]);
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

/** Remoto que llama a la MISMA función SQL y tabla que usa SupabaseRemote, con la identidad del usuario. */
class PgRemote implements SyncRemote {
  failNext = 0;
  constructor(private userId: string) {}
  async push(m: { mutationId: string; collection: CollectionName; recordId: string; op: 'upsert' | 'delete'; payload: unknown; baseVersion: number }): Promise<PushResult> {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('fetch failed (sin conexión)');
    }
    return asUser(this.userId, async (c) => {
      const r = await c.query('select public.qm_push($1,$2,$3,$4,$5,$6) as res', [m.mutationId, m.collection, m.recordId, m.op, m.payload === null ? null : JSON.stringify(m.payload), m.baseVersion]);
      return r.rows[0].res as PushResult;
    });
  }
  async pull(sinceSeq: number, limit: number): Promise<RemoteRow[]> {
    return asUser(this.userId, async (c) => {
      const r = await c.query('select collection, record_id, payload, version, deleted, seq from public.qm_records where seq > $1 order by seq limit $2', [sinceSeq, limit]);
      return r.rows.map((x) => ({ collection: x.collection, recordId: x.record_id, payload: x.payload, version: Number(x.version), deleted: x.deleted, seq: Number(x.seq) }));
    });
  }
}

beforeAll(async () => {
  available = await canConnect();
  if (!available) {
    console.warn(`[sync.pg] Postgres no disponible en ${ADMIN_URL}: pruebas de integración SALTEADAS.`);
    return;
  }
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${TEST_DB} with (force)`);
  await admin.query(`create database ${TEST_DB}`);
  await admin.end();
  const url = new URL(ADMIN_URL);
  url.pathname = `/${TEST_DB}`;
  pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
  const c = await pool.connect();
  await c.query(readFileSync(join(__dirname, 'supabase-local-stub.sql'), 'utf8'));
  await applyMigrations(c);
  await applyMigrations(c); // re-ejecutable
  await c.query('insert into auth.users (id, email) values ($1, $2), ($3, $4)', [USER_A, 'a@test.local', USER_B, 'b@test.local']);
  c.release();
}, 30_000);

afterAll(async () => {
  await pool?.end();
});

const payload = (id: string, name: string) => ({ id, name, updatedAt: '2026-01-01T00:00:00Z' });

describe.runIf(process.env.QM_SKIP_PG !== '1')('Supabase: migración y RLS (Postgres real)', () => {
  it('Postgres disponible para la prueba', () => {
    expect(available, 'Postgres no disponible: iniciar con `service postgresql start`').toBe(true);
  });

  it('push idempotente: la misma mutación dos veces no duplica', async () => {
    const mid = '00000000-0000-4000-8000-000000000001';
    const r1 = await asUser(USER_A, (c) => c.query(`select qm_push($1,'products','p1','upsert',$2,0) r`, [mid, JSON.stringify(payload('p1', 'Mesa'))]));
    const r2 = await asUser(USER_A, (c) => c.query(`select qm_push($1,'products','p1','upsert',$2,0) r`, [mid, JSON.stringify(payload('p1', 'Mesa'))]));
    expect(r1.rows[0].r).toEqual({ status: 'applied', version: 1 });
    expect(r2.rows[0].r).toEqual({ status: 'duplicate', version: 1 });
  });

  it('control optimista: versión base desactualizada → conflicto con la copia del servidor', async () => {
    await asUser(USER_A, (c) => c.query(`select qm_push(gen_random_uuid(),'products','p1','upsert',$1,1)`, [JSON.stringify(payload('p1', 'Mesa v2'))]));
    const r = await asUser(USER_A, (c) => c.query(`select qm_push(gen_random_uuid(),'products','p1','upsert',$1,1) r`, [JSON.stringify(payload('p1', 'Mesa vieja'))]));
    expect(r.rows[0].r.status).toBe('conflict');
    expect(r.rows[0].r.version).toBe(2);
    expect(r.rows[0].r.payload.name).toBe('Mesa v2');
  });

  it('RLS: el usuario B no ve ni modifica datos del usuario A', async () => {
    const seen = await asUser(USER_B, (c) => c.query('select * from qm_records'));
    expect(seen.rowCount).toBe(0);
    const upd = await asUser(USER_B, (c) => c.query(`update qm_records set payload = '{"id":"p1","name":"hackeado"}' where record_id = 'p1'`));
    expect(upd.rowCount).toBe(0);
    await expect(
      asUser(USER_B, (c) => c.query(`insert into qm_records (user_id, collection, record_id, payload) values ($1,'products','x',$2)`, [USER_A, JSON.stringify(payload('x', 'intruso'))])),
    ).rejects.toThrow(/row-level security/);
    // Mismo record_id en B crea un registro propio e independiente (sin IDOR)
    const own = await asUser(USER_B, (c) => c.query(`select qm_push(gen_random_uuid(),'products','p1','upsert',$1,0) r`, [JSON.stringify(payload('p1', 'Mesa de B'))]));
    expect(own.rows[0].r).toEqual({ status: 'applied', version: 1 });
    const a = await asUser(USER_A, (c) => c.query(`select payload->>'name' n from qm_records where record_id='p1'`));
    expect(a.rows).toEqual([{ n: 'Mesa v2' }]);
    const bMut = await asUser(USER_B, (c) => c.query('select count(*)::int n from qm_mutations'));
    const aMut = await asUser(USER_A, (c) => c.query('select count(*)::int n from qm_mutations'));
    expect(bMut.rows[0].n).toBe(1);
    expect(aMut.rows[0].n).toBe(2);
  });

  it('RLS: el rol anónimo no tiene acceso y qm_push exige autenticación', async () => {
    await expect(asUser(null, (c) => c.query('select * from qm_records'))).rejects.toThrow(/permission denied/);
    await expect(asUser(null, (c) => c.query(`select qm_push(gen_random_uuid(),'products','z','upsert','{"id":"z"}',0)`))).rejects.toThrow(/permission denied/);
    // authenticated sin sub
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query('set local role authenticated');
      await expect(c.query(`select qm_push(gen_random_uuid(),'products','z','upsert','{"id":"z"}',0)`)).rejects.toThrow(/autenticación requerida/);
    } finally {
      await c.query('rollback');
      c.release();
    }
  });

  it('nadie puede borrar físicamente (sólo lápidas) y se validan payloads', async () => {
    const del = await asUser(USER_A, (c) => c.query('delete from qm_records').catch((e: Error) => ({ rowCount: -1, e })));
    expect(del.rowCount === 0 || del.rowCount === -1).toBe(true);
    await expect(asUser(USER_A, (c) => c.query(`select qm_push(gen_random_uuid(),'products','p9','upsert','{"id":"OTRO"}',0)`))).rejects.toThrow(/inconsistente/);
    await expect(asUser(USER_A, (c) => c.query(`select qm_push(gen_random_uuid(),'hackers','p9','upsert','{"id":"p9"}',0)`))).rejects.toThrow(/collection_chk/);
    // Migración 0002: el historial de ventas se sincroniza (y sigue aislado por RLS)
    const sold = await asUser(USER_A, (c) => c.query(`select qm_push(gen_random_uuid(),'sales','v1','upsert','{"id":"v1","number":"V-00001"}',0) r`));
    expect(sold.rows[0].r.status).toBe('applied');
    const seenByB = await asUser(USER_B, (c) => c.query(`select * from qm_records where collection = 'sales'`));
    expect(seenByB.rowCount).toBe(0);
    // Migración 0003: movimientos de stock
    const moved = await asUser(USER_A, (c) => c.query(`select qm_push(gen_random_uuid(),'stockMoves','m1','upsert','{"id":"m1","productId":"p1","variantId":"","qty":"5","kind":"in"}',0) r`));
    expect(moved.rows[0].r.status).toBe('applied');
    const movesB = await asUser(USER_B, (c) => c.query(`select * from qm_records where collection = 'stockMoves'`));
    expect(movesB.rowCount).toBe(0);
  });
});

describe.runIf(process.env.QM_SKIP_PG !== '1')('Motor de sincronización: dos dispositivos, offline, conflictos', () => {
  const product = (name: string): Product => ({ ...emptyProduct(), name });

  it('sube, baja, detecta conflicto, lo resuelve sin perder datos y reintenta tras error de red', async () => {
    expect(available).toBe(true);
    const USER = '33333333-3333-4333-8333-333333333333';
    await pool.query('insert into auth.users (id) values ($1)', [USER]);
    const remote1 = new PgRemote(USER);
    const remote2 = new PgRemote(USER);
    const dev1 = () => openTestDatabase('device-1');
    const dev2 = () => openTestDatabase('device-2');

    // Dispositivo 1 trabaja offline (nube no configurada) y luego activa la nube
    dev1();
    setCloudActive(false);
    const p = await putRecord('products', product('Lámpara'));
    expect((await db.syncState.get(`products:${p.id}`))!.status).toBe('local');
    setCloudActive(true);
    expect(await enqueueLocalOnly()).toBe(1);
    const r1 = await new SyncEngine(remote1).sync();
    expect(r1).toMatchObject({ pushed: 1, errors: 0 });
    expect((await db.syncState.get(`products:${p.id}`))!.status).toBe('synced');

    // Dispositivo 2 baja el producto
    dev2();
    const r2 = await new SyncEngine(remote2).sync();
    expect(r2.pulled).toBe(1);
    expect((await db.products.get(p.id))!.name).toBe('Lámpara');

    // Ambos editan offline el mismo registro
    await putRecord('products', { ...(await db.products.get(p.id))!, name: 'Lámpara (dev2)' });
    dev1();
    await putRecord('products', { ...(await db.products.get(p.id))!, name: 'Lámpara (dev1)' });
    await new SyncEngine(remote1).sync(); // dev1 gana la carrera

    dev2();
    const r3 = await new SyncEngine(remote2).sync();
    expect(r3.conflicts).toBe(1);
    const st = (await db.syncState.get(`products:${p.id}`))!;
    expect(st.status).toBe('conflict');
    expect((st.remotePayload as Product).name).toBe('Lámpara (dev1)');
    expect((await db.products.get(p.id))!.name).toBe('Lámpara (dev2)'); // el cambio local NO se descartó

    // La persona elige conservar la versión local
    await resolveConflict(`products:${p.id}`, 'local');
    const r4 = await new SyncEngine(remote2).sync();
    expect(r4).toMatchObject({ pushed: 1, conflicts: 0 });

    // Error de red: queda en error con backoff y la cola intacta; luego se recupera
    await putRecord('products', { ...(await db.products.get(p.id))!, name: 'Lámpara final' });
    remote2.failNext = 1;
    const r5 = await new SyncEngine(remote2).sync();
    expect(r5.errors).toBe(1);
    expect(await db.outbox.count()).toBe(1);
    expect((await db.syncState.get(`products:${p.id}`))!.status).toBe('error');
    const later = new SyncEngine(remote2, () => new Date(Date.now() + 10 * 60_000));
    const r6 = await later.sync();
    expect(r6.pushed).toBe(1);
    expect(await db.outbox.count()).toBe(0);

    // Dispositivo 1 recibe el resultado final
    dev1();
    await new SyncEngine(remote1).sync();
    expect((await db.products.get(p.id))!.name).toBe('Lámpara final');

    // Borrado propagado como lápida
    const { deleteRecord } = await import('../../src/data/repo');
    await deleteRecord('products', p.id);
    await new SyncEngine(remote1).sync();
    dev2();
    await new SyncEngine(remote2).sync();
    expect(await db.products.get(p.id)).toBeUndefined();
  });

  it('ciclos concurrentes no duplican envíos', async () => {
    const USER = '44444444-4444-4444-8444-444444444444';
    await pool.query('insert into auth.users (id) values ($1)', [USER]);
    openTestDatabase('device-3');
    setCloudActive(true);
    for (let i = 0; i < 5; i++) await putRecord('products', product(`P${i}`));
    const engine = new SyncEngine(new PgRemote(USER));
    const [a, b] = await Promise.all([engine.sync(), engine.sync()]);
    expect(a).toBe(b);
    expect(a.pushed).toBe(5);
    const n = await pool.query('select count(*)::int n from qm_records where user_id = $1', [USER]);
    expect(n.rows[0].n).toBe(5);
  });
});
