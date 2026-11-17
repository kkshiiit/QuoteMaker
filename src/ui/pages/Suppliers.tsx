import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { putRecord } from '../../data/repo';
import { emptySupplier, validateContact } from '../../data/services';
import { purchaseTotals } from '../../domain/costing';
import type { Supplier } from '../../domain/types';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorSummary, InternalLabel, PageHeader, TextField, useToast } from '../components/ui';
import { useMoney, useSettings } from '../hooks';
import { toDec } from '../../domain/money';

export default function Suppliers() {
  const { id } = useParams();
  return id ? <SupplierDetail id={id} /> : <SupplierList />;
}

function SupplierList() {
  const [showArchived, setShowArchived] = useState(false);
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []);
  const list = (suppliers ?? []).filter((s) => s.archived === showArchived).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return (
    <>
      <PageHeader
        title="Proveedores"
        subtitle={<InternalLabel text="Información interna" />}
        actions={
          <Link className="btn btn-primary" to="/proveedores/nuevo">
            <Icon name="plus" />
            Nuevo proveedor
          </Link>
        }
      />
      {suppliers && suppliers.length === 0 ? (
        <EmptyState icon="truck" title="Sin proveedores" text="Asociá tus compras a proveedores para ver el historial de cada uno." />
      ) : (
        <>
          <label className="check" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Ver archivados
          </label>
          <ul className="list">
            {list.length === 0 && <li className="list-item muted">Sin resultados.</li>}
            {list.map((s) => (
              <li key={s.id}>
                <Link className="list-item" to={`/proveedores/${s.id}`}>
                  <div className="grow">
                    <div className="title">{s.name}</div>
                    <div className="sub">{[s.contactName, s.phone, s.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function SupplierDetail({ id }: { id: string }) {
  const isNew = id === 'nuevo';
  const navigate = useNavigate();
  const toast = useToast();
  const money = useMoney();
  const settings = useSettings();
  const stored = useLiveQuery(async () => (isNew ? null : ((await db.suppliers.get(id)) ?? null)), [id]);
  const purchases = useLiveQuery(() => (isNew ? [] : db.purchases.where('supplierId').equals(id).reverse().sortBy('date')), [id]);
  const [form, setForm] = useState<Supplier | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    if (isNew && !form) setForm(emptySupplier());
    else if (stored && (!form || form.id !== stored.id)) setForm(stored);
  }, [isNew, stored, form]);
  if (stored === null && !isNew) return <PageHeader title="Proveedor no encontrado" back={{ to: '/proveedores', label: 'Proveedores' }} />;
  if (!form) return <p role="status">Cargando…</p>;
  const set = <K extends keyof Supplier>(k: K, v: Supplier[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const onSave = async () => {
    const errs = validateContact(form, 'proveedor');
    const all = await db.suppliers.toArray();
    if (all.some((s) => s.id !== form.id && !s.archived && s.name.trim().toLocaleLowerCase('es') === form.name.trim().toLocaleLowerCase('es'))) errs.push('Ya existe un proveedor con ese nombre.');
    setErrors(errs);
    if (errs.length) return;
    const saved = await putRecord('suppliers', { ...form, name: form.name.trim() });
    toast('Proveedor guardado');
    if (isNew) navigate(`/proveedores/${saved.id}`, { replace: true });
    else setForm(saved);
  };
  return (
    <>
      <PageHeader title={isNew ? 'Nuevo proveedor' : form.name} back={{ to: '/proveedores', label: 'Proveedores' }} subtitle={<InternalLabel />} />
      <ErrorSummary errors={errors} />
      <div className="grid grid-main-aside">
        <form
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
        >
          <section className="card">
            <div className="form-grid cols-2">
              <TextField className="span-all" label="Nombre" required value={form.name} onChange={(v) => set('name', v)} />
              <TextField label="Persona de contacto" value={form.contactName} onChange={(v) => set('contactName', v)} />
              <TextField label="Teléfono" type="tel" inputMode="tel" value={form.phone} onChange={(v) => set('phone', v)} />
              <TextField label="Email" type="email" inputMode="email" value={form.email} onChange={(v) => set('email', v)} />
              <TextField label="Dirección" value={form.address} onChange={(v) => set('address', v)} />
              <TextField className="span-all" label="Notas privadas" multiline value={form.notes} onChange={(v) => set('notes', v)} />
            </div>
          </section>
          <div className="sticky-actions actions">
            <button className="btn btn-primary" type="submit">
              <Icon name="check" />
              Guardar proveedor
            </button>
            {!isNew && (
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const saved = await putRecord('suppliers', { ...form, archived: !form.archived });
                  setForm(saved);
                  toast(saved.archived ? 'Proveedor archivado' : 'Proveedor restaurado');
                }}
              >
                {form.archived ? 'Restaurar' : 'Archivar'}
              </button>
            )}
          </div>
        </form>
        {!isNew && (
          <aside className="card">
            <h2>Compras</h2>
            {purchases && purchases.length ? (
              <ul className="list">
                {purchases.map((p) => (
                  <li key={p.id}>
                    <Link className="list-item" to={`/costos/compras/${p.id}`}>
                      <span className="grow">{new Date(`${p.date}T12:00:00`).toLocaleDateString('es-AR')}</span>
                      <span className="num">{p.currency && p.currency !== settings.currency ? `${p.currency} ${toDec(purchaseTotals(p).total)}` : money(purchaseTotals(p).total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Sin compras registradas.</p>
            )}
          </aside>
        )}
      </div>
    </>
  );
}
