import { useLiveQuery } from 'dexie-react-hooks';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { matches } from '../search';
import { putRecord } from '../../data/repo';
import { createQuote, emptyCustomer, findDuplicateCustomer, validateContact, deleteCustomer } from '../../data/services';
import { quoteTotals } from '../../domain/quote';
import { computeSaleTotals, saleCounts } from '../../domain/sales';
import { sum, toDec } from '../../domain/money';
import type { Customer } from '../../domain/types';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorSummary, InternalLabel, Menu, PageHeader, StatusBadge, TextField, useConfirm, useToast } from '../components/ui';
import { useMoney } from '../hooks';

export default function Customers() {
  const { id } = useParams();
  return id ? <CustomerDetail id={id} /> : <CustomerList />;
}

function CustomerList() {
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const [showArchived, setShowArchived] = useState(false);
  const customers = useLiveQuery(() => db.customers.toArray(), []);
  const list = useMemo(() => {
    return (customers ?? [])
      .filter((c) => c.archived === showArchived)
      .filter((c) => matches(`${c.name} ${c.phone} ${c.email} ${c.taxId}`, query))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [customers, query, showArchived]);
  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Contactos privados. No tienen cuenta ni acceso a la app."
        actions={
          <Link className="btn btn-primary fab" to="/clientes/nuevo">
            <Icon name="plus" />
            <span className="fab-text">Nuevo cliente</span>
          </Link>
        }
      />
      {customers && customers.length === 0 ? (
        <EmptyState icon="users" title="Sin clientes" text="Guardá los datos de tus clientes para elegirlos rápido al presupuestar. Las notas privadas nunca salen en documentos." />
      ) : (
        <>
          <div className="toolbar" role="search">
            <div className="search field">
              <label htmlFor="csearch" className="sr-only">
                Buscar clientes
              </label>
              <input id="csearch" className="input" type="search" placeholder="Buscar por nombre, teléfono, email o ID fiscal" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <label className="check">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Ver archivados
            </label>
          </div>
          <ul className="list">
            {list.length === 0 && <li className="list-item muted">Sin resultados.</li>}
            {list.map((c) => (
              <li key={c.id}>
                <Link className="list-item" to={`/clientes/${c.id}`}>
                  <span className="thumb" aria-hidden="true">
                    {c.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="grow">
                    <div className="title">{c.name}</div>
                    <div className="sub">{[c.phone, c.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</div>
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

function CustomerDetail({ id }: { id: string }) {
  const isNew = id === 'nuevo';
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const money = useMoney();
  const [confirm, confirmNode] = useConfirm();
  const stored = useLiveQuery(async () => (isNew ? null : ((await db.customers.get(id)) ?? null)), [id]);
  const quotes = useLiveQuery(() => (isNew ? [] : db.quotes.where('customerId').equals(id).reverse().sortBy('issueDate')), [id]);
  const sales = useLiveQuery(() => (isNew ? [] : db.sales.where('customerId').equals(id).reverse().sortBy('date')), [id]);
  const [form, setForm] = useState<Customer | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dupWarned, setDupWarned] = useState<string | null>(null);
  useEffect(() => {
    if (isNew && !form) setForm(emptyCustomer());
    else if (stored && (!form || form.id !== stored.id)) setForm(stored);
  }, [isNew, stored, form]);

  if (stored === null && !isNew) return <PageHeader title="Cliente no encontrado" back={{ to: '/clientes', label: 'Clientes' }} />;
  if (!form) return <p role="status">Cargando…</p>;
  const set = <K extends keyof Customer>(k: K, v: Customer[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const onSave = async () => {
    const errs = validateContact(form, 'cliente');
    setErrors(errs);
    if (errs.length) return;
    const dup = await findDuplicateCustomer(form);
    if (dup && dupWarned !== dup.id) {
      setDupWarned(dup.id);
      setErrors([`Ya existe un cliente parecido: "${dup.name}". Si es otra persona, guardá de nuevo para confirmar.`]);
      return;
    }
    const saved = await putRecord('customers', { ...form, name: form.name.trim(), email: form.email.trim() });
    toast('Cliente guardado');
    if (params.get('volver') === 'presupuesto') {
      const q = await createQuote(saved);
      navigate(`/presupuestos/${q.id}`, { replace: true });
    } else if (isNew) navigate(`/clientes/${saved.id}`, { replace: true });
    else setForm(saved);
  };

  return (
    <>
      <PageHeader
        title={isNew ? 'Nuevo cliente' : form.name}
        back={{ to: '/clientes', label: 'Clientes' }}
        subtitle={form.archived ? 'Archivado' : undefined}
        actions={
          !isNew && (
            <>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  const q = await createQuote(form);
                  navigate(`/presupuestos/${q.id}`);
                }}
              >
                <Icon name="file" />
                Presupuestar
              </button>
              <Menu label="Más acciones del cliente">
                <button
                  onClick={async () => {
                    if (!form.archived && !(await confirm('Archivar cliente', 'Deja de aparecer al elegir clientes. Sus presupuestos se conservan.', 'Archivar'))) return;
                    const saved = await putRecord('customers', { ...form, archived: !form.archived });
                    setForm(saved);
                    toast(saved.archived ? 'Cliente archivado' : 'Cliente restaurado');
                  }}
                >
                  <Icon name="archive" />
                  {form.archived ? 'Restaurar' : 'Archivar'}
                </button>
                <button
                  className="danger-item"
                  onClick={async () => {
                    if (!(await confirm('Eliminar cliente', `Se borra «${form.name}» en todos tus dispositivos. Sus presupuestos y ventas se conservan con el nombre guardado. Esta acción no se puede deshacer.`, 'Eliminar', true))) return;
                    await deleteCustomer(form.id);
                    toast('Cliente eliminado');
                    navigate('/clientes', { replace: true });
                  }}
                >
                  <Icon name="trash" />
                  Eliminar
                </button>
              </Menu>
            </>
          )
        }
      />
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
            <h2>Datos comerciales</h2>
            <div className="form-grid cols-2">
              <TextField className="span-all" label="Nombre o razón social" required value={form.name} onChange={(v) => set('name', v)} autoComplete="name" />
              <TextField label="Teléfono" type="tel" inputMode="tel" value={form.phone} onChange={(v) => set('phone', v)} hint="Con código de área para usar WhatsApp." autoComplete="tel" />
              <TextField label="Email" type="email" inputMode="email" value={form.email} onChange={(v) => set('email', v)} autoComplete="email" />
              <TextField label="Dirección" value={form.address} onChange={(v) => set('address', v)} />
              <TextField label="ID fiscal (CUIT/DNI)" value={form.taxId} onChange={(v) => set('taxId', v)} />
            </div>
          </section>
          <section className="card">
            <div className="card-header">
              <h2>Notas privadas</h2>
              <InternalLabel />
            </div>
            <TextField label="Notas" multiline value={form.notes} onChange={(v) => set('notes', v)} hint="Nunca aparecen en PDF ni en WhatsApp." />
          </section>
          <div className="sticky-actions actions">
            <button className="btn btn-primary" type="submit">
              <Icon name="check" />
              {params.get('volver') === 'presupuesto' ? 'Guardar y presupuestar' : 'Guardar cliente'}
            </button>
            <Link className="btn btn-ghost" to="/clientes">
              Cancelar
            </Link>
          </div>
        </form>
        {!isNew && (
          <aside className="stack">
          <section className="card" aria-labelledby="c-sales">
            <div className="card-header">
              <h2 id="c-sales">Ventas a este cliente</h2>
              <Link className="btn btn-sm" to={`/ventas/nueva?cliente=${id}`}>
                <Icon name="plus" />
                Registrar venta
              </Link>
            </div>
            {sales && sales.filter(saleCounts).length > 0 ? (
              <>
                <p className="small muted" style={{ marginBottom: 8 }} data-testid="customer-sales-total">
                  {sales.filter(saleCounts).length} compra(s) · Total {money(toDec(sum(sales.filter(saleCounts).map((x) => computeSaleTotals(x).total))))}
                </p>
                <ul className="list">
                  {sales.map((x) => (
                    <li key={x.id}>
                      <Link className="list-item" to={`/ventas/${x.id}`}>
                        <span className="grow">
                          <span className="title" style={{ display: 'block' }}>
                            {x.number} · {new Date(`${x.date}T12:00:00`).toLocaleDateString('es-AR')}
                          </span>
                          <span className="sub">
                            {x.channel === 'online' ? `Online · ${x.platform}` : 'En el local'}
                            {!saleCounts(x) ? ` · ${x.cancelled ? 'Cancelada' : 'Borrador'}` : ''}
                          </span>
                        </span>
                        <span className="end num">{money(computeSaleTotals(x).total)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted small">Todavía no le registraste ventas.</p>
            )}
          </section>
          <section className="card">
            <h2>Presupuestos</h2>
            <p className="small muted" style={{ marginBottom: 8 }}>
              Cliente desde {new Date(form.createdAt).toLocaleDateString('es-AR')}
            </p>
            {quotes && quotes.length > 0 ? (
              <ul className="list">
                {quotes.map((q) => (
                  <li key={q.id}>
                    <Link className="list-item" to={`/presupuestos/${q.id}`}>
                      <span className="grow">
                        <span className="title" style={{ display: 'block' }}>
                          {q.number}
                        </span>
                        <span className="sub">{money(quoteTotals(q).totals.total)}</span>
                      </span>
                      <StatusBadge status={q.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Todavía no tiene presupuestos.</p>
            )}
          </section>
          </aside>
        )}
      </div>
      {confirmNode}
    </>
  );
}
