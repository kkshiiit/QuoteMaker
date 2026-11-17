import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db } from '../../data/db';
import { todayIso } from '../../data/defaults';
import { expenseLedger } from '../../domain/costing';
import { D, sum } from '../../domain/money';
import { marginPct } from '../../domain/pricing';
import { effectiveQuote, quoteTotals } from '../../domain/quote';
import { InternalLabel, PageHeader, SelectField, TextField } from '../components/ui';
import { pct, useMoney } from '../hooks';

type Range = 'month' | 'prev' | '90' | 'year' | 'custom';

function rangeDates(r: Range, from: string, to: string): [string, string] {
  const today = todayIso();
  const d = new Date(`${today}T12:00:00Z`);
  if (r === 'month') return [`${today.slice(0, 7)}-01`, today];
  if (r === 'prev') {
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
    return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)];
  }
  if (r === '90') return [new Date(d.getTime() - 89 * 86400000).toISOString().slice(0, 10), today];
  if (r === 'year') return [`${today.slice(0, 4)}-01-01`, today];
  return [from || today, to || today];
}

export default function Stats() {
  const money = useMoney();
  const [range, setRange] = useState<Range>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const data = useLiveQuery(async () => ({ quotes: await db.quotes.toArray(), expenses: await db.expenses.toArray(), overheads: await db.overheads.toArray(), purchases: await db.purchases.toArray() }), []);
  const [start, end] = rangeDates(range, from, to);

  const s = useMemo(() => {
    if (!data) return null;
    const inR = (d: string) => d >= start && d <= end;
    const quotes = data.quotes.filter((q) => inR(effectiveQuote(q).issueDate));
    const by = (st: string) => quotes.filter((q) => q.status === st);
    const accepted = by('accepted');
    const decided = accepted.length + by('rejected').length;
    const accCalc = accepted.map((q) => ({ q, ...quoteTotals(q) }));
    const revenue = sum(accCalc.map((x) => x.internal.revenueNet));
    const profit = sum(accCalc.map((x) => x.internal.profit));
    const ledger = expenseLedger(data.expenses, data.overheads, start, end);
    const purchasesTotal = data.purchases.filter((p) => !p.voided && inR(p.date)).length;
    const products = new Map<string, { name: string; revenue: ReturnType<typeof D>; qty: ReturnType<typeof D> }>();
    for (const x of accCalc) {
      x.totals.lines.forEach((l, i) => {
        const key = effectiveQuote(x.q).items[i]?.productId ?? `libre:${l.description}`;
        const cur = products.get(key) ?? { name: l.description, revenue: D(0), qty: D(0) };
        cur.revenue = cur.revenue.plus(D(l.net));
        cur.qty = cur.qty.plus(D(l.quantity));
        products.set(key, cur);
      });
    }
    const top = [...products.values()].sort((a, b) => b.revenue.cmp(a.revenue)).slice(0, 8);
    return { quotes, by, accepted, decided, revenue, profit, ledger, purchasesTotal, top, netAfterOverhead: profit.minus(ledger.overhead).minus(ledger.unassigned) };
  }, [data, start, end]);

  return (
    <>
      <PageHeader title="Estadísticas" subtitle={`Del ${new Date(`${start}T12:00:00`).toLocaleDateString('es-AR')} al ${new Date(`${end}T12:00:00`).toLocaleDateString('es-AR')}`} />
      <div className="toolbar">
        <SelectField<Range>
          label="Período"
          value={range}
          onChange={setRange}
          options={[
            { value: 'month', label: 'Este mes' },
            { value: 'prev', label: 'Mes anterior' },
            { value: '90', label: 'Últimos 90 días' },
            { value: 'year', label: 'Este año' },
            { value: 'custom', label: 'Personalizado' },
          ]}
        />
        {range === 'custom' && (
          <>
            <TextField label="Desde" type="date" value={from} onChange={setFrom} />
            <TextField label="Hasta" type="date" value={to} onChange={setTo} />
          </>
        )}
      </div>
      {!s ? (
        <p role="status">Cargando…</p>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="label">Presupuestos emitidos</div>
              <div className="value">{s.quotes.length}</div>
              <div className="context">{s.by('sent').length} esperando respuesta</div>
            </div>
            <div className="kpi">
              <div className="label">Tasa de aceptación</div>
              <div className="value">{s.decided ? pct(D(s.accepted.length).div(s.decided).times(100)) : '—'}</div>
              <div className="context">
                {s.accepted.length} aceptados de {s.decided} con respuesta
              </div>
            </div>
            <div className="kpi">
              <div className="label">Ventas aceptadas</div>
              <div className="value">{money(s.revenue)}</div>
              <div className="context">Neto de impuestos, incluye envío cobrado</div>
            </div>
          </div>
          <div className="grid grid-2" style={{ marginTop: 16 }}>
            <section className="card">
              <div className="card-header">
                <h2>Rentabilidad</h2>
                <InternalLabel text="Interno" />
              </div>
              <dl className="dl">
                <dt>Ganancia bruta (presupuestos aceptados)</dt>
                <dd>{money(s.profit)}</dd>
                <dt>Margen</dt>
                <dd>{pct(marginPct(s.revenue, s.revenue.minus(s.profit)))}</dd>
                <dt>Gastos generales del período</dt>
                <dd>−{money(s.ledger.overhead)}</dd>
                <dt>Gastos sin asignar</dt>
                <dd>−{money(s.ledger.unassigned)}</dd>
                <dt className="total">Resultado estimado</dt>
                <dd className={`total ${s.netAfterOverhead.lt(0) ? 'danger-text' : ''}`}>{money(s.netAfterOverhead)}</dd>
              </dl>
              <p className="small muted" style={{ marginTop: 8 }}>
                Los gastos ya asignados a compras ({money(s.ledger.allocatedToCost)}) están dentro del costo de los productos y no se restan de nuevo.
              </p>
            </section>
            <section className="card">
              <h2>Productos más vendidos</h2>
              {s.top.length === 0 ? (
                <p className="muted">Sin presupuestos aceptados en el período.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {s.top.map((t) => (
                    <li key={t.name} style={{ marginBottom: 10 }}>
                      <div className="row-between small">
                        <span>{t.name}</span>
                        <span className="num">
                          {money(t.revenue)} · {t.qty.toString()} u
                        </span>
                      </div>
                      <div className="bar" aria-hidden="true">
                        <span style={{ width: `${s.top[0]!.revenue.gt(0) ? t.revenue.div(s.top[0]!.revenue).times(100).toFixed(0) : 0}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card">
              <h2>Presupuestos por estado</h2>
              <dl className="dl">
                {(['draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled'] as const).map((st) => (
                  <div key={st} style={{ display: 'contents' }}>
                    <dt>{{ draft: 'Borradores', sent: 'Enviados', accepted: 'Aceptados', rejected: 'Rechazados', expired: 'Vencidos', cancelled: 'Cancelados' }[st]}</dt>
                    <dd>{s.by(st).length}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="card">
              <h2>Gastos del período</h2>
              <dl className="dl">
                <dt>En costos de productos</dt>
                <dd>{money(s.ledger.allocatedToCost)}</dd>
                <dt>Sin asignar</dt>
                <dd>{money(s.ledger.unassigned)}</dd>
                <dt>Generales</dt>
                <dd>{money(s.ledger.overhead)}</dd>
                <dt className="total">Total (sin duplicar)</dt>
                <dd className="total">{money(s.ledger.total)}</dd>
              </dl>
              <p className="small muted" style={{ marginTop: 8 }}>
                {s.purchasesTotal} compra(s) en el período.
              </p>
            </section>
          </div>
        </>
      )}
    </>
  );
}
