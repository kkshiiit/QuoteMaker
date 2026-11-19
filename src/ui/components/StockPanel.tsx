/**
 * Variantes (color / talle) y stock de un producto. Los movimientos se registran al instante
 * (no dependen de «Guardar producto»); las variantes sí se guardan con el producto.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../../data/db';
import { newId } from '../../data/defaults';
import { addStockMove, adjustStockTo } from '../../data/services';
import { D, type Dec } from '../../domain/money';
import { COLOR_PRESETS, nearestColorName, productStock, SIZE_PRESETS, variantLabel } from '../../domain/stock';
import { STOCK_MOVE_LABELS, type Product, type ProductVariant, type StockMoveKind } from '../../domain/types';
import { useStockBalances } from '../hooks';
import { Icon } from './Icon';
import { Check, DecimalField, Dialog, InternalLabel, SelectField, TextField, useToast } from './ui';

type MoveKind = Exclude<StockMoveKind, 'sale'>;

export function Swatch({ hex, label, size = 22 }: { hex: string; label?: string; size?: number }) {
  return (
    <span className="cswatch" style={{ background: hex || 'transparent', width: size, height: size }} aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label} />
  );
}

export function StockPanel({ form, saved, onChange }: { form: Product; saved: Product | null; onChange: (patch: Partial<Product>) => void }) {
  const toast = useToast();
  const listId = useId();
  const balances = useStockBalances(form.id);
  const moves = useLiveQuery(() => db.stockMoves.where('productId').equals(form.id).reverse().sortBy('at'), [form.id]);
  const [moving, setMoving] = useState<{
    variantId: string;
    label: string;
  } | null>(null);
  const [kind, setKind] = useState<MoveKind>('in');
  const [qty, setQty] = useState<Dec | ''>('');
  const [reason, setReason] = useState('');
  const variants = form.variants ?? [];
  const stock = productStock(form, balances ?? new Map());
  const savedIds = new Set([...(saved?.variants ?? []).map((v) => v.id), '']);
  const canMove = !!saved;

  const setVariant = (i: number, patch: Partial<ProductVariant>) =>
    onChange({
      variants: variants.map((v, j) => (j === i ? { ...v, ...patch } : v)),
    });
  const addVariant = (patch: Partial<ProductVariant> = {}) =>
    onChange({
      variants: [...variants, { id: newId(), color: '', colorHex: '', size: '', ...patch }],
    });
  const label = (v: ProductVariant | undefined) => variantLabel(v) || 'Variante';

  const submitMove = async () => {
    if (!moving || qty === '') return;
    const n = D(qty);
    if (!n.eq(n.round(0, 0)) || n.lt(0)) return toast('Ingresá una cantidad entera (unidades).', 'error');
    if (kind === 'adjust') await adjustStockTo(form.id, moving.variantId, qty, reason || 'Ajuste por conteo');
    else {
      if (n.eq(0)) return toast('La cantidad debe ser mayor que 0.', 'error');
      await addStockMove(form.id, moving.variantId, kind === 'loss' ? `-${qty}` : qty, kind, reason || STOCK_MOVE_LABELS[kind]);
    }
    toast(`Stock actualizado: ${moving.label}`);
    setMoving(null);
  };

  return (
    <section className="card" aria-labelledby="sec-stock">
      <div className="card-header">
        <h2 id="sec-stock">Colores, talles y stock</h2>
        {form.trackStock && (
          <span className={`badge ${stock.low ? 'badge-warn' : 'badge-accent'}`} data-testid="stock-total">
            {stock.total} u. en total
          </span>
        )}
      </div>

      <h3 className="small" style={{ margin: '0 0 6px' }}>
        Variantes
      </h3>
      <p className="small muted" style={{ marginTop: 0 }}>
        Agregá un color tocando una muestra, o escribí un color y talle propios. Cada combinación tiene su propio stock.
      </p>
      <div className="cswatch-row" role="group" aria-label="Agregar color">
        {COLOR_PRESETS.map((c) => (
          <button key={c.name} type="button" className="cswatch-btn" aria-label={`Agregar color ${c.name}`} title={c.name} onClick={() => addVariant({ color: c.name, colorHex: c.hex })}>
            <Swatch hex={c.hex} />
          </button>
        ))}
      </div>
      <datalist id={`${listId}-colors`}>
        {COLOR_PRESETS.map((c) => (
          <option key={c.name} value={c.name} />
        ))}
      </datalist>
      <datalist id={`${listId}-sizes`}>
        {Object.values(SIZE_PRESETS)
          .flat()
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>

      {variants.length > 0 && (
        <ul className="variant-list">
          {variants.map((v, i) => {
            const line = stock.lines.find((l) => l.variantId === v.id);
            return (
              <li key={v.id} className="variant-row">
                <label className="cswatch-picker" title="Elegir color de muestra">
                  <Swatch hex={v.colorHex || '#ffffff'} />
                  <input
                    type="color"
                    className="sr-only"
                    aria-label={`Color de muestra de la variante ${i + 1}`}
                    value={v.colorHex || '#ffffff'}
                    onChange={(e) =>
                      setVariant(i, {
                        colorHex: e.target.value,
                        color: v.color || nearestColorName(e.target.value),
                      })
                    }
                  />
                </label>
                <div className="field">
                  <label htmlFor={`${v.id}-c`}>Color</label>
                  <input
                    id={`${v.id}-c`}
                    className="input"
                    list={`${listId}-colors`}
                    value={v.color}
                    maxLength={40}
                    onChange={(e) => {
                      const preset = COLOR_PRESETS.find((c) => c.name.toLocaleLowerCase('es') === e.target.value.trim().toLocaleLowerCase('es'));
                      setVariant(i, {
                        color: e.target.value,
                        ...(preset && !v.colorHex ? { colorHex: preset.hex } : {}),
                      });
                    }}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`${v.id}-s`}>Talle / medida</label>
                  <input id={`${v.id}-s`} className="input" list={`${listId}-sizes`} value={v.size} maxLength={30} onChange={(e) => setVariant(i, { size: e.target.value })} />
                </div>
                {form.trackStock && (
                  <div className="variant-stock">
                    <span className={`num ${line?.low ? 'warn-text' : ''}`} aria-label={`Stock de ${label(v)}`}>
                      {line?.qty ?? '0'} u.
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={!canMove || !savedIds.has(v.id)}
                      title={!savedIds.has(v.id) ? 'Guardá el producto para cargar stock de esta variante' : undefined}
                      onClick={() => {
                        setMoving({ variantId: v.id, label: label(v) });
                        setKind('in');
                        setQty('');
                        setReason('');
                      }}
                    >
                      Stock de {label(v)}
                    </button>
                  </div>
                )}
                <button type="button" className="btn btn-icon btn-ghost" aria-label={`Quitar variante ${label(v)}`} onClick={() => onChange({ variants: variants.filter((_, j) => j !== i) })}>
                  <Icon name="trash" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="actions" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-sm" onClick={() => addVariant()}>
          <Icon name="plus" />
          Agregar variante
        </button>
      </div>

      <hr className="sep" />
      <Check
        label="Controlar stock de este producto"
        checked={!!form.trackStock}
        onChange={(v) => onChange({ trackStock: v })}
        hint="Al vender o confirmar un pedido se descuenta solo; al cancelarlo vuelve."
      />
      {form.trackStock && (
        <div className="form-grid cols-2" style={{ marginTop: 10 }}>
          <DecimalField label="Avisar con stock bajo" suffix="u." value={form.lowStockAt ?? ''} onChange={(v) => onChange({ lowStockAt: v || null })} hint="Vacío = sin aviso." />
          {variants.length === 0 && (
            <div className="field">
              <span className="label">Stock</span>
              <div className="row">
                <span className="num" style={{ fontWeight: 650 }} aria-label="Stock disponible">
                  {stock.total} u.
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!canMove}
                  onClick={() => {
                    setMoving({
                      variantId: '',
                      label: form.name || 'producto',
                    });
                    setKind('in');
                    setQty('');
                    setReason('');
                  }}
                >
                  Ingresar o ajustar stock
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {form.trackStock && !canMove && <p className="small muted">Guardá el producto para cargar el stock.</p>}

      {form.trackStock && moves && moves.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary>
            <strong>Movimientos de stock</strong> <InternalLabel text="Interno" />
          </summary>
          <table className="stack-table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Variante</th>
                <th>Motivo</th>
                <th className="num">Cant.</th>
              </tr>
            </thead>
            <tbody>
              {moves.slice(0, 30).map((m) => (
                <tr key={m.id}>
                  <td data-label="Fecha">{new Date(m.at).toLocaleDateString('es-AR')}</td>
                  <td data-label="Variante">{m.variantId ? label(variants.find((v) => v.id === m.variantId)) : '—'}</td>
                  <td data-label="Motivo">
                    {STOCK_MOVE_LABELS[m.kind]}
                    {m.reason && m.reason !== STOCK_MOVE_LABELS[m.kind] && <div className="small muted">{m.reason}</div>}
                  </td>
                  <td data-label="Cant." className={`num ${D(m.qty).lt(0) ? 'danger-text' : ''}`}>
                    {D(m.qty).gt(0) ? `+${m.qty}` : m.qty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {createPortal(
        <Dialog
          open={!!moving}
          onClose={() => setMoving(null)}
          title={`Stock · ${moving?.label ?? ''}`}
          actions={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setMoving(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void submitMove()} disabled={qty === ''}>
                Registrar
              </button>
            </>
          }
        >
          <p className="small muted" style={{ marginTop: 0 }}>
            Disponible ahora: <strong>{moving ? (stock.lines.find((l) => l.variantId === moving.variantId)?.qty ?? stock.total) : '0'} u.</strong>
          </p>
          <div className="stack">
            <SelectField<MoveKind>
              label="Tipo de movimiento"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'in', label: 'Ingreso (entra mercadería)' },
                { value: 'adjust', label: 'Ajuste por conteo (dejar en…)' },
                { value: 'loss', label: 'Rotura o pérdida (sale)' },
                { value: 'return', label: 'Devolución de cliente (entra)' },
              ]}
            />
            <DecimalField
              label={kind === 'adjust' ? 'Cantidad contada' : 'Cantidad'}
              suffix="u."
              value={qty}
              onChange={setQty}
              hint={kind === 'adjust' ? 'El stock queda exactamente en este número.' : undefined}
            />
            <TextField label="Motivo (opcional)" value={reason} onChange={setReason} maxLength={120} hint="Interno." />
          </div>
        </Dialog>,
        document.body,
      )}
    </section>
  );
}
