import { useLiveQuery } from 'dexie-react-hooks';
import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { computeSaleTotals, summarizeSales } from '../../domain/sales';
import { SALE_CHANNEL_LABELS, type SaleChannel } from '../../domain/types';
import { Icon } from '../components/Icon';
import { EmptyState, InternalLabel, PageHeader, SelectField } from '../components/ui';
import { useMoney, usePrefs } from '../hooks';
import { matches } from '../search';

const PAGE = 50;
type Filter = '' | SaleChannel;

export function ChannelBadge({ channel, platform }: { channel: SaleChannel; platform?: string }) {
  return (
    <span className={`badge ${channel === 'online' ? 'badge-accent' : ''}`}>
      <Icon name={channel === 'online' ? 'globe' : 'store'} />
      {channel === 'online' ? `Online${platform ? ` · ${platform}` : ''}` : 'En el local'}
    </span>
  );
}

export default function Sales() {
  const [params, setParams] = useSearchParams();
  const money = useMoney();
  const [prefs] = usePrefs();
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const [limit, setLimit] = useState(PAGE);
  const channel = (params.get('canal') ?? '') as Filter;
  const period = params.get('periodo') ?? 'todo';
  const sales = useLiveQuery(() => db.sales.orderBy('date').reverse().toArray(), []);

  const since = useMemo(() => {
    const d = new Date();
    if (period === 'mes') return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
    if (period === '30') return new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    return '';
  }, [period]);

  const inPeriod = useMemo(() => (sales ?? []).filter((s) => !since || s.date >= since), [sales, since]);
  const summary = useMemo(() => summarizeSales(inPeriod), [inPeriod]);
  const rows = useMemo(
    () =>
      inPeriod
        .filter((s) => !channel || s.channel === channel)
        .filter((s) => matches(`${s.number} ${s.customerName} ${s.platform} ${s.items.map((i) => i.description).join(' ')}`, query))
        .map((s) => ({ s, total: computeSaleTotals(s).total })),
    [inPeriod, channel, query],
  );

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Ventas"
        subtitle="Historial de lo vendido, en el local y online."
        actions={
          <Link className="btn btn-primary" to="/ventas/nueva">
            <Icon name="plus" />
            Registrar venta
          </Link>
        }
      />
      {sales && sales.length === 0 ? (
        <EmptyState
          icon="cart"
          title="Todavía no registraste ventas"
          text="Anotá cada venta presencial en el local o venta online (WhatsApp, Instagram, Facebook, TikTok…). Podés asociarla a un cliente o dejarla como consumidor final."
          action={
            <Link className="btn btn-primary" to="/ventas/nueva">
              <Icon name="plus" />
              Registrar la primera venta
            </Link>
          }
        />
      ) : (
        <>
          <section className="kpis" aria-label="Resumen de ventas" style={{ marginBottom: 16 }}>
            <div className="card kpi">
              <div className="label">Total vendido</div>
              <div className="value num" data-testid="sales-total">
                {money(summary.total)}
              </div>
              <div className="context">{summary.count} venta{summary.count === 1 ? '' : 's'}</div>
            </div>
            <div className="card kpi">
              <div className="label">
                <Icon name="store" /> En el local
              </div>
              <div className="value num" data-testid="sales-presencial">
                {money(summary.byChannel.presencial.total)}
              </div>
              <div className="context">{summary.byChannel.presencial.count} venta(s)</div>
            </div>
            <div className="card kpi">
              <div className="label">
                <Icon name="globe" /> Online
              </div>
              <div className="value num" data-testid="sales-online">
                {money(summary.byChannel.online.total)}
              </div>
              <div className="context">
                {summary.byPlatform.length ? summary.byPlatform.map((p) => `${p.platform} ${p.count}`).join(' · ') : `${summary.byChannel.online.count} venta(s)`}
              </div>
            </div>
            {!prefs.hideInternalByDefault && (
              <div className="card kpi">
                <div className="label">
                  Ganancia <InternalLabel text="Interno" />
                </div>
                <div className="value num">{money(summary.profit)}</div>
                <div className="context">Con costos congelados al vender</div>
              </div>
            )}
          </section>

          <div className="toolbar" role="search">
            <div className="search field">
              <label htmlFor="ssearch" className="sr-only">
                Buscar ventas
              </label>
              <input id="ssearch" className="input" type="search" placeholder="Buscar por número, cliente o producto" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <SelectField<Filter>
              label="Canal"
              value={channel}
              onChange={(v) => setParam('canal', v)}
              options={[{ value: '', label: 'Todos' }, { value: 'presencial', label: SALE_CHANNEL_LABELS.presencial }, { value: 'online', label: SALE_CHANNEL_LABELS.online }]}
            />
            <SelectField<string>
              label="Período"
              value={period}
              onChange={(v) => setParam('periodo', v === 'todo' ? '' : v)}
              options={[
                { value: 'todo', label: 'Todo' },
                { value: 'mes', label: 'Este mes' },
                { value: '30', label: 'Últimos 30 días' },
              ]}
            />
          </div>

          {summary.byCustomer.length > 0 && (
            <details className="card" style={{ marginBottom: 12 }}>
              <summary>
                <strong>Ventas por cliente</strong>
              </summary>
              <ul className="list" style={{ marginTop: 10 }}>
                {summary.byCustomer.slice(0, 15).map((c) => (
                  <li key={c.key} className="list-item">
                    <span className="grow">
                      <span className="title">{c.name}</span>
                      <span className="sub"> · {c.count} compra(s)</span>
                    </span>
                    <span className="end num">{money(c.total)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="small muted" aria-live="polite">
            {rows.length} venta{rows.length === 1 ? '' : 's'}
          </p>
          <ul className="list" style={{ marginTop: 8 }}>
            {rows.slice(0, limit).map(({ s, total }) => (
              <li key={s.id}>
                <Link className="list-item" to={`/ventas/${s.id}`}>
                  <div className="grow">
                    <div className="title">
                      {s.number} · {s.customerName || 'Consumidor final'}
                    </div>
                    <div className="sub">
                      {new Date(`${s.date}T12:00:00`).toLocaleDateString('es-AR')} · {s.items.length} ítem(s) · {s.paymentMethod}
                    </div>
                  </div>
                  <div className="end">
                    <div className={`num ${s.cancelled ? 'muted' : ''}`} style={{ fontWeight: 650, textDecoration: s.cancelled ? 'line-through' : undefined }}>
                      {money(total)}
                    </div>
                    {s.cancelled ? <span className="badge badge-warn">Anulada</span> : <ChannelBadge channel={s.channel} platform={s.platform} />}
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
    </>
  );
}
