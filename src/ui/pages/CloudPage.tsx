import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../../data/db';
import { resolveConflict } from '../../sync/engine';
import { useSync } from '../../sync/controller';
import { Icon } from '../components/Icon';
import { ErrorSummary, PageHeader, TextField, useToast } from '../components/ui';

const COLL_LABEL: Record<string, string> = {
  settings: 'Configuración',
  categories: 'Categoría',
  suppliers: 'Proveedor',
  products: 'Producto',
  costHistory: 'Historial de costo',
  purchases: 'Compra',
  expenses: 'Gasto',
  overheads: 'Gasto general',
  customers: 'Cliente',
  quotes: 'Presupuesto',
  quoteDocuments: 'Documento',
};

function label(payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  return String(p.name ?? p.number ?? p.description ?? p.reference ?? p.id ?? '');
}

export default function CloudPage() {
  const s = useSync();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const conflicts = useLiveQuery(() => db.syncState.where('status').equals('conflict').toArray(), []);
  const localRecords = useLiveQuery(async () => {
    const out: Record<string, unknown> = {};
    for (const c of conflicts ?? []) out[c.key] = await db.coll(c.collection).get(c.recordId);
    return out;
  }, [conflicts]);

  const auth = async (kind: 'in' | 'up') => {
    const e: string[] = [];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.push('Ingresá un email válido.');
    if (password.length < 8) e.push('La contraseña debe tener al menos 8 caracteres.');
    setErrors(e);
    if (e.length) return;
    setBusy(true);
    const err = kind === 'in' ? await s.signIn(email, password) : await s.signUp(email, password);
    setBusy(false);
    if (err) setErrors([err]);
    else toast(kind === 'in' ? 'Sesión iniciada' : 'Cuenta creada. Si tu proyecto exige confirmación, revisá tu email.');
  };

  return (
    <>
      <PageHeader title="Sincronización" subtitle="Tus datos viven en este dispositivo. La nube es opcional." />
      <section className="card" aria-labelledby="st">
        <h2 id="st">Estado</h2>
        {!s.configured ? (
          <>
            <p>
              <span className="badge">
                <Icon name="cloud" />
                Nube no configurada
              </span>
            </p>
            <p className="muted" style={{ marginTop: 10 }}>
              Chediek Home funciona completo sin conexión y guarda todo en este dispositivo. Para sincronizar entre dispositivos hace falta un proyecto Supabase (plan gratuito) y compilar la app con sus
              credenciales públicas. Ver <code>docs/INSTALLATION.md</code> § Supabase.
            </p>
            <p className="small muted" style={{ marginTop: 8 }}>
              {s.counts.local} registro(s) guardados sólo en este dispositivo. Exportá respaldos periódicamente.
            </p>
          </>
        ) : !s.userEmail ? (
          <p className="muted">Iniciá sesión para sincronizar. Los datos locales se suben al vincular la cuenta.</p>
        ) : (
          <>
            <dl className="dl">
              <dt>Cuenta</dt>
              <dd>{s.userEmail}</dd>
              <dt>Conexión</dt>
              <dd>{s.online ? 'En línea' : 'Sin conexión'}</dd>
              <dt>Sincronizados</dt>
              <dd>{s.counts.synced}</dd>
              <dt>Pendientes</dt>
              <dd>{s.counts.pending}</dd>
              <dt>Con error</dt>
              <dd>{s.counts.error}</dd>
              <dt>Conflictos</dt>
              <dd>{s.counts.conflict}</dd>
              <dt>Última sincronización</dt>
              <dd>{s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString('es-AR') : 'Nunca en esta sesión'}</dd>
            </dl>
            {s.lastError && (
              <p className="warn-text small" role="status" style={{ marginTop: 8 }}>
                {s.lastError}
              </p>
            )}
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => s.syncNow()} disabled={s.syncing}>
                <Icon name="refresh" />
                {s.syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
              </button>
              <button className="btn" onClick={() => s.signOut()}>
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </section>

      {s.configured && !s.userEmail && (
        <section className="card" aria-labelledby="login">
          <h2 id="login">Tu cuenta</h2>
          <ErrorSummary errors={errors} />
          <form
            className="form-grid cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void auth('in');
            }}
            noValidate
          >
            <TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
            <TextField label="Contraseña" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
            <div className="actions span-all">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                Iniciar sesión
              </button>
              <button className="btn" type="button" onClick={() => auth('up')} disabled={busy}>
                Crear cuenta
              </button>
            </div>
          </form>
          <p className="small muted" style={{ marginTop: 8 }}>
            La cuenta es sólo tuya (el emprendedor). Tus clientes nunca tienen acceso.
          </p>
        </section>
      )}

      {conflicts && conflicts.length > 0 && (
        <section className="card" aria-labelledby="conf">
          <h2 id="conf">Conflictos para resolver</h2>
          <p className="small muted" style={{ marginBottom: 10 }}>
            Estos registros cambiaron en este dispositivo y en otro antes de sincronizar. Nada se descartó: elegí qué versión conservar.
          </p>
          <ul className="list">
            {conflicts.map((c) => (
              <li key={c.key} className="list-item" style={{ flexWrap: 'wrap' }}>
                <div className="grow">
                  <div className="title">
                    {COLL_LABEL[c.collection] ?? c.collection}: {label(localRecords?.[c.key]) || label(c.remotePayload)}
                  </div>
                  <div className="sub">
                    Este dispositivo: {localRecords?.[c.key] ? `editado ${new Date(String((localRecords[c.key] as { updatedAt?: string }).updatedAt)).toLocaleString('es-AR')}` : 'eliminado'} · Nube:{' '}
                    {c.remoteDeleted ? 'eliminado' : `editado ${new Date(String((c.remotePayload as { updatedAt?: string })?.updatedAt)).toLocaleString('es-AR')}`}
                  </div>
                </div>
                <div className="actions">
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      await resolveConflict(c.key, 'local');
                      void s.syncNow();
                    }}
                  >
                    Mantener la mía
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      await resolveConflict(c.key, 'remote');
                    }}
                  >
                    Usar la de la nube
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
