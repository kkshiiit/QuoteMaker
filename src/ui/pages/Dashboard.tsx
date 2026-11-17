import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { isDatabaseEmpty, loadDemoData } from '../../data/demo';
import { db } from '../../data/db';
import { todayIso } from '../../data/defaults';
import { D, sum } from '../../domain/money';
import { isPastValidity, quoteTotals } from '../../domain/quote';
import { Icon } from '../components/Icon';
import { InternalLabel, PageHeader, StatusBadge } from '../components/ui';
import { useMoney, usePrefs, useSettings, pct } from '../hooks';
import { marginPct } from '../../domain/pricing';

export default function Dashboard() {
  const settings = useSettings();
  const money = useMoney();
  const [prefs, setPrefs] = usePrefs();
  const [loadingDemo, setLoadingDemo] = useState(false);
  const data = useLiveQuery(async () => {
    const [products, quotes, purchases, expenses, customers] = await Promise.all([
      db.products.toArray(),
      db.quotes.orderBy('updatedAt').reverse().toArray(),
      db.purchases.toArray(),
      db.expenses.toArray(),
      db.customers.count(),
    ]);
    return { products, quotes, purchases, expenses, customers };
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const today = todayIso();
    const monthStart = `${today.slice(0, 7)}-01`;
    const staleLimit = new Date(Date.now() - settings.costStaleDays * 86400000).toISOString();
    const activeProducts = data.products.filter((p) => !p.archived && p.active);
    const noCost = activeProducts.filter((p) => !p.currentCost);
    const stale = activeProducts.filter((p) => p.currentCost && p.costUpdatedAt && p.costUpdatedAt < staleLimit);
    const sent = data.quotes.filter((q) => q.status === 'sent');
    const sentTotal = sum(sent.map((q) => quoteTotals(q).totals.total));
    const pastValidity = sent.filter((q) => isPastValidity(q, today));
    const acceptedMonth = data.quotes.filter((q) => q.status === 'accepted' && (q.frozen?.issueDate ?? q.issueDate) >= monthStart);
    const accTotals = acceptedMonth.map((q) => quoteTotals(q));
    const accRevenue = sum(accTotals.map((t) => t.internal.revenueNet));
    const accProfit = sum(accTotals.map((t) => t.internal.profit));
    const unassigned = data.expenses.filter((e) => e.status === 'unassigned');
    const monthPurchases = data.purchases.filter((p) => !p.voided && p.date >= monthStart);
    const activity = data.quotes
      .flatMap((q) => q.events.map((e) => ({ ...e, quote: q })))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 6);
    return { noCost, stale, sent, sentTotal, pastValidity, acceptedMonth, accRevenue, accProfit, unassigned, monthPurchases, activity, activeProducts };
  }, [data, settings.costStaleDays]);

  if (!data || !view) return <p role="status">Cargando…</p>;

  const steps = [
    { done: !!settings.businessName, label: 'Cargá los datos de tu negocio', to: '/configuracion' },
    { done: data.products.length > 0, label: 'Agregá tu primer producto', to: '/productos/nuevo' },
    { done: data.purchases.length > 0, label: 'Registrá una compra para calcular el costo real', to: '/costos/compras/nueva' },
    { done: data.customers > 0, label: 'Agregá un cliente', to: '/clientes/nuevo' },
    { done: data.quotes.length > 0, label: 'Creá tu primer presupuesto', to: '/presupuestos' },
  ];
  const pendingSteps = steps.filter((s) => !s.done);
  const hide = prefs.hideInternalByDefault;

  return (
    <>
      <PageHeader
        title={settings.businessName ? `Hola, ${settings.businessName}` : 'Inicio'}
        subtitle="Lo que necesita tu atención hoy."
        actions={
          <Link className="btn btn-primary" to="/presupuestos?nuevo=1">
            <Icon name="plus" />
            Nuevo presupuesto
          </Link>
        }
      />

      {pendingSteps.length > 0 && (
        <section className="card" aria-labelledby="onb">
          <div className="card-header">
            <h2 id="onb">Primeros pasos</h2>
            {data.products.length === 0 && data.quotes.length === 0 && (
              <button
                className="btn btn-sm"
                disabled={loadingDemo}
                onClick={async () => {
                  if (!(await isDatabaseEmpty())) return;
                  setLoadingDemo(true);
                  try {
                    await loadDemoData();
                  } finally {
                    setLoadingDemo(false);
                  }
                }}
              >
                {loadingDemo ? 'Cargando ejemplo…' : 'Probar con datos de ejemplo'}
              </button>
            )}
          </div>
          <ol className="list" style={{ border: 0, boxShadow: 'none' }}>
            {steps.map((s) => (
              <li key={s.label}>
                <Link className="list-item" to={s.to}>
                  <span className={`badge ${s.done ? 'badge-ok' : ''}`}>
                    <Icon name={s.done ? 'check' : 'plus'} />
                    {s.done ? 'Hecho' : 'Pendiente'}
                  </span>
                  <span className="grow">{s.label}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="k" style={{ marginTop: 16 }}>
        <h2 id="k" className="sr-only">
          Resumen
        </h2>
        <div className="kpis">
          <Link className="kpi" to="/presupuestos?estado=sent">
            <div className="label">Presupuestos enviados</div>
            <div className="value">{view.sent.length}</div>
            <div className="context">{view.sent.length ? `${money(view.sentTotal)} esperando respuesta` : 'Nada pendiente de respuesta'}</div>
          </Link>
          <Link className="kpi" to="/presupuestos?estado=accepted">
            <div className="label">Aceptados este mes</div>
            <div className="value">{view.acceptedMonth.length}</div>
            <div className="context">{money(view.accRevenue)} vendidos (sin impuestos)</div>
          </Link>
          <Link className="kpi" to="/productos?filtro=sin-costo">
            <div className="label">Costos a revisar</div>
            <div className="value">{view.noCost.length + view.stale.length}</div>
            <div className="context">
              {view.noCost.length} sin costo · {view.stale.length} con más de {settings.costStaleDays} días
            </div>
          </Link>
          <Link className="kpi" to="/costos/gastos">
            <div className="label">Gastos sin asignar</div>
            <div className="value">{view.unassigned.length}</div>
            <div className="context">{money(sum(view.unassigned.map((e) => e.amount)))} aún no impactan en costos</div>
          </Link>
        </div>
      </section>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <section className="card" aria-labelledby="rent">
          <div className="card-header">
            <h2 id="rent">Rentabilidad del mes</h2>
            <button className="btn btn-sm btn-ghost" onClick={() => setPrefs({ hideInternalByDefault: !hide })} aria-pressed={hide}>
              <Icon name={hide ? 'eye' : 'eyeOff'} />
              {hide ? 'Mostrar' : 'Ocultar'}
            </button>
          </div>
          <InternalLabel />
          {hide ? (
            <p className="muted" style={{ marginTop: 8 }}>
              Datos internos ocultos.
            </p>
          ) : (
            <dl className="dl" style={{ marginTop: 8 }}>
              <dt>Ventas aceptadas (neto)</dt>
              <dd>{money(view.accRevenue)}</dd>
              <dt>Ganancia estimada</dt>
              <dd className={D(view.accProfit).lt(0) ? 'danger-text' : ''}>{money(view.accProfit)}</dd>
              <dt>Margen</dt>
              <dd>{pct(marginPct(view.accRevenue, view.accRevenue.minus(view.accProfit)))}</dd>
              <dt>Compras del mes</dt>
              <dd>{view.monthPurchases.length}</dd>
            </dl>
          )}
          <p className="small muted" style={{ marginTop: 10 }}>
            Ganancia = ventas aceptadas − costo real congelado en cada presupuesto − costo de envío.
          </p>
        </section>

        <section className="card" aria-labelledby="act">
          <h2 id="act">Actividad reciente</h2>
          {view.activity.length === 0 ? (
            <p className="muted">Todavía no hay actividad. Cuando crees presupuestos, vas a ver acá su historial.</p>
          ) : (
            <ul className="list" style={{ border: 0, boxShadow: 'none' }}>
              {view.activity.map((a) => (
                <li key={`${a.quote.id}-${a.at}-${a.type}`}>
                  <Link className="list-item" to={`/presupuestos/${a.quote.id}`}>
                    <div className="grow">
                      <div className="title">
                        {a.quote.number} · {a.quote.customerSnapshot.name || 'Sin cliente'}
                      </div>
                      <div className="sub">{a.detail}</div>
                    </div>
                    <div className="end">
                      <StatusBadge status={a.quote.status} />
                      <div className="small muted">{new Date(a.at).toLocaleDateString('es-AR')}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {view.pastValidity.length > 0 && (
        <section className="card" aria-labelledby="venc" style={{ marginTop: 16 }}>
          <h2 id="venc">
            <Icon name="alert" className="sr-only" />
            Validez vencida
          </h2>
          <p className="muted small">Estos presupuestos enviados pasaron su fecha de validez. El estado no cambia solo: decidí vos si marcarlos como vencidos.</p>
          <ul className="list" style={{ marginTop: 8 }}>
            {view.pastValidity.map((q) => (
              <li key={q.id}>
                <Link className="list-item" to={`/presupuestos/${q.id}`}>
                  <span className="grow">
                    {q.number} · {q.customerSnapshot.name}
                  </span>
                  <span className="badge badge-warn">Venció {new Date(`${q.validUntil}T12:00:00`).toLocaleDateString('es-AR')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
