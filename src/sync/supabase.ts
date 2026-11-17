/**
 * Adaptador Supabase (opcional). Sólo se activa si existen VITE_SUPABASE_URL y
 * VITE_SUPABASE_ANON_KEY. Se carga con import dinámico para no sumar peso cuando no se usa.
 *
 * Usa únicamente la clave pública "anon" + la sesión del usuario: las políticas RLS
 * (supabase/migrations) garantizan que cada cuenta sólo vea y modifique sus propios datos.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CollectionName } from '../domain/types';
import type { PushResult, RemoteRow, SyncRemote } from './engine';

export interface CloudConfig {
  url: string;
  anonKey: string;
}

export function readCloudConfig(env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>): CloudConfig | null {
  const url = (env.VITE_SUPABASE_URL ?? '').trim();
  const anonKey = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  if (!url || !anonKey) return null;
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(url)) return null;
  return { url: url.replace(/\/$/, ''), anonKey };
}

let clientPromise: Promise<SupabaseClient> | null = null;

export function getClient(cfg: CloudConfig): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'quotemaker-auth' } }),
    );
  }
  return clientPromise;
}

export class SupabaseRemote implements SyncRemote {
  constructor(private client: SupabaseClient) {}

  async push(m: { mutationId: string; collection: CollectionName; recordId: string; op: 'upsert' | 'delete'; payload: unknown; baseVersion: number }): Promise<PushResult> {
    const { data, error } = await this.client.rpc('qm_push', {
      p_mutation_id: m.mutationId,
      p_collection: m.collection,
      p_record_id: m.recordId,
      p_op: m.op,
      p_payload: m.payload,
      p_base_version: m.baseVersion,
    });
    if (error) throw new Error(error.message);
    return data as PushResult;
  }

  async pull(sinceSeq: number, limit: number): Promise<RemoteRow[]> {
    const { data, error } = await this.client
      .from('qm_records')
      .select('collection, record_id, payload, version, deleted, seq')
      .gt('seq', sinceSeq)
      .order('seq', { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      collection: r.collection as CollectionName,
      recordId: r.record_id as string,
      payload: r.payload,
      version: Number(r.version),
      deleted: Boolean(r.deleted),
      seq: Number(r.seq),
    }));
  }
}
