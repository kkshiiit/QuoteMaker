// @vitest-environment node
/**
 * Prueba EN VIVO contra un proyecto Supabase real (no un Postgres local).
 *
 * Usa exactamente el mismo adaptador que la app (SupabaseRemote) y el mismo motor de sync,
 * con la clave pública anon y sesiones reales de Supabase Auth:
 *  - el rol anónimo no lee ni escribe,
 *  - dos dispositivos de la misma cuenta suben, bajan, detectan y resuelven un conflicto y propagan un borrado,
 *  - una segunda cuenta no ve ni puede pisar los datos de la primera (RLS),
 *  - el envío es idempotente.
 *
 * Requiere: QM_SUPABASE_URL y QM_SUPABASE_ANON_KEY (nunca service_role), y que el proyecto
 * tenga aplicada la migración de supabase/migrations y el registro por email sin confirmación
 * obligatoria (o QM_LIVE_EMAIL_A / QM_LIVE_EMAIL_B + QM_LIVE_PASSWORD de cuentas ya confirmadas).
 * Sin esas variables la prueba se SALTEA y lo informa: nunca se simula.
 *
 * Ejecutar: npm run test:live
 */
import 'fake-indexeddb/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { db, openTestDatabase } from '../../src/data/db';
import { deleteRecord, putRecord, setCloudActive } from '../../src/data/repo';
import { emptyProduct } from '../../src/data/services';
import type { Product } from '../../src/domain/types';
import { resolveConflict, SyncEngine } from '../../src/sync/engine';
import { readCloudConfig, SupabaseRemote } from '../../src/sync/supabase';

const cfg = readCloudConfig({ VITE_SUPABASE_URL: process.env.QM_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: process.env.QM_SUPABASE_ANON_KEY });
if (!cfg) console.warn('[supabase.live] Sin QM_SUPABASE_URL / QM_SUPABASE_ANON_KEY: prueba en vivo SALTEADA (no se simula).');

const run = randomUUID().slice(0, 8);
const domain = process.env.QM_LIVE_EMAIL_DOMAIN ?? 'example.com';
const password = process.env.QM_LIVE_PASSWORD ?? `Qm-${randomUUID()}`;
const emailA = process.env.QM_LIVE_EMAIL_A ?? `qm-live-a-${run}@${domain}`;
const emailB = process.env.QM_LIVE_EMAIL_B ?? `qm-live-b-${run}@${domain}`;

const newClient = () => createClient(cfg!.url, cfg!.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

/** Inicia sesión (o crea la cuenta si no existe). Falla con un mensaje claro si el proyecto exige confirmar el email. */
async function session(email: string): Promise<SupabaseClient> {
  const c = newClient();
  const login = await c.auth.signInWithPassword({ email, password });
  if (!login.error) return c;
  const up = await c.auth.signUp({ email, password });
  if (up.error) throw new Error(`No se pudo crear ${email}: ${up.error.message}`);
  if (!up.data.session) throw new Error('El proyecto exige confirmar el email: desactivá «Confirm email» en Authentication o usá QM_LIVE_EMAIL_A/B de cuentas confirmadas.');
  return c;
}

const product = (name: string): Product => ({ ...emptyProduct(), name });

describe.runIf(!!cfg)('Supabase EN VIVO: sync real con RLS', () => {
  let a1: SupabaseClient;
  let a2: SupabaseClient;
  let b: SupabaseClient;

  beforeAll(async () => {
    a1 = await session(emailA);
    a2 = newClient();
    const s = await a2.auth.signInWithPassword({ email: emailA, password });
    if (s.error) throw new Error(s.error.message);
    b = await session(emailB);
  }, 60_000);

  it('el rol anónimo no lee registros ni puede llamar a qm_push', async () => {
    const anon = newClient();
    const { data, error } = await anon.from('qm_records').select('record_id').limit(1);
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    const push = await anon.rpc('qm_push', { p_mutation_id: randomUUID(), p_collection: 'products', p_record_id: 'x', p_op: 'upsert', p_payload: { id: 'x' }, p_base_version: 0 });
    expect(push.error).not.toBeNull();
  });

  it('envío idempotente: la misma mutación dos veces no duplica', async () => {
    const r = new SupabaseRemote(a1);
    const m = { mutationId: randomUUID(), collection: 'products' as const, recordId: `idem-${run}`, op: 'upsert' as const, payload: { id: `idem-${run}`, name: 'Idem', updatedAt: new Date().toISOString() }, baseVersion: 0 };
    expect(await r.push(m)).toEqual({ status: 'applied', version: 1 });
    expect(await r.push(m)).toEqual({ status: 'duplicate', version: 1 });
  });

  it('dos dispositivos: suben, bajan, conflicto explícito, resolución y borrado propagado', async () => {
    const remote1 = new SupabaseRemote(a1);
    const remote2 = new SupabaseRemote(a2);
    const dev1 = () => openTestDatabase(`live-dev1-${run}`);
    const dev2 = () => openTestDatabase(`live-dev2-${run}`);

    dev1();
    setCloudActive(true);
    const p = await putRecord('products', product(`Lámpara ${run}`));
    expect(await new SyncEngine(remote1).sync()).toMatchObject({ errors: 0 });
    expect((await db.syncState.get(`products:${p.id}`))!.status).toBe('synced');

    dev2();
    const r2 = await new SyncEngine(remote2).sync();
    expect(r2.errors).toBe(0);
    expect((await db.products.get(p.id))!.name).toBe(`Lámpara ${run}`);

    await putRecord('products', { ...(await db.products.get(p.id))!, name: 'Lámpara (dev2)' });
    dev1();
    await putRecord('products', { ...(await db.products.get(p.id))!, name: 'Lámpara (dev1)' });
    expect((await new SyncEngine(remote1).sync()).errors).toBe(0);

    dev2();
    const r3 = await new SyncEngine(remote2).sync();
    expect(r3.conflicts).toBe(1);
    const st = (await db.syncState.get(`products:${p.id}`))!;
    expect((st.remotePayload as Product).name).toBe('Lámpara (dev1)');
    expect((await db.products.get(p.id))!.name).toBe('Lámpara (dev2)');
    await resolveConflict(`products:${p.id}`, 'local');
    expect(await new SyncEngine(remote2).sync()).toMatchObject({ conflicts: 0, errors: 0 });

    dev1();
    await new SyncEngine(remote1).sync();
    expect((await db.products.get(p.id))!.name).toBe('Lámpara (dev2)');

    await deleteRecord('products', p.id);
    await new SyncEngine(remote1).sync();
    dev2();
    await new SyncEngine(remote2).sync();
    expect(await db.products.get(p.id)).toBeUndefined();
  }, 120_000);

  it('RLS: la cuenta B no ve ni modifica los datos de la cuenta A', async () => {
    const id = `rls-${run}`;
    await new SupabaseRemote(a1).push({ mutationId: randomUUID(), collection: 'products', recordId: id, op: 'upsert', payload: { id, name: 'Secreto de A', updatedAt: new Date().toISOString() }, baseVersion: 0 });

    const seen = await b.from('qm_records').select('record_id, payload');
    expect(seen.error).toBeNull();
    expect(JSON.stringify(seen.data)).not.toContain('Secreto de A');
    expect(await new SupabaseRemote(b).pull(0, 1000)).toEqual([]);

    const upd = await b.from('qm_records').update({ payload: { id, name: 'pisado' } }).eq('record_id', id).select();
    expect(upd.data ?? []).toEqual([]);
    const del = await b.from('qm_records').delete().eq('record_id', id).select();
    expect(del.data ?? []).toEqual([]);

    const mine = await new SupabaseRemote(a1).pull(0, 1000);
    expect(mine.find((r) => r.recordId === id)?.payload).toMatchObject({ name: 'Secreto de A' });
  }, 60_000);
});
