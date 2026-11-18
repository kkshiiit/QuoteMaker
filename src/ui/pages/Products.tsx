import { useLiveQuery } from "dexie-react-hooks";
import { useDeferredValue, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { db } from "../../data/db";
import { matches } from "../search";
import { suggestedPrice } from "../../data/services";
import { D } from "../../domain/money";
import { Icon } from "../components/Icon";
import { EmptyState, PageHeader, SelectField } from "../components/ui";
import { useMoney, usePrefs, useSettings, useStockBalances } from "../hooks";
import { putRecord } from "../../data/repo";
import { productStock } from "../../domain/stock";
import type { Product } from "../../domain/types";
import { Swatch } from "../components/StockPanel";

type Filter =
  | "activos"
  | "favoritos"
  | "stock-bajo"
  | "todos"
  | "inactivos"
  | "archivados"
  | "sin-costo"
  | "desactualizados";
type Sort = "nombre" | "costo" | "precio" | "actualizado";
const PAGE = 50;

function FavoriteButton({ product }: { product: Product }) {
  const on = !!product.favorite;
  return (
    <button
      type="button"
      className={`fav-btn ${on ? "on" : ""}`}
      aria-pressed={on}
      aria-label={`Favorito: ${product.name}`}
      onClick={() => void putRecord("products", { ...product, favorite: !on })}
    >
      <Icon name="heart" />
    </button>
  );
}

export default function Products() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const query = useDeferredValue(q);
  const filter = (params.get("filtro") as Filter) || "activos";
  const sort = (params.get("orden") as Sort) || "nombre";
  const cat = params.get("categoria") || "";
  const [limit, setLimit] = useState(PAGE);
  const settings = useSettings();
  const money = useMoney();
  const [prefs] = usePrefs();
  const products = useLiveQuery(() => db.products.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const catName = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c.name])),
    [categories],
  );
  const balances = useStockBalances();
  const view = params.get("vista") === "lista" ? "lista" : "grilla";

  const list = useMemo(() => {
    if (!products) return [];
    const staleLimit = new Date(
      Date.now() - settings.costStaleDays * 86400000,
    ).toISOString();
    const rows = products
      .filter((p) => {
        if (filter === "activos") return !p.archived && p.active;
        if (filter === "favoritos") return !p.archived && !!p.favorite;
        if (filter === "stock-bajo")
          return (
            !p.archived &&
            !!p.trackStock &&
            productStock(p, balances ?? new Map()).low
          );
        if (filter === "inactivos") return !p.archived && !p.active;
        if (filter === "archivados") return p.archived;
        if (filter === "sin-costo") return !p.archived && !p.currentCost;
        if (filter === "desactualizados")
          return (
            !p.archived && !!p.costUpdatedAt && p.costUpdatedAt < staleLimit
          );
        return !p.archived;
      })
      .filter((p) => !cat || p.categoryId === cat)
      .filter((p) => matches(`${p.name} ${p.sku} ${p.description}`, query))
      .map((p) => ({
        p,
        price: p.manualPrice ?? suggestedPrice(p, settings),
        stock: p.trackStock ? productStock(p, balances ?? new Map()) : null,
      }));
    const cmpDec = (a: string | null, b: string | null) =>
      a === null ? 1 : b === null ? -1 : D(a).cmp(D(b));
    rows.sort((a, b) => {
      if (!!a.p.favorite !== !!b.p.favorite) return a.p.favorite ? -1 : 1;
      if (sort === "costo") return cmpDec(b.p.currentCost, a.p.currentCost);
      if (sort === "precio") return cmpDec(b.price, a.price);
      if (sort === "actualizado")
        return b.p.updatedAt.localeCompare(a.p.updatedAt);
      return a.p.name.localeCompare(b.p.name, "es");
    });
    return rows;
  }, [products, filter, sort, cat, query, settings, balances]);

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
        subtitle="Catálogo con fotos, colores, stock y precio."
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
          text="Cargá lo que vendés. Después, registrando compras y gastos, Chediek Home calcula el costo real y te sugiere un precio."
        />
      ) : (
        <>
          <div className="toolbar" role="search">
            <div className="search field">
              <label htmlFor="psearch" className="sr-only">
                Buscar productos
              </label>
              <input
                id="psearch"
                className="input"
                type="search"
                placeholder="Buscar por nombre, código o descripción"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <details
              className="filters"
              open={
                filter !== "activos" || sort !== "nombre" ? true : undefined
              }
            >
              <summary className="btn">
                <Icon name="settings" />
                Filtros{filter !== "activos" || sort !== "nombre" ? " ·" : ""}
              </summary>
              <div className="filters-body">
                <SelectField<Filter>
                  label="Mostrar"
                  value={filter}
                  onChange={(v) => set("filtro", v === "activos" ? "" : v)}
                  options={[
                    { value: "activos", label: "Activos" },
                    { value: "favoritos", label: "Favoritos" },
                    { value: "stock-bajo", label: "Stock bajo" },
                    { value: "todos", label: "Todos (sin archivados)" },
                    { value: "inactivos", label: "Inactivos" },
                    { value: "sin-costo", label: "Sin costo" },
                    { value: "desactualizados", label: "Costo desactualizado" },
                    { value: "archivados", label: "Archivados" },
                  ]}
                />
                <SelectField<Sort>
                  label="Ordenar"
                  value={sort}
                  onChange={(v) => set("orden", v === "nombre" ? "" : v)}
                  options={[
                    { value: "nombre", label: "Nombre" },
                    { value: "precio", label: "Precio (mayor)" },
                    { value: "costo", label: "Costo (mayor)" },
                    { value: "actualizado", label: "Últimos editados" },
                  ]}
                />
              </div>
            </details>
          </div>
          {(categories ?? []).some((c) => !c.archived) && (
            <div className="cat-chips" role="group" aria-label="Categorías">
              <button
                type="button"
                className="cat-chip"
                aria-pressed={!cat}
                onClick={() => set("categoria", "")}
              >
                Todas
              </button>
              {(categories ?? [])
                .filter((c) => !c.archived)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="cat-chip"
                    aria-pressed={cat === c.id}
                    onClick={() => set("categoria", cat === c.id ? "" : c.id)}
                  >
                    {c.name}
                  </button>
                ))}
            </div>
          )}
          <div className="row-between">
            <p className="small muted" aria-live="polite">
              {list.length} producto{list.length === 1 ? "" : "s"}
            </p>
            <div className="seg-mini" role="group" aria-label="Vista">
              <button
                type="button"
                className="btn btn-sm btn-icon"
                aria-pressed={view === "grilla"}
                aria-label="Ver en grilla"
                onClick={() => set("vista", "")}
              >
                <Icon name="grid" />
              </button>
              <button
                type="button"
                className="btn btn-sm btn-icon"
                aria-pressed={view === "lista"}
                aria-label="Ver en lista"
                onClick={() => set("vista", "lista")}
              >
                <Icon name="stack" />
              </button>
            </div>
          </div>
          {list.length === 0 ? (
            <EmptyState
              icon="search"
              title="Sin resultados"
              text="Probá con otra búsqueda o cambiá los filtros."
            />
          ) : view === "grilla" ? (
            <ul className="catalog-grid" aria-label="Catálogo">
              {list.slice(0, limit).map(({ p, price, stock }) => (
                <li key={p.id} className="catalog-card">
                  <Link to={`/productos/${p.id}`} className="catalog-link">
                    <span className="catalog-img">
                      {p.image ? (
                        <img
                          src={p.image}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span aria-hidden="true">
                          {p.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="catalog-body">
                      <span className="title">{p.name}</span>
                      <span className="num catalog-price">
                        {price ? money(price) : "Sin precio"}
                      </span>
                      <span className="catalog-meta">
                        {(p.variants ?? [])
                          .filter(
                            (v, i, a) =>
                              v.colorHex &&
                              a.findIndex((x) => x.colorHex === v.colorHex) ===
                                i,
                          )
                          .slice(0, 6)
                          .map((v) => (
                            <Swatch key={v.id} hex={v.colorHex} size={14} />
                          ))}
                        {stock && (
                          <span
                            className={`badge ${stock.low ? "badge-warn" : ""}`}
                          >
                            {stock.total} u.
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                  <FavoriteButton product={p} />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="list" style={{ marginTop: 8 }}>
              {list.slice(0, limit).map(({ p, price, stock }) => (
                <li key={p.id}>
                  <Link className="list-item" to={`/productos/${p.id}`}>
                    {p.image ? (
                      <img
                        className="thumb"
                        src={p.image}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        width={44}
                        height={44}
                      />
                    ) : (
                      <span className="thumb" aria-hidden="true">
                        {p.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="grow">
                      <div className="title">{p.name}</div>
                      <div className="sub">
                        {[
                          p.favorite ? "♥" : null,
                          p.sku,
                          p.categoryId ? catName.get(p.categoryId) : null,
                          stock ? `Stock ${stock.total}` : null,
                          !p.active ? "Inactivo" : null,
                          p.archived ? "Archivado" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || p.unit}
                      </div>
                    </div>
                    <div className="end">
                      <div className="num" style={{ fontWeight: 650 }}>
                        {price ? (
                          money(price)
                        ) : (
                          <span className="badge badge-warn">Sin precio</span>
                        )}
                      </div>
                      {!prefs.hideInternalByDefault && (
                        <div className="small muted num">
                          {p.currentCost ? (
                            <>
                              <span className="sr-only">Costo interno: </span>
                              Costo {money(p.currentCost)}
                            </>
                          ) : (
                            "Sin costo"
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
            <button
              className="btn btn-block"
              style={{ marginTop: 12 }}
              onClick={() => setLimit((l) => l + PAGE)}
            >
              Mostrar más ({list.length - limit} restantes)
            </button>
          )}
        </>
      )}
    </>
  );
}
