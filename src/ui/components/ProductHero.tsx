/**
 * Cabecera visual de la ficha de producto (como el diseño de referencia): foto grande con
 * puntos, nombre, descripción, precio, stock, colores con nombre, talles en cápsulas y
 * gestión rápida de inventario (− / + y «Ingresar stock»).
 */
import { useMemo, useState } from 'react';
import { addStockMove, adjustStockTo } from '../../data/services';
import { D, type Dec } from '../../domain/money';
import { productStock, stockKey, variantLabel } from '../../domain/stock';
import type { Product } from '../../domain/types';
import { useMoney, useStockBalances } from '../hooks';
import { Icon } from './Icon';
import { productPhotos } from './ShareProduct';
import { Swatch } from './StockPanel';
import { InternalLabel, useToast } from './ui';

export function ProductHero({ product, price, suggested, hideInternal }: { product: Product; price: Dec | null; suggested: Dec | null; hideInternal: boolean }) {
  const money = useMoney();
  const toast = useToast();
  const balances = useStockBalances(product.id);
  const photos = productPhotos(product);
  const [slide, setSlide] = useState(0);
  const variants = product.variants ?? [];
  const colors = useMemo(() => {
    const seen = new Map<string, { color: string; hex: string }>();
    for (const v of variants) if (v.color.trim() && !seen.has(v.color.trim().toLocaleLowerCase('es'))) seen.set(v.color.trim().toLocaleLowerCase('es'), { color: v.color.trim(), hex: v.colorHex });
    return [...seen.values()];
  }, [variants]);
  const [color, setColor] = useState(colors[0]?.color ?? '');
  const sizes = [...new Set(variants.filter((v) => !colors.length || v.color.trim() === color).map((v) => v.size.trim()).filter(Boolean))];
  const [size, setSize] = useState(sizes[0] ?? '');
  const selected = variants.find((v) => (!colors.length || v.color.trim() === color) && (!sizes.length || v.size.trim() === (sizes.includes(size) ? size : sizes[0]))) ?? null;
  const vId = variants.length ? (selected?.id ?? null) : '';
  const stock = productStock(product, balances ?? new Map());
  const current = vId === null ? null : (balances?.get(stockKey(product.id, vId)) ?? '0');
  const [target, setTarget] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<string | null>(null);
  const shown = target ?? current ?? '0';

  const pickPhoto = (i: number) => {
    setSlide(i);
    document.getElementById(`hero-ph-${product.id}-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  };

  return (
    <section className="card product-hero" aria-label="Resumen del producto">
      <div className="hero-media">
        {photos.length ? (
          <>
            <div className="hero-track" onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
              {photos.map((ph, i) => (
                <img key={i} id={`hero-ph-${product.id}-${i}`} src={ph} alt={`Foto ${i + 1} de ${product.name}`} />
              ))}
            </div>
            {photos.length > 1 && (
              <div className="hero-dots" role="group" aria-label="Fotos">
                {photos.map((_, i) => (
                  <button key={i} type="button" aria-label={`Ver foto ${i + 1}`} aria-pressed={slide === i} onClick={() => pickPhoto(i)} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="hero-empty" aria-hidden="true">
            <Icon name="image" />
            <span>Agregá fotos más abajo</span>
          </div>
        )}
      </div>
      {product.description && <p className="muted hero-desc">{product.description}</p>}
      <div className="hero-row">
        <span className="hero-price num">{price ? money(price) : 'Sin precio'}</span>
        {product.trackStock && (
          <span className={`hero-stock ${stock.low ? 'low' : ''}`}>
            <Icon name="box" /> Stock: {stock.total} unidades
          </span>
        )}
      </div>

      {colors.length > 0 && (
        <div className="hero-block">
          <div className="row-between">
            <h3>Color</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => document.getElementById('sec-stock')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              Editar colores <Icon name="edit" />
            </button>
          </div>
          <div className="hero-colors" role="radiogroup" aria-label="Color">
            {colors.map((c) => (
              <button key={c.color} type="button" role="radio" aria-checked={color === c.color} className="hero-color" onClick={() => {
                setColor(c.color);
                setTarget(null);
              }}>
                <Swatch hex={c.hex || '#ffffff'} size={34} />
                <span>{c.color}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {sizes.length > 0 && (
        <div className="hero-block">
          <h3>Tamaño</h3>
          <div className="hero-sizes" role="radiogroup" aria-label="Tamaño">
            {sizes.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={(sizes.includes(size) ? size : sizes[0]) === s} className="hero-size" onClick={() => {
                setSize(s);
                setTarget(null);
              }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {product.trackStock && vId !== null && (
        <div className="hero-block">
          <h3>
            Gestión de inventario{selected ? ` · ${variantLabel(selected)}` : ''}
          </h3>
          <div className="hero-inv">
            <div className="stepper" role="group" aria-label="Ajustar stock">
              <span className="small">Ajustar stock</span>
              <button type="button" className="btn btn-icon btn-sm" aria-label="Una unidad menos" onClick={() => setTarget(D(shown).minus(1).toFixed(0))}>
                <Icon name="minus" />
              </button>
              <output className="num" aria-live="polite" aria-label="Stock">
                {shown}
              </output>
              <button type="button" className="btn btn-icon btn-sm" aria-label="Una unidad más" onClick={() => setTarget(D(shown).plus(1).toFixed(0))}>
                <Icon name="plus" />
              </button>
            </div>
            {target !== null && target !== current ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  await adjustStockTo(product.id, vId, D(target).lt(0) ? '0' : target, 'Ajuste rápido');
                  setTarget(null);
                  toast('Stock ajustado');
                }}
              >
                Guardar ajuste ({target})
              </button>
            ) : incoming === null ? (
              <button type="button" className="btn btn-sm" onClick={() => setIncoming('')}>
                <Icon name="plus" />
                Ingresar stock
              </button>
            ) : (
              <span className="row" style={{ flexWrap: 'nowrap' }}>
                <label htmlFor="hero-in" className="sr-only">
                  Unidades que entran
                </label>
                <input id="hero-in" className="input" inputMode="numeric" style={{ width: 80 }} value={incoming} autoFocus onChange={(e) => setIncoming(e.target.value.replace(/\D/g, ''))} placeholder="0" />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!incoming || incoming === '0'}
                  onClick={async () => {
                    await addStockMove(product.id, vId, incoming, 'in', 'Ingreso');
                    toast(`Entraron ${incoming} unidades`);
                    setIncoming(null);
                  }}
                >
                  Registrar
                </button>
              </span>
            )}
          </div>
        </div>
      )}

      {!hideInternal && suggested && (
        <div className="hero-suggest">
          <Icon name="tag" />
          <div className="grow">
            <strong className="hero-price-sm">Precio sugerido: {money(suggested)}</strong>
            <div className="small muted">Basado en el costo real, tus gastos y el margen objetivo.</div>
          </div>
          <InternalLabel text="Interno" />
        </div>
      )}
    </section>
  );
}
