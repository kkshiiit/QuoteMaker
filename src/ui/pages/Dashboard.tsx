import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { isDatabaseEmpty, loadDemoData } from '../../data/demo';
import { db } from '../../data/db';
import { suggestedPrice } from '../../data/services';
import { todayIso } from '../../data/defaults';
import { D, sum } from '../../domain/money';
import { isPastValidity, quoteTotals } from '../../domain/quote';
import { saleStatus, summarizeSales } from '../../domain/sales';
import { productStock, stockBalances } from '../../domain/stock';
import { APP_NAME, Icon, Wordmark } from '../components/Icon';
import { CategoryTiles } from '../components/CategoryTiles';
import { BackupReminder } from '../components/BackupReminder';
import { Swatch } from '../components/StockPanel';
import { InternalLabel, PageHeader, StatusBadge } from '../components/ui';
import { useMoney, usePrefs, useSettings, pct, plural } from '../hooks';
import { marginPct } from '../../domain/pricing';

export default function Dashboard() {
  const settings = useSettings();
  const money = useMoney();
  const [prefs, setPrefs] = usePrefs();
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const data = useLiveQuery(async () => {
    const [products, quotes, purchases, expenses, customers, sales] = await Promise.all([
      db.products.toArray(),
      db.quotes.orderBy('updatedAt').reverse().toArray(),
      db.purchases.toArray(),
      db.expenses.toArray(),
      db.customers.count(),
      db.sales.toArray(),
    ]);
    const categories = await db.categories.toArray();
    const balances = stockBalances(await db.stockMoves.toArray());
    return { products, quotes, purchases, expenses, customers, sales, balances, categories };
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
    const salesMonth = summarizeSales(data.sales.filter((x) => x.date >= monthStart));
    const toDeliver = data.sales.filter((x) => saleStatus(x) === 'confirmado');
    const lowStock = activeProducts.filter((p) => p.trackStock && productStock(p, data.balances).low);
    const firstDataAt = [...data.products, ...data.sales, ...data.quotes].map((x) => x.createdAt).sort()[0] ?? null;
    const favs = activeProducts.filter((p) => p.favorite);
    const favorites = (favs.length ? favs : [...activeProducts].sort((a, b) => Number(!!b.image) - Number(!!a.image) || b.updatedAt.localeCompare(a.updatedAt))).slice(0, 6);
    return { firstDataAt, toDeliver, lowStock, favorites, salesMonth, noCost, stale, sent, sentTotal, pastValidity, acceptedMonth, accRevenue, accProfit, unassigned, monthPurchases, activity, activeProducts };
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

      {data.products.length === 0 && data.quotes.length === 0 && data.sales.length === 0 && (
        <section className="card intro-hero" aria-labelledby="intro-h" style={{ marginBottom: 16 }}>
          <div className="intro-hero-head">
            <Wordmark size={72} />
            <div>
              <h2 id="intro-h" className="intro-title">
                Bienvenido a {APP_NAME}
              </h2>
              <p className="muted">Costos reales, precios, ventas y presupuestos de tu negocio, siempre a mano y privados.</p>
            </div>
          </div>
          <ul className="intro-points">
            <li>
              <Icon name="cart" />
              <span>
                <strong>Ventas</strong> en el local y online (WhatsApp, Instagram, Facebook, TikTok), con historial por cliente.
              </span>
            </li>
            <li>
              <Icon name="share" />
              <span>
                <strong>Compartí productos</strong> con fotos, videos, descripción y links directos a tus redes.
              </span>
            </li>
            <li>
              <Icon name="file" />
              <span>
                <strong>Presupuestos</strong> en PDF o WhatsApp sin mostrar nunca tus costos ni márgenes.
              </span>
            </li>
            <li>
              <Icon name="palette" />
              <span>
                <strong>A tu gusto:</strong> tema claro u oscuro, paletas clásicas, (+) Pasteles o tu propio color.
              </span>
            </li>
          </ul>
          <div className="actions">
            <Link className="btn btn-primary" to="/configuracion">
              <Icon name="settings" />
              Configurar mi negocio
            </Link>
            <Link className="btn" to="/personalizacion">
              <Icon name="palette" />
              Elegir colores
            </Link>
          </div>
        </section>
      )}

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

      <BackupReminder firstDataAt={view.firstDataAt} />

      {data.products.length > 0 && (
        <section aria-label="Catálogo" style={{ marginTop: 4 }}>
          <form
            className="home-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/productos?q=${encodeURIComponent(search.trim())}`);
            }}
          >
            <label htmlFor="home-q" className="sr-only">
              Buscar productos
            </label>
            <input id="home-q" className="input" type="search" placeholder="Buscar productos…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </form>
          <CategoryTiles categories={data.categories} value="" all={false} onChange={(id) => navigate(`/productos?categoria=${id}`)} />
          <div className="section-head">
            <h2 id="fav-h">Productos destacados</h2>
            <Link to={view.favorites.some((p) => p.favorite) ? '/productos?filtro=favoritos' : '/productos'} className="small">
              Ver todo →
            </Link>
          </div>
          <ul className="catalog-grid" aria-labelledby="fav-h">
            {view.favorites.map((p) => (
              <li key={p.id} className="catalog-card">
                <Link to={`/productos/${p.id}`} className="catalog-link">
                  <span className="catalog-img">{p.image ? <img src={p.image} alt="" loading="lazy" /> : <span aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>}</span>
                  <span className="catalog-body">
                    <span className="title">{p.name}</span>
                    <span className="catalog-meta">
                      {(p.variants ?? [])
                        .filter((v, i, a) => v.colorHex && a.findIndex((x) => x.colorHex === v.colorHex) === i)
                        .slice(0, 5)
                        .map((v) => (
                          <Swatch key={v.id} hex={v.colorHex} size={12} />
                        ))}
                    </span>
                    <span className="num catalog-price">{money(p.manualPrice ?? suggestedPrice(p, settings) ?? '0')}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="k" style={{ marginTop: 16 }}>
        <h2 id="k" className="sr-only">
          Resumen
        </h2>
        <div className="kpis">
          <Link className="kpi" to="/ventas?periodo=mes">
            <div className="label">Ventas del mes</div>
            <div className="value">{money(view.salesMonth.total)}</div>
            <div className="context">
              {plural(view.salesMonth.count, 'venta', 'ventas')} · local {view.salesMonth.byChannel.presencial.count} · online {view.salesMonth.byChannel.online.count}
            </div>
          </Link>
          <Link className="kpi" to="/ventas?estado=pendientes">
            <div className="label">Pedidos por entregar</div>
            <div className="value">{view.toDeliver.length}</div>
            <div className="context">{view.toDeliver.length ? 'Confirmados, esperando entrega' : 'Nada pendiente de entrega'}</div>
          </Link>
          {view.lowStock.length > 0 && (
            <Link className="kpi" to="/stock?filtro=bajo">
              <div className="label">Stock bajo</div>
              <div className="value warn-text">{view.lowStock.length}</div>
              <div className="context">{view.lowStock.slice(0, 3).map((p) => p.name).join(' · ')}</div>
            </Link>
          )}
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
