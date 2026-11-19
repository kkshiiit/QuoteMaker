import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { todayIso } from '../../data/defaults';
import { expenseLedger } from '../../domain/costing';
import { D, sum, toDec } from '../../domain/money';
import { elapsedDays, periodOf, shiftPeriod, type PeriodKind } from '../../domain/periods';
import { Icon, type IconName } from '../components/Icon';
import { EmptyState, InternalLabel, PageHeader, Segmented } from '../components/ui';
import { useMoney } from '../hooks';

const expenseIcon = (c: string): IconName =>
  /flete|env[ií]o|via|nafta|combust|peaje/i.test(c) ? 'truck' : /luz|electric|gas|agua|internet|servicio/i.test(c) ? 'sparkle' : /embal|etiqu/i.test(c) ? 'tag' : /mercad|compra|insumo|madera|pintura/i.test(c) ? 'box' : 'receipt';

/** Panel de gastos por día, quincena o mes. Cada gasto se cuenta una sola vez (igual que Estadísticas). */
export default function ExpensesPanel() {
  const [params, setParams] = useSearchParams();
  const money = useMoney();
  const kind = (params.get('periodo') as PeriodKind) || 'mes';
  const anchor = params.get('fecha') || todayIso();
  const period = useMemo(() => periodOf(kind, anchor), [kind, anchor]);
  const data = useLiveQuery(async () => ({ expenses: await db.expenses.toArray(), overheads: await db.overheads.filter((o) => o.active).toArray() }), []);
  const set = (patch: Record<string, string>) => {
    const n = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };

  const view = useMemo(() => {
    if (!data) return null;
    const list = data.expenses.filter((e) => e.status !== 'void' && e.date >= period.from && e.date <= period.to).sort((a, b) => b.date.localeCompare(a.date));
    const ledger = expenseLedger(data.expenses, data.overheads, period.from, period.to);
    const byCat = new Map<string, string>();
    for (const e of list) byCat.set(e.category || 'Sin categoría', toDec(D(byCat.get(e.category || 'Sin categoría') ?? '0').plus(D(e.amount))));
    const recorded = toDec(sum(list.map((e) => e.amount)));
    const cats = [...byCat.entries()].sort((a, b) => D(b[1]).cmp(D(a[1])));
    const days = elapsedDays(period, todayIso()) || period.days;
    return { list, ledger, cats, recorded, total: toDec(ledger.total), daily: toDec(D(ledger.total).div(days)), days };
  }, [data, period]);

  return (
    <>
      <PageHeader
        title="Panel de gastos"
        subtitle={<>Controlá cuánto gastás por día, quincena o mes. <InternalLabel text="Interno" /></>}
      />
      <div className="row-between" style={{ marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <Segmented<PeriodKind>
          hideLegend
          legend="Período"
          value={kind}
          onChange={(v) => set({ periodo: v === 'mes' ? '' : v })}
          options={[
            { value: 'dia', label: 'Diario' },
            { value: 'quincena', label: 'Quincenal' },
            { value: 'mes', label: 'Mensual' },
          ]}
        />
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <button className="btn btn-icon btn-sm" aria-label="Período anterior" onClick={() => set({ fecha: shiftPeriod(period, -1).from })}>
            <Icon name="back" />
          </button>
          <strong aria-live="polite" data-testid="period-label">
            {period.label}
          </strong>
          <button className="btn btn-icon btn-sm" aria-label="Período siguiente" onClick={() => set({ fecha: shiftPeriod(period, 1).from })} style={{ transform: 'scaleX(-1)' }}>
            <Icon name="back" />
          </button>
        </div>
      </div>
      {view && (
        <>
          <section className="kpis kpis-3" aria-label="Resumen de gastos" style={{ marginBottom: 16 }}>
            <div className="card kpi">
              <div className="label">
                <Icon name="wallet" /> Gasto del período
              </div>
              <div className="value num" data-testid="exp-total">
                {money(view.total)}
              </div>
              <div className="context">Gastos cargados {money(view.recorded)} + generales {money(toDec(view.ledger.overhead))}</div>
            </div>
            <div className="card kpi">
              <div className="label">
                <Icon name="chart" /> Promedio diario
              </div>
              <div className="value num" data-testid="exp-daily">
                {money(view.daily)}
              </div>
              <div className="context">Sobre {view.days} día(s)</div>
            </div>
            <div className="card kpi">
              <div className="label">
                <Icon name="tag" /> Categoría principal
              </div>
              <div className="value value-text">{view.cats[0]?.[0] ?? '—'}</div>
              <div className="context">{view.cats[0] && D(view.recorded).gt(0) ? `${D(view.cats[0][1]).div(D(view.recorded)).times(100).round(0).toString()} % de lo cargado` : 'Sin gastos cargados'}</div>
            </div>
          </section>
          {view.list.length === 0 ? (
            <EmptyState icon="wallet" title="Sin gastos en este período" text="Cargá fletes, insumos, servicios o cualquier gasto. Podés asignarlo al costo de tus productos o dejarlo como gasto del negocio." />
          ) : (
            <>
              {view.cats.length > 1 && (
                <section className="card" aria-labelledby="exp-cats" style={{ marginBottom: 12 }}>
                  <h2 id="exp-cats">Por categoría</h2>
                  <ul className="bars">
                    {view.cats.map(([c, v]) => (
                      <li key={c}>
                        <span className="grow">{c}</span>
                        <span className="bar" aria-hidden="true">
                          <span style={{ width: `${D(v).div(D(view.cats[0]![1])).times(100).round(0).toString()}%` }} />
                        </span>
                        <span className="num">{money(v)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <ul className="list">
                {view.list.map((e) => (
                  <li key={e.id}>
                    <Link className="list-item" to={`/costos/gastos/${e.id}`}>
                      <span className="thumb" aria-hidden="true">
                        <Icon name={expenseIcon(e.category)} />
                      </span>
                      <div className="grow">
                        <div className="title">{e.description || e.category}</div>
                        <div className="sub">
                          {new Date(`${e.date}T12:00:00`).toLocaleDateString('es-AR')} · {e.category}
                          {e.status === 'allocated' ? ' · En el costo de productos' : ''}
                        </div>
                      </div>
                      <div className="end num" style={{ fontWeight: 650 }}>
                        {money(e.amount)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Link className="btn btn-accent btn-block" to="/costos/gastos/nuevo" style={{ marginTop: 14 }}>
            <Icon name="plus" />
            Agregar gasto
          </Link>
        </>
      )}
    </>
  );
}
