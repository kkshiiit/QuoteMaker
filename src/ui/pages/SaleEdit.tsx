import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { newId } from '../../data/defaults';
import { emptySale, saleFromQuote, saveSale, setSaleCancelled, suggestedPrice } from '../../data/services';
import { D } from '../../domain/money';
import { computeSaleTotals, validateSale } from '../../domain/sales';
import { ONLINE_PLATFORMS, PAYMENT_METHODS, type Sale, type SaleItem } from '../../domain/types';
import { Icon } from '../components/Icon';
import { DecimalField, ErrorSummary, InternalLabel, Menu, PageHeader, Segmented, SelectField, TextField, useConfirm, useToast } from '../components/ui';
import { useMoney, usePrefs, useSettings } from '../hooks';
import { ProductPicker } from './QuoteEdit';
import { CustomerPicker } from './Quotes';
import { ChannelBadge } from './Sales';

/** Cada dirección (/…/nueva, /…/:id) monta un formulario nuevo: nunca arrastra datos de otra ficha. */
export default function SaleEdit() {
  const { id = '' } = useParams();
  return <SaleEditForm key={id} />;
}

function SaleEditForm() {
  const { id = 'nueva' } = useParams();
  const isNew = id === 'nueva';
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const money = useMoney();
  const settings = useSettings();
  const [prefs] = usePrefs();
  const [confirm, confirmNode] = useConfirm();
  const stored = useLiveQuery(async () => (isNew ? null : ((await db.sales.get(id)) ?? null)), [id]);
  const [form, setForm] = useState<Sale | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const hideInternal = prefs.hideInternalByDefault;

  useEffect(() => {
    if (form) return;
    if (!isNew) {
      if (stored) setForm(stored);
      return;
    }
    const quoteId = params.get('presupuesto');
    const customerId = params.get('cliente');
    void (async () => {
      if (quoteId) {
        const q = await db.quotes.get(quoteId);
        if (q) return setForm(saleFromQuote(q));
      }
      const base = emptySale();
      if (customerId) {
        const c = await db.customers.get(customerId);
        if (c) return setForm({ ...base, customerId: c.id, customerName: c.name });
      }
      setForm(base);
    })();
  }, [isNew, stored, form, params]);

  const totals = useMemo(() => {
    if (!form) return null;
    const items = form.items.map((it) => ({ ...it, quantity: it.quantity || '0', unitPrice: it.unitPrice || '0', discountPct: it.discountPct || '0' }));
    return computeSaleTotals({ items, globalDiscountPct: form.globalDiscountPct || '0', taxPct: form.taxPct || '0', shippingCharged: form.shippingCharged || '0' });
  }, [form]);

  if (stored === null && !isNew) return <PageHeader title="Venta no encontrada" back={{ to: '/ventas', label: 'Ventas' }} />;
  if (!form || !totals) return <p role="status">Cargando…</p>;

  const update = (patch: Partial<Sale> | ((s: Sale) => Partial<Sale>)) => setForm((f) => (f ? { ...f, ...(typeof patch === 'function' ? patch(f) : patch) } : f));
  const setItem = (i: number, patch: Partial<SaleItem>) => update((s) => ({ items: s.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));

  const onSave = async () => {
    const errs = validateSale(form);
    setErrors(errs);
    if (errs.length) return;
    const saved = await saveSale(form);
    setForm(saved);
    toast(isNew ? `Venta ${saved.number} registrada` : 'Venta guardada');
    if (isNew) navigate(`/ventas/${saved.id}`, { replace: true });
  };

  const toggleCancel = async () => {
    if (!form.cancelled && !(await confirm('Anular venta', 'La venta queda en el historial marcada como anulada y deja de sumar en los totales. Podés restaurarla.', 'Anular'))) return;
    const saved = await setSaleCancelled(form, !form.cancelled);
    setForm(saved);
    toast(saved.cancelled ? 'Venta anulada' : 'Venta restaurada');
  };

  return (
    <>
      <PageHeader
        title={isNew ? 'Registrar venta' : `Venta ${form.number}`}
        back={{ to: '/ventas', label: 'Ventas' }}
        subtitle={
          !isNew && (
            <span className="row">
              <ChannelBadge channel={form.channel} platform={form.platform} />
              {form.cancelled && <span className="badge badge-warn">Anulada</span>}
            </span>
          )
        }
        actions={
          !isNew && (
            <Menu label="Más acciones de la venta">
              <button onClick={toggleCancel}>
                <Icon name="archive" />
                {form.cancelled ? 'Restaurar venta' : 'Anular venta'}
              </button>
              {form.quoteId && (
                <Link to={`/presupuestos/${form.quoteId}`}>
                  <Icon name="file" />
                  Ver presupuesto de origen
                </Link>
              )}
            </Menu>
          )
        }
      />
      <ErrorSummary errors={errors} />
      <div className="grid grid-main-aside">
        <form
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
        >
          <section className="card stack" aria-labelledby="sv-where">
            <h2 id="sv-where">¿Dónde se vendió?</h2>
            <Segmented<Sale['channel']>
              legend="Canal de venta"
              value={form.channel}
              onChange={(v) => update({ channel: v, platform: v === 'online' ? form.platform || 'WhatsApp' : '' })}
              options={[
                { value: 'presencial', label: 'Presencial en el local' },
                { value: 'online', label: 'Online' },
              ]}
            />
            <div className="form-grid cols-2">
              {form.channel === 'online' && (
                <SelectField<string> label="Plataforma" value={form.platform} onChange={(v) => update({ platform: v })} options={ONLINE_PLATFORMS.map((p) => ({ value: p, label: p }))} />
              )}
              <TextField label="Fecha" type="date" value={form.date} onChange={(v) => update({ date: v })} />
              <SelectField<string> label="Forma de pago" value={form.paymentMethod} onChange={(v) => update({ paymentMethod: v })} options={PAYMENT_METHODS.map((p) => ({ value: p, label: p }))} />
            </div>
          </section>

          <section className="card" aria-labelledby="sv-cli">
            <div className="card-header">
              <h2 id="sv-cli">Cliente</h2>
              <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}>
                {form.customerId ? 'Cambiar' : 'Elegir cliente'}
              </button>
            </div>
            <TextField
              label="Nombre del cliente"
              value={form.customerName}
              onChange={(v) => update({ customerName: v, customerId: null })}
              hint={form.customerId ? 'Cliente registrado. Si escribís otro nombre, la venta queda sin cliente asociado.' : 'Vacío = consumidor final. Elegí un cliente registrado para verlo en su historial.'}
            />
          </section>

          <section className="card" aria-labelledby="sv-it">
            <div className="card-header">
              <h2 id="sv-it">Productos vendidos</h2>
              <div className="actions">
                <button type="button" className="btn btn-sm" onClick={() => setAdding(true)}>
                  <Icon name="box" />
                  Agregar producto
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => update((s) => ({ items: [...s.items, { id: newId(), productId: null, description: '', unit: 'u', quantity: '1', unitPrice: '', discountPct: '0', unitCost: '0' }] }))}
                >
                  <Icon name="plus" />
                  Concepto libre
                </button>
              </div>
            </div>
            {form.items.length === 0 && <p className="muted">Agregá los productos que se vendieron. El costo de cada uno queda guardado para calcular la ganancia.</p>}
            <div className="stack">
              {form.items.map((it, i) => (
                <fieldset key={it.id} className="item-row">
                  <legend className="sr-only">Renglón {i + 1}</legend>
                  <TextField label="Descripción" value={it.description} onChange={(v) => setItem(i, { description: v })} />
                  <DecimalField label="Cant." value={it.quantity} onChange={(v) => setItem(i, { quantity: v })} />
                  <DecimalField label="Precio unit." prefix="$" value={it.unitPrice} onChange={(v) => setItem(i, { unitPrice: v })} />
                  <DecimalField label="Desc." suffix="%" value={it.discountPct === '0' ? '' : it.discountPct} onChange={(v) => setItem(i, { discountPct: v || '0' })} />
                  <div className="field">
                    <span className="label">Importe</span>
                    <span className="num" style={{ minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 650 }}>
                      {money(totals.commercial.lines[i]?.net ?? '0')}
                    </span>
                  </div>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <button type="button" className="btn btn-icon btn-ghost" aria-label={`Quitar renglón ${i + 1}`} onClick={() => update((s) => ({ items: s.items.filter((_, j) => j !== i) }))}>
                      <Icon name="trash" />
                    </button>
                  </div>
                </fieldset>
              ))}
            </div>
          </section>

          <section className="card" aria-labelledby="sv-cond">
            <h2 id="sv-cond">Descuentos y envío</h2>
            <div className="form-grid cols-3">
              <DecimalField label="Descuento general" suffix="%" value={form.globalDiscountPct === '0' ? '' : form.globalDiscountPct} onChange={(v) => update({ globalDiscountPct: v || '0' })} />
              <DecimalField label={settings.taxLabel || 'Impuesto'} suffix="%" value={form.taxPct === '0' ? '' : (form.taxPct ?? '')} onChange={(v) => update({ taxPct: v || '0' })} hint="Vacío si el precio ya es final." />
              <DecimalField label="Envío cobrado" prefix="$" value={form.shippingCharged === '0' ? '' : form.shippingCharged} onChange={(v) => update({ shippingCharged: v || '0' })} />
            </div>
          </section>

          {!hideInternal && (
            <section className="card" aria-labelledby="sv-int">
              <div className="card-header">
                <h2 id="sv-int">Notas internas</h2>
                <InternalLabel />
              </div>
              <TextField label="Notas" multiline value={form.notes} onChange={(v) => update({ notes: v })} hint="Sólo para vos." />
            </section>
          )}

          <div className="sticky-actions actions">
            <button className="btn btn-primary" type="submit">
              <Icon name="check" />
              {isNew ? 'Registrar venta' : 'Guardar venta'}
            </button>
            <Link className="btn btn-ghost" to="/ventas">
              Cancelar
            </Link>
          </div>
        </form>

        <aside className="stack" aria-label="Totales de la venta">
          <section className="card">
            <h2>Total cobrado</h2>
            <dl className="dl">
              <dt>Subtotal</dt>
              <dd>{money(totals.commercial.subtotal)}</dd>
              {totals.commercial.globalDiscount !== '0.00' && (
                <>
                  <dt>Descuento</dt>
                  <dd>−{money(totals.commercial.globalDiscount)}</dd>
                </>
              )}
              {totals.commercial.tax !== '0.00' && (
                <>
                  <dt>{settings.taxLabel}</dt>
                  <dd>{money(totals.commercial.tax)}</dd>
                </>
              )}
              {totals.commercial.shipping !== '0.00' && (
                <>
                  <dt>Envío</dt>
                  <dd>{money(totals.commercial.shipping)}</dd>
                </>
              )}
              <dt className="total">Total</dt>
              <dd className="total" data-testid="sale-total">
                {money(totals.total)}
              </dd>
            </dl>
          </section>
          {!hideInternal && (
            <section className="card">
              <div className="card-header">
                <h2>Ganancia</h2>
                <InternalLabel text="Interno" />
              </div>
              <dl className="dl">
                <dt>Costo de mercadería</dt>
                <dd>{money(totals.cost)}</dd>
                <dt className="total">Ganancia</dt>
                <dd className={`total ${D(totals.profit).lt(0) ? 'danger-text' : ''}`} data-testid="sale-profit">
                  {money(totals.profit)}
                </dd>
              </dl>
              {form.items.some((it) => D(it.unitCost || '0').lte(0)) && <p className="warn-text small" style={{ marginTop: 8 }}>Hay renglones sin costo: la ganancia está sobreestimada.</p>}
            </section>
          )}
        </aside>
      </div>

      <CustomerPicker
        open={picking}
        title="¿A quién le vendiste?"
        noneLabel="Consumidor final"
        onClose={() => setPicking(false)}
        onPick={(c) => {
          setPicking(false);
          update({ customerId: c?.id ?? null, customerName: c?.name ?? '' });
        }}
      />
      <ProductPicker
        open={adding}
        onClose={() => setAdding(false)}
        onPick={(item) => {
          update((s) => ({ items: [...s.items, { ...item, description: item.description.split(' — ')[0] ?? item.description }] }));
          setAdding(false);
        }}
        suggested={(p) => suggestedPrice(p, settings)}
      />
      {confirmNode}
    </>
  );
}
