import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { newId } from '../../data/defaults';
import { emptySale, saleFromQuote, saveSale, setSaleCancelled, suggestedPrice } from '../../data/services';
import { D } from '../../domain/money';
import { computeSaleTotals, salePayments, saleStatus, validateSale } from '../../domain/sales';
import { stockBalances, stockShortages, variantLabel } from '../../domain/stock';
import { ONLINE_PLATFORMS, ORDER_STATUS_LABELS, PAYMENT_METHODS, type OrderStatus, type Product, type Sale, type SaleDelivery, type SaleItem } from '../../domain/types';
import { Icon } from '../components/Icon';
import { Check, DecimalField, ErrorSummary, InternalLabel, Menu, PageHeader, Segmented, SelectField, TextField, useConfirm, useToast } from '../components/ui';
import { todayIso } from '../../data/defaults';
import { ShippingDialog } from '../components/Shipping';
import { ReceiptDialog } from '../components/ReceiptDialog';
import { useMoney, usePrefs, useSettings, useStockBalances } from '../hooks';
import { ProductPicker } from './QuoteEdit';
import { CustomerPicker } from './Quotes';
import { ChannelBadge, OrderBadge } from './Sales';

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
  const [estimating, setEstimating] = useState(false);
  const [receipt, setReceipt] = useState(false);
  const customerPhone = useLiveQuery(async () => (form?.customerId ? ((await db.customers.get(form.customerId))?.phone ?? '') : ''), [form?.customerId]);
  const hideInternal = prefs.hideInternalByDefault;
  const productIds = useMemo(() => [...new Set((form?.items ?? []).map((i) => i.productId).filter((x): x is string => !!x))].sort().join(','), [form?.items]);
  const products = useLiveQuery(async () => {
    const list = await db.products.bulkGet(productIds ? productIds.split(',') : []);
    return new Map(list.filter((p): p is Product => !!p).map((p) => [p.id, p]));
  }, [productIds]);
  const balances = useStockBalances();
  const taken = useLiveQuery(async () => (isNew ? new Map<string, string>() : stockBalances(await db.stockMoves.where('refId').equals(id).toArray())), [id, isNew]);

  useEffect(() => {
    if (form) return;
    if (!isNew) {
      if (stored) setForm(stored);
      return;
    }
    const quoteId = params.get('presupuesto');
    const customerId = params.get('cliente');
    const asOrder = params.get('tipo') === 'pedido';
    void (async () => {
      if (quoteId) {
        const q = await db.quotes.get(quoteId);
        if (q) return setForm({ ...saleFromQuote(q), status: 'confirmado', payments: [] });
      }
      const base: Sale = asOrder ? { ...emptySale(), status: 'confirmado', payments: [], delivery: { mode: 'envio', address: '', date: '', internalCost: '0', internalNote: '' } } : emptySale();
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

  const status = saleStatus(form);
  const pay = salePayments(form, totals.total);
  const tracked = (pid: string) => !!products?.get(pid)?.trackStock;
  const short = balances && taken ? new Set(stockShortages(form, balances, taken, tracked)) : new Set<string>();
  const delivery: SaleDelivery = form.delivery ?? { mode: 'retiro', address: '', date: '', internalCost: '0', internalNote: '' };
  const setDelivery = (patch: Partial<SaleDelivery>) => update({ delivery: { ...delivery, ...patch } });
  const isOrder = status === 'borrador' || status === 'confirmado' || !!form.payments || !!form.delivery;

  const update = (patch: Partial<Sale> | ((s: Sale) => Partial<Sale>)) => setForm((f) => (f ? { ...f, ...(typeof patch === 'function' ? patch(f) : patch) } : f));
  const setItem = (i: number, patch: Partial<SaleItem>) => update((s) => ({ items: s.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));

  const onSave = async () => {
    const errs = validateSale(form);
    setErrors(errs);
    if (errs.length) return;
    const saved = await saveSale(form);
    setForm(saved);
    toast(isNew ? `${isOrder ? 'Pedido' : 'Venta'} ${saved.number} registrado${isOrder ? '' : 'a'}` : 'Guardado');
    if (isNew) navigate(`/ventas/${saved.id}`, { replace: true });
  };

  const toggleCancel = async () => {
    if (!form.cancelled && !(await confirm(isOrder ? 'Cancelar pedido' : 'Anular venta', 'Queda en el historial marcado como cancelado, deja de sumar en los totales y el stock vuelve. Podés restaurarlo.', isOrder ? 'Cancelar pedido' : 'Anular'))) return;
    const saved = await setSaleCancelled(form, !form.cancelled);
    setForm(saved);
    toast(saved.cancelled ? (isOrder ? 'Pedido cancelado' : 'Venta anulada') : 'Restaurado');
  };

  return (
    <>
      <PageHeader
        title={isNew ? (isOrder ? 'Nuevo pedido' : 'Registrar venta') : `${isOrder ? 'Pedido' : 'Venta'} ${form.number}`}
        back={{ to: '/ventas', label: 'Ventas' }}
        subtitle={
          !isNew && (
            <span className="row">
              <ChannelBadge channel={form.channel} platform={form.platform} />
              <OrderBadge sale={form} />
              {!pay.fullyPaid && status !== 'cancelado' && <span className="badge badge-warn">Saldo {money(pay.balance)}</span>}
            </span>
          )
        }
        actions={
          !isNew && (
            <>
            <button className="btn btn-primary" onClick={() => setReceipt(true)} disabled={!stored}>
              <Icon name="receipt" />
              {status === 'entregado' ? 'Recibo' : 'Comprobante'}
            </button>
            <Menu label="Más acciones de la venta">
              <button onClick={toggleCancel}>
                <Icon name="archive" />
                {form.cancelled ? 'Restaurar' : isOrder ? 'Cancelar pedido' : 'Anular venta'}
              </button>
              {form.quoteId && (
                <Link to={`/presupuestos/${form.quoteId}`}>
                  <Icon name="file" />
                  Ver presupuesto de origen
                </Link>
              )}
            </Menu>
            </>
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
                  <div className="item-head">
                    {it.productId && products?.get(it.productId)?.image && <img className="item-thumb" src={products.get(it.productId)!.image!} alt="" width={48} height={48} />}
                    <TextField label="Descripción" value={it.description} onChange={(v) => setItem(i, { description: v })} />
                  </div>
                  {it.productId && (products?.get(it.productId)?.variants?.length ?? 0) > 0 && (
                    <SelectField<string>
                      label="Color / talle"
                      value={it.variantId ?? ''}
                      onChange={(v) => {
                        const p = products!.get(it.productId!)!;
                        const lbl = variantLabel(p.variants!.find((x) => x.id === v));
                        setItem(i, { variantId: v, description: lbl ? `${p.name} (${lbl})` : p.name });
                      }}
                      options={[{ value: '', label: 'Elegí…' }, ...products!.get(it.productId)!.variants!.map((v) => ({ value: v.id, label: variantLabel(v) || 'Variante' }))]}
                    />
                  )}
                  <div className="qty-step">
                    <button type="button" className="btn btn-icon btn-sm" aria-label={`Restar una unidad, renglón ${i + 1}`} onClick={() => setItem(i, { quantity: D(it.quantity || '0').gt(1) ? D(it.quantity).minus(1).toString() : '1' })}>
                      <Icon name="minus" />
                    </button>
                  <DecimalField
                    label="Cant."
                    value={it.quantity}
                    onChange={(v) => setItem(i, { quantity: v })}
                    error={it.productId && short.has(`${it.productId}|${it.variantId ?? ''}`) ? `Stock insuficiente (hay ${D(balances?.get(`${it.productId}|${it.variantId ?? ''}`) ?? '0').minus(D(taken?.get(`${it.productId}|${it.variantId ?? ''}`) ?? '0')).toFixed(0)})` : null}
                  />
                    <button type="button" className="btn btn-icon btn-sm" aria-label={`Sumar una unidad, renglón ${i + 1}`} onClick={() => setItem(i, { quantity: D(it.quantity || '0').plus(1).toString() })}>
                      <Icon name="plus" />
                    </button>
                  </div>
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
            <h2 id="sv-cond">Descuentos</h2>
            <div className="form-grid cols-2">
              <DecimalField label="Descuento general" suffix="%" value={form.globalDiscountPct === '0' ? '' : form.globalDiscountPct} onChange={(v) => update({ globalDiscountPct: v || '0' })} />
              <DecimalField label={settings.taxLabel || 'Impuesto'} suffix="%" value={form.taxPct === '0' ? '' : (form.taxPct ?? '')} onChange={(v) => update({ taxPct: v || '0' })} hint="Vacío si el precio ya es final." />
            </div>
          </section>

          <section className="card stack" aria-labelledby="sv-del">
            <h2 id="sv-del">Entrega</h2>
            <Segmented<SaleDelivery['mode']>
              legend="¿Cómo se entrega?"
              value={delivery.mode}
              onChange={(mode) => setDelivery({ mode })}
              options={[
                { value: 'retiro', label: 'Retira en el local' },
                { value: 'envio', label: 'Envío a domicilio' },
              ]}
            />
            <div className="form-grid cols-2">
              {delivery.mode === 'envio' && <TextField className="span-all" label="Dirección de entrega" value={delivery.address} onChange={(address) => setDelivery({ address })} />}
              <TextField label={delivery.mode === 'envio' ? 'Fecha de entrega' : 'Fecha de retiro'} type="date" value={delivery.date} onChange={(date) => setDelivery({ date })} hint="Opcional." />
              <DecimalField label="Envío cobrado" prefix="$" value={form.shippingCharged === '0' ? '' : form.shippingCharged} onChange={(v) => update({ shippingCharged: v || '0' })} />
            </div>
            {delivery.mode === 'envio' && (
              <div className="row">
                <button type="button" className="btn btn-sm" onClick={() => setEstimating(true)}>
                  <Icon name="truck" />
                  Calcular envío
                </button>
                {!hideInternal && D(delivery.internalCost || '0').gt(0) && (
                  <span className="small muted">
                    Costo estimado {money(delivery.internalCost)} · {delivery.internalNote} <InternalLabel text="Interno" />
                  </span>
                )}
              </div>
            )}
          </section>

          <section className="card stack" aria-labelledby="sv-pay">
            <h2 id="sv-pay">Estado y cobro</h2>
            {status !== 'cancelado' && (
              <SelectField<OrderStatus>
                label="Estado del pedido"
                value={status}
                onChange={(v) => update({ status: v })}
                options={(['borrador', 'confirmado', 'entregado'] as const).map((v) => ({ value: v, label: ORDER_STATUS_LABELS[v] }))}
                hint="Borrador no descuenta stock ni suma en ventas. Confirmado y entregado, sí."
              />
            )}
            <div className="form-grid cols-2">
              <SelectField<string> label="Forma de pago" value={form.paymentMethod} onChange={(v) => update({ paymentMethod: v })} options={PAYMENT_METHODS.map((p) => ({ value: p, label: p }))} />
            </div>
            <Check label="Cobrado en su totalidad" checked={!form.payments} onChange={(v) => update({ payments: v ? undefined : [] })} hint="Desmarcá para registrar una seña y el saldo." />
            {form.payments && (
              <div className="stack">
                {form.payments.map((p, i) => (
                  <fieldset key={p.id} className="pay-row">
                    <legend className="sr-only">Pago {i + 1}</legend>
                    <TextField label="Concepto" value={p.note} onChange={(note) => update((s) => ({ payments: s.payments!.map((x, j) => (j === i ? { ...x, note } : x)) }))} />
                    <TextField label="Fecha" type="date" value={p.date} onChange={(date) => update((s) => ({ payments: s.payments!.map((x, j) => (j === i ? { ...x, date } : x)) }))} />
                    <DecimalField label="Importe" prefix="$" value={p.amount} onChange={(amount) => update((s) => ({ payments: s.payments!.map((x, j) => (j === i ? { ...x, amount } : x)) }))} />
                    <SelectField<string> label="Medio" value={p.method} onChange={(method) => update((s) => ({ payments: s.payments!.map((x, j) => (j === i ? { ...x, method } : x)) }))} options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} />
                    <button type="button" className="btn btn-icon btn-ghost" aria-label={`Quitar pago ${i + 1}`} onClick={() => update((s) => ({ payments: s.payments!.filter((_, j) => j !== i) }))}>
                      <Icon name="trash" />
                    </button>
                  </fieldset>
                ))}
                <div className="actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      update((s) => {
                        const list = s.payments ?? [];
                        const half = D(totals.total).div(2).round(2).toFixed(2);
                        const amount = list.length === 0 ? half : D(pay.balance).gt(0) ? pay.balance : '';
                        return { payments: [...list, { id: newId(), date: todayIso(), amount, method: s.paymentMethod, note: list.length === 0 ? 'Seña' : D(pay.balance).gt(0) ? 'Saldo' : 'Pago' }] };
                      })
                    }
                  >
                    <Icon name="plus" />
                    {form.payments.length === 0 ? 'Registrar seña' : 'Registrar pago'}
                  </button>
                </div>
              </div>
            )}
          </section>

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
              {isNew ? (isOrder ? 'Guardar pedido' : 'Registrar venta') : 'Guardar'}
            </button>
            <Link className="btn btn-ghost" to="/ventas">
              Cancelar
            </Link>
          </div>
        </form>

        <aside className="stack" aria-label="Totales de la venta">
          <section className="card">
            <h2>{form.payments ? 'Total y saldo' : 'Total cobrado'}</h2>
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
              {form.payments && (
                <>
                  <dt>Cobrado</dt>
                  <dd data-testid="sale-paid">{money(pay.paid)}</dd>
                  <dt className="total">Saldo</dt>
                  <dd className={`total ${D(pay.balance).gt(0) ? 'warn-text' : ''}`} data-testid="sale-balance">
                    {money(pay.balance)}
                  </dd>
                </>
              )}
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

      {stored && <ReceiptDialog open={receipt} onClose={() => setReceipt(false)} sale={stored} settings={settings} phone={customerPhone ?? ''} />}
      <ShippingDialog
        open={estimating}
        onClose={() => setEstimating(false)}
        destination={delivery.address}
        onApply={(r) => {
          update({ shippingCharged: r.price, delivery: { ...delivery, mode: 'envio', internalCost: r.cost, internalNote: r.note } });
          setEstimating(false);
          toast('Precio de envío aplicado');
        }}
      />
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
