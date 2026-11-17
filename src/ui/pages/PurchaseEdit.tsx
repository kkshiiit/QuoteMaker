import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { newId } from '../../data/defaults';
import { emptyPurchase, savePurchase, setPurchaseVoided } from '../../data/services';
import { itemNet, lotCosts, purchaseRate, purchaseTotals, validatePurchase } from '../../domain/costing';
import { toDec } from '../../domain/money';
import type { Purchase, PurchaseItem } from '../../domain/types';
import { readFileAsDataUrl } from '../../platform/image';
import { Icon } from '../components/Icon';
import { DecimalField, ErrorSummary, InternalLabel, Menu, PageHeader, SelectField, TextField, useConfirm, useToast } from '../components/ui';
import { useMoney, useSettings } from '../hooks';

export default function PurchaseEdit() {
  const { id = 'nueva' } = useParams();
  const [params] = useSearchParams();
  const isNew = id === 'nueva';
  const navigate = useNavigate();
  const toast = useToast();
  const money = useMoney();
  const settings = useSettings();
  const [confirm, confirmNode] = useConfirm();
  const stored = useLiveQuery(async () => (isNew ? null : ((await db.purchases.get(id)) ?? null)), [id]);
  const products = useLiveQuery(() => db.products.filter((p) => !p.archived).toArray(), []);
  const suppliers = useLiveQuery(() => db.suppliers.filter((s) => !s.archived).toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const [form, setForm] = useState<Purchase | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (form) return;
    if (isNew && products) {
      const p = emptyPurchase(settings.currency);
      const pre = params.get('producto');
      const prod = pre ? products.find((x) => x.id === pre) : undefined;
      if (prod) {
        p.supplierId = prod.supplierId;
        p.items = [{ id: newId(), productId: prod.id, quantity: '1', unitPrice: '', discount: '0', unitWeight: prod.unitWeight, unitVolume: prod.unitVolume }];
      }
      setForm(p);
    } else if (stored) setForm(stored);
  }, [isNew, stored, products, form, params, settings.currency]);

  const preview = useMemo(() => {
    if (!form || !expenses) return null;
    const safe = { ...form, items: form.items.filter((i) => i.productId && i.quantity && i.unitPrice !== '') };
    try {
      return lotCosts([safe], expenses);
    } catch {
      return null;
    }
  }, [form, expenses]);

  if (stored === null && !isNew) return <PageHeader title="Compra no encontrada" back={{ to: '/costos/compras', label: 'Compras' }} />;
  if (!form || !products) return <p role="status">Cargando…</p>;

  const set = <K extends keyof Purchase>(k: K, v: Purchase[K]) => setForm({ ...form, [k]: v });
  const setItem = (i: number, patch: Partial<PurchaseItem>) => set('items', form.items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const addItem = () => set('items', [...form.items, { id: newId(), productId: '', quantity: '1', unitPrice: '', discount: '0', unitWeight: '0', unitVolume: '0' }]);
  const totals = (() => {
    try {
      return purchaseTotals({ ...form, items: form.items.map((i) => ({ ...i, quantity: i.quantity || '0', unitPrice: i.unitPrice || '0', discount: i.discount || '0' })) });
    } catch {
      return null;
    }
  })();
  const productName = (pid: string) => products.find((p) => p.id === pid)?.name ?? '';

  const onSave = async () => {
    const errs = validatePurchase(form, settings.currency);
    setErrors(errs);
    if (errs.length) return;
    await savePurchase(form);
    toast('Compra guardada. Costos actualizados.');
    navigate('/costos/compras');
  };

  const toggleVoid = async () => {
    if (!form.voided && !(await confirm('Anular compra', 'La compra deja de aportar costo. Los gastos asignados a ella quedarán marcados para reasignar. El historial de costos se conserva.', 'Anular', true))) return;
    await setPurchaseVoided(form, !form.voided);
    toast(form.voided ? 'Compra restaurada' : 'Compra anulada');
    navigate('/costos/compras');
  };

  return (
    <>
      <PageHeader
        title={isNew ? 'Registrar compra' : 'Compra'}
        subtitle={form.voided ? 'Anulada' : <InternalLabel />}
        back={{ to: '/costos/compras', label: 'Compras' }}
        actions={
          !isNew && (
            <Menu label="Más acciones de la compra">
              <Link to={`/costos/gastos/nuevo?compra=${form.id}`}>
                <Icon name="wallet" />
                Agregar gasto a esta compra
              </Link>
              <button onClick={toggleVoid}>
                <Icon name={form.voided ? 'refresh' : 'archive'} />
                {form.voided ? 'Restaurar compra' : 'Anular compra'}
              </button>
            </Menu>
          )
        }
      />
      <ErrorSummary errors={errors} />
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void onSave();
        }}
      >
        <section className="card">
          <h2>Datos de la compra</h2>
          <div className="form-grid cols-3">
            <SelectField<string>
              label="Proveedor"
              value={form.supplierId ?? ''}
              onChange={(v) => set('supplierId', v || null)}
              options={[{ value: '', label: 'Sin proveedor' }, ...(suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))]}
              hint={<Link to="/proveedores/nuevo">Agregar proveedor</Link>}
            />
            <TextField label="Fecha" type="date" required value={form.date} onChange={(v) => set('date', v)} />
            <TextField label="N.º o referencia" value={form.reference} onChange={(v) => set('reference', v)} hint="Factura, remito…" />
            <TextField
              label="Moneda"
              value={form.currency}
              onChange={(v) => {
                const c = v.toUpperCase().slice(0, 3);
                setForm({ ...form, currency: c, exchangeRate: c === settings.currency ? '1' : form.exchangeRate === '1' ? '' : form.exchangeRate });
              }}
              hint="Código ISO (ARS, USD…)"
            />
            {form.currency !== settings.currency && (
              <DecimalField
                label={`Tipo de cambio (${settings.currency} por 1 ${form.currency || '?'})`}
                required
                value={form.exchangeRate ?? ''}
                onChange={(v) => set('exchangeRate', v)}
                hint={`Los costos se calculan en ${settings.currency}.`}
              />
            )}
          </div>
        </section>

        <section className="card" aria-labelledby="arts">
          <div className="card-header">
            <h2 id="arts">Artículos</h2>
            <button type="button" className="btn btn-sm" onClick={addItem}>
              <Icon name="plus" />
              Agregar artículo
            </button>
          </div>
          {form.items.length === 0 && <p className="muted">Agregá los productos comprados.</p>}
          <div className="stack">
            {form.items.map((it, i) => {
              const lot = preview?.get(`${form.id}:${it.id}`);
              return (
                <fieldset key={it.id} className="item-row" style={{ gridTemplateColumns: undefined }}>
                  <legend className="sr-only">Artículo {i + 1}</legend>
                  <SelectField<string>
                    label="Producto"
                    value={it.productId}
                    onChange={(v) => {
                      const p = products.find((x) => x.id === v);
                      setItem(i, { productId: v, unitWeight: p?.unitWeight ?? '0', unitVolume: p?.unitVolume ?? '0' });
                    }}
                    options={[{ value: '', label: 'Elegí un producto…' }, ...products.map((p) => ({ value: p.id, label: p.name }))]}
                  />
                  <DecimalField label="Cantidad" value={it.quantity} onChange={(v) => setItem(i, { quantity: v })} />
                  <DecimalField label="Precio unit." prefix="$" value={it.unitPrice} onChange={(v) => setItem(i, { unitPrice: v })} />
                  <DecimalField label="Desc. $" value={it.discount} onChange={(v) => setItem(i, { discount: v || '0' })} />
                  <div className="field">
                    <span className="label">Costo real c/u</span>
                    <span className="num" style={{ minHeight: 44, display: 'flex', alignItems: 'center' }} aria-live="polite">
                      {lot ? money(lot.unitCost) : '—'}
                    </span>
                  </div>
                  <button type="button" className="btn btn-icon btn-ghost" aria-label={`Quitar ${productName(it.productId) || `artículo ${i + 1}`}`} onClick={() => set('items', form.items.filter((_, j) => j !== i))}>
                    <Icon name="trash" />
                  </button>
                  {it.productId && (
                    <p className="small muted" style={{ gridColumn: '1 / -1' }}>
                      Neto del renglón: {money(itemNet({ ...it, quantity: it.quantity || '0', unitPrice: it.unitPrice || '0', discount: it.discount || '0' }))}
                      {lot && lot.expensesTotal.gt(0) ? ` · Gastos asignados: ${money(lot.expensesTotal)}` : ''}
                    </p>
                  )}
                </fieldset>
              );
            })}
          </div>
        </section>

        <section className="card">
          <h2>Totales de la factura</h2>
          <div className="form-grid cols-2">
            <DecimalField label="Descuento general" prefix="$" value={form.discount} onChange={(v) => set('discount', v || '0')} hint="Se reparte entre artículos según su valor." />
            <DecimalField label="Cargos adicionales" prefix="$" value={form.extraCharges} onChange={(v) => set('extraCharges', v || '0')} hint="Recargos de la misma factura. Se reparten según valor." />
          </div>
          {totals && (
            <dl className="dl" style={{ marginTop: 14 }}>
              <dt>Artículos</dt>
              <dd>{money(totals.itemsNet)}</dd>
              <dt className="total">Total de la compra{form.currency !== settings.currency ? ` (${form.currency})` : ''}</dt>
              <dd className="total">{form.currency !== settings.currency ? `${form.currency} ${toDec(totals.total)}` : money(totals.total)}</dd>
              {form.currency !== settings.currency && form.exchangeRate && Number.isFinite(Number(form.exchangeRate)) && (
                <>
                  <dt>Equivalente en {settings.currency}</dt>
                  <dd>{money(totals.total.times(purchaseRate(form)))}</dd>
                </>
              )}
            </dl>
          )}
        </section>

        <section className="card">
          <h2>Notas y comprobante</h2>
          <TextField label="Notas privadas" multiline value={form.notes} onChange={(v) => set('notes', v)} />
          <div className="row" style={{ marginTop: 12 }}>
            <label className="btn">
              <Icon name="upload" />
              {form.attachment ? 'Reemplazar comprobante' : 'Adjuntar comprobante'}
              <input
                type="file"
                className="sr-only"
                accept="image/*,application/pdf"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    set('attachment', { name: f.name, type: f.type, dataUrl: await readFileAsDataUrl(f, 900 * 1024) });
                  } catch (err) {
                    toast((err as Error).message, 'error');
                  }
                }}
              />
            </label>
            {form.attachment && (
              <>
                <a className="btn btn-ghost" href={form.attachment.dataUrl} download={form.attachment.name}>
                  <Icon name="download" />
                  {form.attachment.name}
                </a>
                <button type="button" className="btn btn-ghost" onClick={() => set('attachment', null)}>
                  Quitar
                </button>
              </>
            )}
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>Imagen o PDF de hasta 900 KB.</p>
        </section>

        <div className="sticky-actions actions">
          <button className="btn btn-primary" type="submit" disabled={form.voided}>
            <Icon name="check" />
            Guardar compra
          </button>
          <Link className="btn btn-ghost" to="/costos/compras">
            Cancelar
          </Link>
        </div>
      </form>
      {confirmNode}
    </>
  );
}
