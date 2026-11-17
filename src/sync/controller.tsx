/**
 * Controlador de sincronización para la UI. Si no hay configuración cloud, expone
 * estado "no configurada" y no hace NINGUNA llamada de red.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { onLocalChange, setCloudActive } from '../data/repo';
import { enqueueLocalOnly, SyncEngine, type SyncReport } from './engine';
import { getClient, readCloudConfig, SupabaseRemote } from './supabase';

export interface SyncContextValue {
  configured: boolean;
  userEmail: string | null;
  syncing: boolean;
  lastReport: SyncReport | null;
  lastSyncAt: string | null;
  lastError: string | null;
  online: boolean;
  counts: { local: number; pending: number; synced: number; error: number; conflict: number };
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const Ctx = createContext<SyncContextValue | null>(null);

export function useSync(): SyncContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('SyncProvider ausente');
  return v;
}

const AUTO_INTERVAL = 5 * 60_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const cfg = useMemo(() => readCloudConfig(), []);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastReport, setLastReport] = useState<SyncReport | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const engine = useRef<SyncEngine | null>(null);

  const states = useLiveQuery(() => db.syncState.toArray(), []);
  const counts = useMemo(() => {
    const c = { local: 0, pending: 0, synced: 0, error: 0, conflict: 0 };
    for (const s of states ?? []) c[s.status]++;
    return c;
  }, [states]);

  const runSync = useCallback(async () => {
    if (!engine.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLastError('Sin conexión: los cambios quedan guardados en el dispositivo.');
      return;
    }
    setSyncing(true);
    try {
      const r = await engine.current.sync();
      setLastReport(r);
      setLastSyncAt(new Date().toISOString());
      setLastError(r.errors ? 'No se pudo completar la sincronización. Se reintentará automáticamente.' : null);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }, []);

  // Sesión
  useEffect(() => {
    if (!cfg) {
      setCloudActive(false);
      return;
    }
    let unsub: (() => void) | undefined;
    void getClient(cfg).then(async (client) => {
      const activate = async (email: string | null) => {
        setUserEmail(email);
        if (email) {
          const owner = (await db.meta.get('cloudOwner'))?.value as string | undefined;
          if (owner && owner !== email) {
            setCloudActive(false);
            engine.current = null;
            setLastError(`Este dispositivo ya está vinculado a ${owner}. Para usar otra cuenta, exportá un respaldo y restablecé los datos locales.`);
            return;
          }
          await db.meta.put({ key: 'cloudOwner', value: email });
          setCloudActive(true);
          engine.current = new SyncEngine(new SupabaseRemote(client));
          await enqueueLocalOnly();
          void runSync();
        } else {
          setCloudActive(false);
          engine.current = null;
        }
      };
      const { data } = await client.auth.getSession();
      await activate(data.session?.user.email ?? null);
      const sub = client.auth.onAuthStateChange((_ev, session) => {
        void activate(session?.user.email ?? null);
      });
      unsub = () => sub.data.subscription.unsubscribe();
    });
    return () => unsub?.();
  }, [cfg, runSync]);

  // Disparadores: online, visibilidad, intervalo y cambios locales (con espera)
  useEffect(() => {
    const on = () => {
      setOnline(true);
      void runSync();
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const vis = () => document.visibilityState === 'visible' && void runSync();
    document.addEventListener('visibilitychange', vis);
    const iv = window.setInterval(() => document.visibilityState === 'visible' && void runSync(), AUTO_INTERVAL);
    let t: number | undefined;
    const unsub = onLocalChange(() => {
      window.clearTimeout(t);
      t = window.setTimeout(() => void runSync(), 4000);
    });
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      document.removeEventListener('visibilitychange', vis);
      window.clearInterval(iv);
      window.clearTimeout(t);
      unsub();
    };
  }, [runSync]);

  const value: SyncContextValue = {
    configured: !!cfg,
    userEmail,
    syncing,
    lastReport,
    lastSyncAt,
    lastError,
    online,
    counts,
    syncNow: runSync,
    signIn: async (email, password) => {
      if (!cfg) return 'La nube no está configurada.';
      const client = await getClient(cfg);
      const { error } = await client.auth.signInWithPassword({ email, password });
      return error ? error.message : null;
    },
    signUp: async (email, password) => {
      if (!cfg) return 'La nube no está configurada.';
      const client = await getClient(cfg);
      const { error } = await client.auth.signUp({ email, password });
      return error ? error.message : null;
    },
    signOut: async () => {
      if (!cfg) return;
      const client = await getClient(cfg);
      await client.auth.signOut();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
