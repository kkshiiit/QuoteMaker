import { useLiveQuery } from 'dexie-react-hooks';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { createQuote } from '../../data/services';
import { quoteTotals } from '../../domain/quote';
import { QUOTE_STATUS_LABELS, type Customer, type QuoteStatus } from '../../domain/types';
import { Icon } from '../components/Icon';
import { Dialog, EmptyState, PageHeader, SelectField, StatusBadge } from '../components/ui';
import { useMoney } from '../hooks';

const PAGE = 50;

export function CustomerPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (c: Customer | null) => void }) {
  const customers = useLiveQuery(() => db.customers.filter((c) => !c.archived).toArray(), []);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const n = q.trim().toLocaleLowerCase('es');
    return (customers ?? []).filter((c) => !n || `${c.name} ${c.phone} ${c.email}`.toLocaleLowerCase('es').includes(n)).sort((a, b) => a.name.localeCompare(b.name, 'es')).slice(0, 30);
  }, [customers, q]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="¿Para quién es el presupuesto?"
      actions={
        <>
          <button className="btn" onClick={() => onPick(null)}>
            Sin cliente por ahora
          </button>
          <Link className="btn" to="/clientes/nuevo?volver=presupuesto">
            <Icon name="plus" />
            Nuevo cliente
          </Link>
        </>
      }
    >
      <label htmlFor="cpick" className="sr-only">
        Buscar cliente
      </label>
      <input id="cpick" className="input" type="search" placeholder="Buscar por nombre, teléfono o email" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul className="list" style={{ marginTop: 10 }}>
        {list.length === 0 && <li className="list-item muted">No hay clientes que coincidan.</li>}
        {list.map((c) => (
          <li key={c.id}>
            <button className="list-item btn-ghost" style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }} onClick={() => onPick(c)}>
              <span className="grow">
                <span className="title" style={{ display: 'block' }}>
                  {c.name}
                </span>
                <span className="sub">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

export default function Quotes() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const money = useMoney();
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const status = (params.get('estado') ?? '') as QuoteStatus | '';
  const [picking, setPicking] = useState(params.get('nuevo') === '1');
  const [limit, setLimit] = useState(PAGE);
  const quotes = useLiveQuery(() => db.quotes.orderBy('updatedAt').reverse().toArray(), []);

  useEffect(() => {
    if (params.get('nuevo') === '1') {
      setPicking(true);
      const n = new URLSearchParams(params);
      n.delete('nuevo');
      setParams(n, { replace: true });
    }
  }, [params, setParams]);

  const rows = useMemo(() => {
    const n = query.trim().toLocaleLowerCase('es');
    return (quotes ?? [])
      .filter((x) => !status || x.status === status)
      .filter((x) => !n || `${x.number} ${x.customerSnapshot.name}`.toLocaleLowerCase('es').includes(n))
      .map((x) => ({ q: x, total: quoteTotals(x).totals.total }));
  }, [quotes, status, query]);

  const start = async (c: Customer | null) => {
    setPicking(false);
    const created = await createQuote(c);
    navigate(`/presupuestos/${created.id}`);
  };

  return (
    <>
      <PageHeader
        title="Presupuestos"
        subtitle="Los estados los cambiás vos; nada cambia solo."
        actions={
          <button className="btn btn-primary" onClick={() => setPicking(true)}>
            <Icon name="plus" />
            Nuevo presupuesto
          </button>
        }
      />
      {quotes && quotes.length === 0 ? (
        <EmptyState
          icon="file"
          title="Todavía no hay presupuestos"
          text="Elegí un cliente, agregá productos con su precio de venta y generá un PDF o un mensaje de WhatsApp. Tus costos nunca salen en el documento." />
      ) : (
        <>
          <div className="toolbar" role="search">
            <div className="search field">
              <label htmlFor="qsearch" className="sr-only">
                Buscar presupuestos
              </label>
              <input id="qsearch" className="input" type="search" placeholder="Buscar por número o cliente" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <SelectField<QuoteStatus | ''>
              label="Estado"
              value={status}
              onChange={(v) => {
                const n = new URLSearchParams(params);
                if (v) n.set('estado', v);
                else n.delete('estado');
                setParams(n, { replace: true });
              }}
              options={[{ value: '', label: 'Todos' }, ...(Object.keys(QUOTE_STATUS_LABELS) as QuoteStatus[]).map((s) => ({ value: s, label: QUOTE_STATUS_LABELS[s] }))]}
            />
          </div>
          <p className="small muted" aria-live="polite">
            {rows.length} presupuesto{rows.length === 1 ? '' : 's'}
          </p>
          <ul className="list" style={{ marginTop: 8 }}>
            {rows.slice(0, limit).map(({ q: x, total }) => (
              <li key={x.id}>
                <Link className="list-item" to={`/presupuestos/${x.id}`}>
                  <div className="grow">
                    <div className="title">
                      {x.number} · {x.customerSnapshot.name || 'Sin cliente'}
                    </div>
                    <div className="sub">
                      {new Date(`${x.issueDate}T12:00:00`).toLocaleDateString('es-AR')} · {x.items.length || x.frozen?.items.length || 0} ítem(s)
                    </div>
                  </div>
                  <div className="end">
                    <div className="num" style={{ fontWeight: 650 }}>
                      {money(total)}
                    </div>
                    <StatusBadge status={x.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {rows.length > limit && (
            <button className="btn btn-block" style={{ marginTop: 12 }} onClick={() => setLimit((l) => l + PAGE)}>
              Mostrar más
            </button>
          )}
        </>
      )}
      <CustomerPicker open={picking} onClose={() => setPicking(false)} onPick={start} />
    </>
  );
}
