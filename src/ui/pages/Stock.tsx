import { useLiveQuery } from 'dexie-react-hooks';
import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { D } from '../../domain/money';
import { productStock } from '../../domain/stock';
import { Icon } from '../components/Icon';
import { Swatch } from '../components/StockPanel';
import { EmptyState, PageHeader, SelectField } from '../components/ui';
import { useStockBalances, plural } from '../hooks';
import { matches } from '../search';

export default function Stock() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const filter = params.get('filtro') ?? '';
  const products = useLiveQuery(() => db.products.filter((p) => !p.archived && !!p.trackStock).toArray(), []);
  const balances = useStockBalances();
  const rows = useMemo(
    () =>
      (products ?? [])
        .map((p) => ({ p, s: productStock(p, balances ?? new Map()) }))
        .filter(({ s }) => (filter === 'bajo' ? s.low : filter === 'sin' ? D(s.total).lte(0) : true))
        .filter(({ p }) => matches(`${p.name} ${p.sku} ${(p.variants ?? []).map((v) => `${v.color} ${v.size}`).join(' ')}`, query))
        .sort((a, b) => Number(b.s.low) - Number(a.s.low) || a.p.name.localeCompare(b.p.name, 'es')),
    [products, balances, filter, query],
  );
  const lowCount = (products ?? []).filter((p) => productStock(p, balances ?? new Map()).low).length;

  return (
    <>
      <PageHeader title="Stock" subtitle={lowCount ? `${plural(lowCount, 'producto', 'productos')} con stock bajo.` : 'Existencias por color y talle.'} />
      {products && products.length === 0 ? (
        <EmptyState
          icon="layers"
          title="Todavía no controlás stock"
          text="Abrí un producto, agregá sus colores y talles y marcá «Controlar stock de este producto». Las ventas lo descuentan solas."
          action={
            <Link className="btn btn-primary" to="/productos">
              <Icon name="box" />
              Ir a productos
            </Link>
          }
        />
      ) : (
        <>
          <div className="toolbar" role="search">
            <div className="search field">
              <label htmlFor="stsearch" className="sr-only">
                Buscar en el stock
              </label>
              <input id="stsearch" className="input" type="search" placeholder="Buscar en el stock…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <SelectField<string>
              label="Mostrar"
              value={filter}
              onChange={(v) => {
                const n = new URLSearchParams(params);
                if (v) n.set('filtro', v);
                else n.delete('filtro');
                setParams(n, { replace: true });
              }}
              options={[
                { value: '', label: 'Todo' },
                { value: 'bajo', label: 'Stock bajo' },
                { value: 'sin', label: 'Sin stock' },
              ]}
            />
          </div>
          <ul className="list" style={{ marginTop: 8 }}>
            {rows.map(({ p, s }) => (
              <li key={p.id}>
                <Link className="list-item stock-item" to={`/productos/${p.id}`}>
                  {p.image ? <img className="thumb" src={p.image} alt="" loading="lazy" width={44} height={44} /> : <span className="thumb" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>}
                  <div className="grow">
                    <div className="title">{p.name}</div>
                    {(p.variants ?? []).length > 0 && (
                      <ul className="stock-lines" aria-label={`Stock de ${p.name} por variante`}>
                        {s.lines.map((l) => {
                          const v = p.variants!.find((x) => x.id === l.variantId);
                          return (
                            <li key={l.variantId} className={l.low ? 'warn-text' : ''}>
                              {v?.colorHex && <Swatch hex={v.colorHex} size={12} />} {l.label}: <strong className="num">{l.qty}</strong>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="end">
                    <div className="num" style={{ fontWeight: 700 }}>
                      {s.total} u.
                    </div>
                    {s.low && <span className="badge badge-warn">Stock bajo</span>}
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
