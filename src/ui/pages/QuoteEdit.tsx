import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { matches } from '../search';
import { newId, todayIso } from '../../data/defaults';
import { changeQuoteStatus, customerSnapshot, duplicateQuote, itemFromProduct, saveQuote, suggestedPrice } from '../../data/services';
import { D } from '../../domain/money';
import { ALLOWED_TRANSITIONS, computeCommercialTotals, computeInternal, effectiveQuote, isPastValidity, validateQuote } from '../../domain/quote';
import { QUOTE_STATUS_LABELS, type Quote, type QuoteItem, type QuoteStatus } from '../../domain/types';
import { Icon } from '../components/Icon';
import { DecimalField, Dialog, ErrorSummary, InternalLabel, Menu, PageHeader, StatusBadge, TextField, useConfirm, useToast } from '../components/ui';
import { pct, useMoney, usePrefs, useSettings } from '../hooks';
import { CustomerPicker } from './Quotes';

export default function QuoteEdit() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const money = useMoney();
  const settings = useSettings();
  const [prefs, setPrefs] = usePrefs();
  const [confirm, confirmNode] = useConfirm();
  const stored = useLiveQuery(() => db.quotes.get(id).then((q) => q ?? null), [id]);
  const [form, setForm] = useState<Quote | null>(null);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const hideInternal = prefs.hideInternalByDefault;

  useEffect(() => {
    if (stored && (!form || !dirty || stored.id !== form.id)) setForm(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  useEffect(() => {
    if (!dirty) return;
    const fn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [dirty]);

  const calc = useMemo(() => {
    if (!form) return null;
    const e = effectiveQuote(form);
    const safeItems = e.items.map((it) => ({ ...it, quantity: it.quantity || '0', unitPrice: it.unitPrice || '0', discountPct: it.discountPct || '0' }));
    const input = { ...e, items: safeItems, globalDiscountPct: e.globalDiscountPct || '0', taxPct: e.taxPct || '0', shippingCharged: e.shippingCharged || '0' };
    const totals = computeCommercialTotals(input);
    return { totals, internal: computeInternal({ ...input, shippingCost: e.shippingCost || '0' }, totals) };
  }, [form]);

  if (stored === null) return <PageHeader title="Presupuesto no encontrado" back={{ to: '/presupuestos', label: 'Presupuestos' }} />;
  if (!form || !calc) return <p role="status">Cargando…</p>;

  const locked = !!form.frozen;
  const items = locked ? form.frozen!.items : form.items;
  /** Actualizaciones funcionales: varios cambios seguidos (p. ej. autocompletado) no se pisan entre sí. */
  const update = (patch: Partial<Quote> | ((q: Quote) => Partial<Quote>)) => {
    setForm((f) => (f ? { ...f, ...(typeof patch === 'function' ? patch(f) : patch) } : f));
    setDirty(true);
  };
  const setItem = (i: number, patch: Partial<QuoteItem>) => update((q) => ({ items: q.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const moveItem = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= form.items.length) return;
    const next = [...form.items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    update({ items: next });
  };

  const save = async (silent = false): Promise<boolean> => {
    if (locked) return true;
    const errs = validateQuote(form);
    setErrors(errs);
    if (errs.length) return false;
    const saved = await saveQuote(form);
    setForm(saved);
    setDirty(false);
    if (!silent) toast('Borrador guardado');
    return true;
  };

  const goDocument = async () => {
    if (await save(true)) navigate(`/presupuestos/${form.id}/documento`);
  };

  const setStatus = async (s: QuoteStatus) => {
    setStatusOpen(false);
    if (s === 'sent' && !locked) {
      if (!(await save(true))) return;
      const ok = await confirm(
        'Marcar como enviado',
        'Se congela una copia de los datos comerciales, precios y costos de este presupuesto. Cambios futuros en productos, costos o en tu negocio no lo van a modificar. Para cambiarlo después, vas a tener que duplicarlo.',
        'Marcar como enviado',
      );
      if (!ok) return;
    }
    try {
      const fresh = (await db.quotes.get(form.id)) ?? form;
      const r = await changeQuoteStatus(fresh, s);
      setForm(r);
      setDirty(false);
      toast(`Estado: ${QUOTE_STATUS_LABELS[s]}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const duplicate = async () => {
    if (dirty && !(await save(true))) return;
    const d = await duplicateQuote((await db.quotes.get(form.id)) ?? form);
    toast(`Duplicado como ${d.number}`);
    navigate(`/presupuestos/${d.id}`);
  };

  const transitions = ALLOWED_TRANSITIONS[form.status];
  const pastValidity = isPastValidity(form, todayIso());

  return (
    <>
      <PageHeader
        title={`Presupuesto ${form.number}`}
        back={{ to: '/presupuestos', label: 'Presupuestos' }}
        subtitle={
          <span className="row">
            <StatusBadge status={form.status} />
            {locked && (
              <span className="badge">
                <Icon name="lock" />
                Congelado el {new Date(form.frozen!.frozenAt).toLocaleDateString('es-AR')}
              </span>
            )}
            {dirty && <span className="badge badge-warn">Cambios sin guardar</span>}
          </span>
        }
        actions={
          <>
            <button className="btn btn-primary" onClick={goDocument}>
              <Icon name="file" />
              PDF y WhatsApp
            </button>
            {transitions.length > 0 && (
              <button className="btn" onClick={() => setStatusOpen(true)}>
                Cambiar estado
              </button>
            )}
            <Menu label="Más acciones del presupuesto">
              <button onClick={duplicate}>
                <Icon name="duplicate" />
                Duplicar
              </button>
              <button onClick={() => setPrefs({ hideInternalByDefault: !hideInternal })}>
                <Icon name={hideInternal ? 'eye' : 'eyeOff'} />
                {hideInternal ? 'Mostrar datos internos' : 'Ocultar datos internos (modo cliente)'}
              </button>
            </Menu>
          </>
        }
      />
      {pastValidity && (
        <p className="card warn-text" role="status" style={{ marginBottom: 16 }}>
          La validez venció el {new Date(`${form.validUntil}T12:00:00`).toLocaleDateString('es-AR')}. Si corresponde, marcalo como vencido.
        </p>
      )}
      <ErrorSummary errors={errors} />

      <div className="grid grid-main-aside">
        <div className="stack">
          <section className="card" aria-labelledby="qc">
            <div className="card-header">
              <h2 id="qc">Cliente</h2>
              {!locked && (
                <button className="btn btn-sm" onClick={() => setPicking(true)}>
                  {form.customerSnapshot.name ? 'Cambiar' : 'Elegir cliente'}
                </button>
              )}
            </div>
            {effectiveQuote(form).customer.name ? (
              <p>
                <strong>{effectiveQuote(form).customer.name}</strong>
                <br />
                <span className="muted small">{[effectiveQuote(form).customer.phone, effectiveQuote(form).customer.email].filter(Boolean).join(' · ')}</span>
              </p>
            ) : (
              <p className="muted">Sin cliente asignado.</p>
            )}
            <div className="form-grid cols-2" style={{ marginTop: 12 }}>
              <TextField label="Fecha" type="date" value={locked ? form.frozen!.issueDate : form.issueDate} onChange={(v) => update({ issueDate: v })} />
              <TextField label="Válido hasta" type="date" value={locked ? form.frozen!.validUntil : form.validUntil} onChange={(v) => update({ validUntil: v })} />
            </div>
          </section>

          <section className="card" aria-labelledby="qi">
            <div className="card-header">
              <h2 id="qi">Ítems</h2>
              {!locked && (
                <div className="actions">
                  <button className="btn btn-sm" onClick={() => setAdding(true)}>
                    <Icon name="box" />
                    Agregar producto
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => update((q) => ({ items: [...q.items, { id: newId(), productId: null, description: '', unit: 'u', quantity: '1', unitPrice: '', discountPct: '0', unitCost: '0' }] }))}
                  >
                    <Icon name="plus" />
                    Concepto libre
                  </button>
                </div>
              )}
            </div>
            {items.length === 0 && <p className="muted">Agregá productos del catálogo o conceptos libres (servicios, fletes, etc.).</p>}
            <div className="stack">
              {items.map((it, i) => {
                const line = calc.totals.lines[i];
                const internal = calc.internal.lines[i];
                return (
                  <fieldset key={it.id} className="item-row" disabled={locked}>
                    <legend className="sr-only">Ítem {i + 1}</legend>
                    <TextField label="Descripción comercial" value={it.description} onChange={(v) => setItem(i, { description: v })} />
                    <DecimalField label="Cant." value={it.quantity} onChange={(v) => setItem(i, { quantity: v })} />
                    <DecimalField label="Precio unit." prefix="$" value={it.unitPrice} onChange={(v) => setItem(i, { unitPrice: v })} />
                    <DecimalField label="Desc." suffix="%" value={it.discountPct === '0' ? '' : it.discountPct} onChange={(v) => setItem(i, { discountPct: v || '0' })} />
                    <div className="field">
                      <span className="label">Importe</span>
                      <span className="num" style={{ minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 650 }}>
                        {money(line?.net ?? '0')}
                      </span>
                    </div>
                    {!locked && (
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <button type="button" className="btn btn-icon btn-ghost" aria-label={`Subir ítem ${i + 1}`} onClick={() => moveItem(i, -1)} disabled={i === 0}>
                          <span aria-hidden="true">↑</span>
                        </button>
                        <button type="button" className="btn btn-icon btn-ghost" aria-label={`Quitar ítem ${i + 1}`} onClick={() => update((q) => ({ items: q.items.filter((_, j) => j !== i) }))}>
                          <Icon name="trash" />
                        </button>
                      </div>
                    )}
                    {!hideInternal && internal && (
                      <div className="internal small" style={{ gridColumn: '1 / -1' }}>
                        <span className="row" style={{ justifyContent: 'space-between' }}>
                          <InternalLabel />
                          <span>
                            Costo c/u {money(it.unitCost)} · Ganancia {money(internal.profit)} · Margen {pct(internal.marginPct)}
                            {internal.belowCost && <strong className="danger-text"> · Bajo costo</strong>}
                            {D(it.unitCost || '0').lte(0) && <strong className="warn-text"> · Sin costo cargado</strong>}
                          </span>
                        </span>
                      </div>
                    )}
                  </fieldset>
                );
              })}
            </div>
          </section>

          <section className="card" aria-labelledby="qa">
            <h2 id="qa">Condiciones comerciales</h2>
            <fieldset disabled={locked} className="form-grid cols-3">
              <DecimalField label="Descuento general" suffix="%" value={form.globalDiscountPct === '0' ? '' : effectiveQuote(form).globalDiscountPct} onChange={(v) => update({ globalDiscountPct: v || '0' })} />
              <DecimalField label={`${settings.taxLabel || 'Impuesto'}`} suffix="%" value={effectiveQuote(form).taxPct} onChange={(v) => update({ taxPct: v || '0' })} />
              <DecimalField label="Envío cobrado" prefix="$" value={effectiveQuote(form).shippingCharged} onChange={(v) => update({ shippingCharged: v || '0' })} />
              <TextField className="span-all" label="Condiciones" multiline value={effectiveQuote(form).conditions} onChange={(v) => update({ conditions: v })} hint="Forma de pago, plazos de entrega, garantía." />
              <TextField className="span-all" label="Notas para el cliente" multiline value={effectiveQuote(form).commercialNotes} onChange={(v) => update({ commercialNotes: v })} hint="Aparecen en el PDF y en WhatsApp." />
            </fieldset>
          </section>

          {!hideInternal && (
            <section className="card" aria-labelledby="qint">
              <div className="card-header">
                <h2 id="qint">Datos internos</h2>
                <InternalLabel />
              </div>
              <fieldset disabled={locked} className="form-grid cols-2">
                <DecimalField label="Costo real del envío" prefix="$" value={effectiveQuote(form).shippingCost} onChange={(v) => update({ shippingCost: v || '0' })} hint="Lo que te cuesta a vos enviar." />
                <TextField className="span-all" label="Notas internas" multiline value={form.internalNotes} onChange={(v) => update({ internalNotes: v })} />
              </fieldset>
            </section>
          )}

          {!locked && (
            <div className="sticky-actions actions only-mobile">
              <button className="btn btn-primary" onClick={() => save()}>
                <Icon name="check" />
                Guardar borrador
              </button>
            </div>
          )}
        </div>

        <aside className="stack" aria-label="Totales">
          <section className="card" aria-labelledby="tot">
            <h2 id="tot">Total para el cliente</h2>
            <dl className="dl">
              <dt>Subtotal</dt>
              <dd>{money(calc.totals.subtotal)}</dd>
              {calc.totals.globalDiscount !== '0.00' && (
                <>
                  <dt>Descuento</dt>
                  <dd>−{money(calc.totals.globalDiscount)}</dd>
                </>
              )}
              {calc.totals.tax !== '0.00' && (
                <>
                  <dt>{settings.taxLabel}</dt>
                  <dd>{money(calc.totals.tax)}</dd>
                </>
              )}
              {calc.totals.shipping !== '0.00' && (
                <>
                  <dt>Envío</dt>
                  <dd>{money(calc.totals.shipping)}</dd>
                </>
              )}
              <dt className="total">Total</dt>
              <dd className="total" data-testid="quote-total">
                {money(calc.totals.total)}
              </dd>
            </dl>
            {!locked && (
              <div className="only-desktop" style={{ marginTop: 14 }}>
                <button className="btn btn-primary btn-block" onClick={() => save()}>
                  <Icon name="check" />
                  Guardar borrador
                </button>
              </div>
            )}
          </section>
          {!hideInternal && (
            <section className="card" aria-labelledby="rent">
              <div className="card-header">
                <h2 id="rent">Rentabilidad</h2>
                <InternalLabel text="Interno" />
              </div>
              <dl className="dl">
                <dt>Ingreso neto</dt>
                <dd>{money(calc.internal.revenueNet)}</dd>
                <dt>Costo mercadería</dt>
                <dd>{money(calc.internal.goodsCost)}</dd>
                <dt>Costo de envío</dt>
                <dd>{money(calc.internal.shippingCost)}</dd>
                <dt className="total">Ganancia</dt>
                <dd className={`total ${D(calc.internal.profit).lt(0) ? 'danger-text' : ''}`} data-testid="quote-profit">
                  {money(calc.internal.profit)}
                </dd>
                <dt>Margen</dt>
                <dd>{pct(calc.internal.marginPct)}</dd>
                <dt>Markup</dt>
                <dd>{pct(calc.internal.markupPct)}</dd>
              </dl>
              {calc.internal.hasMissingCosts && <p className="warn-text small" style={{ marginTop: 8 }}>Hay ítems sin costo: la ganancia está sobreestimada.</p>}
              {locked && <p className="small muted" style={{ marginTop: 8 }}>Calculado con los costos congelados al enviarlo.</p>}
            </section>
          )}
          <section className="card" aria-labelledby="hist">
            <h2 id="hist">Historial</h2>
            <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {[...form.events].reverse().slice(0, 15).map((e, i) => (
                <li key={`${e.at}-${i}`} style={{ marginBottom: 6 }}>
                  {e.detail}
                  <div className="muted">{new Date(e.at).toLocaleString('es-AR')}</div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      <CustomerPicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(c) => {
          setPicking(false);
          update({ customerId: c?.id ?? null, customerSnapshot: customerSnapshot(c) });
        }}
      />
      <ProductPicker
        open={adding}
        onClose={() => setAdding(false)}
        onPick={(item) => {
          update((q) => ({ items: [...q.items, item] }));
          setAdding(false);
        }}
        suggested={(p) => suggestedPrice(p, settings)}
      />
      <Dialog open={statusOpen} onClose={() => setStatusOpen(false)} title="Cambiar estado" actions={<button className="btn" onClick={() => setStatusOpen(false)}>Cerrar</button>}>
        <p className="muted small" style={{ marginBottom: 10 }}>
          Estado actual: {QUOTE_STATUS_LABELS[form.status]}. Los cambios de estado quedan registrados en el historial.
        </p>
        <div className="stack">
          {transitions.map((s) => (
            <button key={s} className="btn btn-block" onClick={() => setStatus(s)}>
              {QUOTE_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </Dialog>
      {confirmNode}
    </>
  );
}

function ProductPicker({ open, onClose, onPick, suggested }: { open: boolean; onClose: () => void; onPick: (i: QuoteItem) => void; suggested: (p: { currentCost: string | null; targetMarginPct: string | null }) => string | null }) {
  const products = useLiveQuery(() => db.products.filter((p) => !p.archived && p.active).toArray(), []);
  const money = useMoney();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    return (products ?? []).filter((p) => matches(`${p.name} ${p.sku}`, q)).sort((a, b) => a.name.localeCompare(b.name, 'es')).slice(0, 40);
  }, [products, q]);
  return (
    <Dialog open={open} onClose={onClose} title="Agregar producto" actions={<button className="btn" onClick={onClose}>Cerrar</button>}>
      <label htmlFor="ppick" className="sr-only">
        Buscar producto
      </label>
      <input id="ppick" className="input" type="search" placeholder="Buscar producto" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul className="list" style={{ marginTop: 10 }}>
        {list.length === 0 && (
          <li className="list-item muted">
            No hay productos activos. <Link to="/productos/nuevo">Crear producto</Link>
          </li>
        )}
        {list.map((p) => {
          const price = p.manualPrice ?? suggested(p);
          return (
            <li key={p.id}>
              <button
                className="list-item"
                style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                onClick={() => onPick(itemFromProduct(p, price))}
              >
                <span className="grow">
                  <span className="title" style={{ display: 'block' }}>
                    {p.name}
                  </span>
                  <span className="sub">{p.unit}</span>
                </span>
                <span className="end num">{price ? money(price) : 'Sin precio'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
