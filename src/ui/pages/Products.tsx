import { useLiveQuery } from 'dexie-react-hooks';
import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { matches } from '../search';
import { suggestedPrice } from '../../data/services';
import { D } from '../../domain/money';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader, SelectField } from '../components/ui';
import { useMoney, usePrefs, useSettings } from '../hooks';

type Filter = 'activos' | 'todos' | 'inactivos' | 'archivados' | 'sin-costo' | 'desactualizados';
type Sort = 'nombre' | 'costo' | 'precio' | 'actualizado';
const PAGE = 50;

export default function Products() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const filter = (params.get('filtro') as Filter) || 'activos';
  const sort = (params.get('orden') as Sort) || 'nombre';
  const cat = params.get('categoria') || '';
  const [limit, setLimit] = useState(PAGE);
  const settings = useSettings();
  const money = useMoney();
  const [prefs] = usePrefs();
  const products = useLiveQuery(() => db.products.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const catName = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c.name])), [categories]);

  const list = useMemo(() => {
    if (!products) return [];
    const staleLimit = new Date(Date.now() - settings.costStaleDays * 86400000).toISOString();
    const rows = products
      .filter((p) => {
        if (filter === 'activos') return !p.archived && p.active;
        if (filter === 'inactivos') return !p.archived && !p.active;
        if (filter === 'archivados') return p.archived;
        if (filter === 'sin-costo') return !p.archived && !p.currentCost;
        if (filter === 'desactualizados') return !p.archived && !!p.costUpdatedAt && p.costUpdatedAt < staleLimit;
        return !p.archived;
      })
      .filter((p) => !cat || p.categoryId === cat)
      .filter((p) => matches(`${p.name} ${p.sku} ${p.description}`, query))
      .map((p) => ({ p, price: p.manualPrice ?? suggestedPrice(p, settings) }));
    const cmpDec = (a: string | null, b: string | null) => (a === null ? 1 : b === null ? -1 : D(a).cmp(D(b)));
    rows.sort((a, b) => {
      if (sort === 'costo') return cmpDec(b.p.currentCost, a.p.currentCost);
      if (sort === 'precio') return cmpDec(b.price, a.price);
      if (sort === 'actualizado') return b.p.updatedAt.localeCompare(a.p.updatedAt);
      return a.p.name.localeCompare(b.p.name, 'es');
    });
    return rows;
  }, [products, filter, sort, cat, query, settings]);

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
    setLimit(PAGE);
  };

  return (
    <>
      <PageHeader
        title="Productos"
        subtitle="Catálogo con costo real y precio de venta."
        actions={
          <Link className="btn btn-primary" to="/productos/nuevo">
            <Icon name="plus" />
            Nuevo producto
          </Link>
        }
      />
      {products && products.length === 0 ? (
        <EmptyState
          icon="box"
          title="Todavía no hay productos"
          text="Cargá lo que vendés. Después, registrando compras y gastos, Chediek Home calcula el costo real y te sugiere un precio." />
      ) : (
        <>
          <div className="toolbar" role="search">
            <div className="search field">
              <label htmlFor="psearch" className="sr-only">
                Buscar productos
              </label>
              <input id="psearch" className="input" type="search" placeholder="Buscar por nombre, código o descripción" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <SelectField<Filter>
              label="Mostrar"
              value={filter}
              onChange={(v) => set('filtro', v === 'activos' ? '' : v)}
              options={[
                { value: 'activos', label: 'Activos' },
                { value: 'todos', label: 'Todos (sin archivados)' },
                { value: 'inactivos', label: 'Inactivos' },
                { value: 'sin-costo', label: 'Sin costo' },
                { value: 'desactualizados', label: 'Costo desactualizado' },
                { value: 'archivados', label: 'Archivados' },
              ]}
            />
            <SelectField<string>
              label="Categoría"
              value={cat}
              onChange={(v) => set('categoria', v)}
              options={[{ value: '', label: 'Todas' }, ...(categories ?? []).filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name }))]}
            />
            <SelectField<Sort>
              label="Ordenar"
              value={sort}
              onChange={(v) => set('orden', v === 'nombre' ? '' : v)}
              options={[
                { value: 'nombre', label: 'Nombre' },
                { value: 'precio', label: 'Precio (mayor)' },
                { value: 'costo', label: 'Costo (mayor)' },
                { value: 'actualizado', label: 'Últimos editados' },
              ]}
            />
          </div>
          <p className="small muted" aria-live="polite">
            {list.length} producto{list.length === 1 ? '' : 's'}
          </p>
          {list.length === 0 ? (
            <EmptyState icon="search" title="Sin resultados" text="Probá con otra búsqueda o cambiá los filtros." />
          ) : (
            <ul className="list" style={{ marginTop: 8 }}>
              {list.slice(0, limit).map(({ p, price }) => (
                <li key={p.id}>
                  <Link className="list-item" to={`/productos/${p.id}`}>
                    {p.image ? <img className="thumb" src={p.image} alt="" loading="lazy" decoding="async" width={44} height={44} /> : <span className="thumb" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>}
                    <div className="grow">
                      <div className="title">{p.name}</div>
                      <div className="sub">
                        {[p.sku, p.categoryId ? catName.get(p.categoryId) : null, !p.active ? 'Inactivo' : null, p.archived ? 'Archivado' : null].filter(Boolean).join(' · ') || p.unit}
                      </div>
                    </div>
                    <div className="end">
                      <div className="num" style={{ fontWeight: 650 }}>
                        {price ? money(price) : <span className="badge badge-warn">Sin precio</span>}
                      </div>
                      {!prefs.hideInternalByDefault && (
                        <div className="small muted num">
                          {p.currentCost ? (
                            <>
                              <span className="sr-only">Costo interno: </span>
                              Costo {money(p.currentCost)}
                            </>
                          ) : (
                            'Sin costo'
                          )}
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {list.length > limit && (
            <button className="btn btn-block" style={{ marginTop: 12 }} onClick={() => setLimit((l) => l + PAGE)}>
              Mostrar más ({list.length - limit} restantes)
            </button>
          )}
        </>
      )}
    </>
  );
}
