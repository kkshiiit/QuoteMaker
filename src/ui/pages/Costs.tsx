import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link, NavLink, Navigate, useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { orphanExpenses, purchaseTotals } from '../../domain/costing';
import { Icon } from '../components/Icon';
import { EmptyState, InternalLabel, PageHeader } from '../components/ui';
import { useMoney } from '../hooks';
import Calculator from './Calculator';

const TARGET_LABEL = { unassigned: 'Sin asignar', purchase: 'A una compra', products: 'A productos' } as const;
const STATUS_BADGE = { unassigned: 'badge-warn', allocated: 'badge-ok', void: '' } as const;
const STATUS_LABEL = { unassigned: 'Sin asignar', allocated: 'En costos', void: 'Anulado' } as const;

export default function Costs() {
  const { tab = 'compras' } = useParams();
  if (!['compras', 'gastos', 'calculadora'].includes(tab)) return <Navigate to="/costos/compras" replace />;
  const action =
    tab === 'compras' ? (
      <Link className="btn btn-primary" to="/costos/compras/nueva">
        <Icon name="plus" />
        Registrar compra
      </Link>
    ) : tab === 'gastos' ? (
      <Link className="btn btn-primary" to="/costos/gastos/nuevo">
        <Icon name="plus" />
        Registrar gasto
      </Link>
    ) : undefined;
  return (
    <>
      <PageHeader title="Costos" subtitle={<><InternalLabel text="Información interna" /></>} actions={action} />
      <nav className="tabs" aria-label="Secciones de costos">
        <NavLink to="/costos/compras">Compras</NavLink>
        <NavLink to="/costos/gastos">Gastos</NavLink>
        <NavLink to="/costos/calculadora">Calculadora de precios</NavLink>
      </nav>
      {tab === 'compras' && <PurchasesList />}
      {tab === 'gastos' && <ExpensesList />}
      {tab === 'calculadora' && <Calculator />}
    </>
  );
}

function PurchasesList() {
  const money = useMoney();
  const purchases = useLiveQuery(() => db.purchases.orderBy('date').reverse().toArray(), []);
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []);
  const names = useMemo(() => new Map((suppliers ?? []).map((s) => [s.id, s.name])), [suppliers]);
  if (!purchases) return <p role="status">Cargando…</p>;
  if (purchases.length === 0)
    return (
      <EmptyState
        icon="receipt"
        title="Sin compras registradas"
        text="Cada compra define el costo de los productos. Después podés sumarle viajes, envíos o embalaje como gastos." />
    );
  return (
    <ul className="list">
      {purchases.map((p) => (
        <li key={p.id}>
          <Link className="list-item" to={`/costos/compras/${p.id}`}>
            <div className="grow">
              <div className="title">{(p.supplierId && names.get(p.supplierId)) || 'Sin proveedor'}</div>
              <div className="sub">
                {new Date(`${p.date}T12:00:00`).toLocaleDateString('es-AR')} · {p.items.length} artículo{p.items.length === 1 ? '' : 's'}
                {p.reference ? ` · ${p.reference}` : ''}
              </div>
            </div>
            <div className="end">
              <div className="num">{money(purchaseTotals(p).total)}</div>
              {p.voided && <span className="badge">Anulada</span>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ExpensesList() {
  const money = useMoney();
  const data = useLiveQuery(async () => ({ expenses: await db.expenses.orderBy('date').reverse().toArray(), purchases: await db.purchases.toArray() }), []);
  if (!data) return <p role="status">Cargando…</p>;
  const orphans = new Set(orphanExpenses(data.purchases, data.expenses).map((e) => e.id));
  if (data.expenses.length === 0)
    return (
      <EmptyState
        icon="wallet"
        title="Sin gastos registrados"
        text="Combustible, peajes, envíos, embalaje, mano de obra… Asignalos a una compra o a productos y se suman a su costo real, sin contarse dos veces." />
    );
  return (
    <>
      <p className="small muted" style={{ marginBottom: 10 }}>
        Los gastos <strong>en costos</strong> ya están incluidos en el costo de los productos y no se suman a los gastos generales. Los <strong>sin asignar</strong> todavía no afectan ningún costo.
      </p>
      <ul className="list">
        {data.expenses.map((e) => (
          <li key={e.id}>
            <Link className="list-item" to={`/costos/gastos/${e.id}`}>
              <div className="grow">
                <div className="title">
                  {e.category}
                  {e.description ? ` · ${e.description}` : ''}
                </div>
                <div className="sub">
                  {new Date(`${e.date}T12:00:00`).toLocaleDateString('es-AR')} · {TARGET_LABEL[e.target]}
                </div>
              </div>
              <div className="end">
                <div className="num">{money(e.amount)}</div>
                {orphans.has(e.id) ? <span className="badge badge-danger">Reasignar</span> : <span className={`badge ${STATUS_BADGE[e.status]}`}>{STATUS_LABEL[e.status]}</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
