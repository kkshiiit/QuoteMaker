import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { createBase, putRecord } from '../../data/repo';
import { emptyProduct, saveProduct, suggestedPrice, validateProduct } from '../../data/services';
import { lotCosts, productCost } from '../../domain/costing';
import { analyzePrice } from '../../domain/pricing';
import type { Product } from '../../domain/types';
import { MAX_PHOTOS, resizePhoto, thumbFromDataUrl, validateVideo } from '../../platform/image';
import { newId, nowIso } from '../../data/defaults';
import { ShareProductDialog, productPhotos } from '../components/ShareProduct';
import { Icon } from '../components/Icon';
import { Check, DecimalField, ErrorSummary, InternalLabel, Menu, PageHeader, SelectField, TextField, useConfirm, useToast } from '../components/ui';
import { pct, useMoney, useSettings } from '../hooks';

const SOURCE_LABEL = { purchase: 'Compra', expense: 'Gasto asignado', manual: 'Carga manual', recalc: 'Recalculado' } as const;

/** Cada dirección (/…/nueva, /…/:id) monta un formulario nuevo: nunca arrastra datos de otra ficha. */
export default function ProductDetail() {
  const { id = '' } = useParams();
  return <ProductDetailForm key={id} />;
}

function ProductDetailForm() {
  const { id = 'nuevo' } = useParams();
  const isNew = id === 'nuevo';
  const navigate = useNavigate();
  const toast = useToast();
  const money = useMoney();
  const settings = useSettings();
  const [confirm, confirmNode] = useConfirm();
  const stored = useLiveQuery(async () => (isNew ? null : ((await db.products.get(id)) ?? null)), [id]);
  const categories = useLiveQuery(() => db.categories.filter((c) => !c.archived).toArray(), []);
  const suppliers = useLiveQuery(() => db.suppliers.filter((s) => !s.archived).toArray(), []);
  const history = useLiveQuery(() => (isNew ? [] : db.costHistory.where('productId').equals(id).reverse().sortBy('at')), [id]);
  const costInfo = useLiveQuery(async () => {
    if (isNew) return null;
    const [purchases, expenses] = await Promise.all([db.purchases.toArray(), db.expenses.toArray()]);
    const p = await db.products.get(id);
    return p ? productCost(p, lotCosts(purchases, expenses)) : null;
  }, [id]);
  const [form, setForm] = useState<Product | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [newCat, setNewCat] = useState('');
  const [busyImage, setBusyImage] = useState(false);
  const [sharing, setSharing] = useState(false);
  const videos = useLiveQuery(() => (isNew ? [] : db.productVideos.where('productId').equals(id).toArray()), [id]);
  const videoUrls = useMemo(() => (videos ?? []).map((v) => ({ v, url: URL.createObjectURL(v.blob) })), [videos]);
  useEffect(() => () => videoUrls.forEach((x) => URL.revokeObjectURL(x.url)), [videoUrls]);

  useEffect(() => {
    if (isNew) setForm((f) => f ?? emptyProduct());
    else if (stored && !form) setForm(stored);
    // Sincroniza campos calculados (costo) sin pisar ediciones en curso
    else if (stored && form && stored.currentCost !== form.currentCost) setForm({ ...form, currentCost: stored.currentCost, costUpdatedAt: stored.costUpdatedAt, costSource: stored.costSource });
  }, [isNew, stored, form]);

  const set = <K extends keyof Product>(k: K, v: Product[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const suggested = useMemo(() => (form ? suggestedPrice(form, settings) : null), [form, settings]);
  const effectivePrice = form?.manualPrice || suggested;
  const analysis = useMemo(
    () => (form?.currentCost && effectivePrice ? analyzePrice({ unitCost: form.currentCost, price: effectivePrice, pctCharges: settings.defaultPctCharges, fixedPerUnit: settings.defaultFixedPerUnit }) : null),
    [form?.currentCost, effectivePrice, settings],
  );

  if (stored === null && !isNew) {
    return (
      <>
        <PageHeader title="Producto no encontrado" back={{ to: '/productos', label: 'Productos' }} />
        <p>Puede que se haya eliminado en otro dispositivo.</p>
      </>
    );
  }
  if (!form) return <p role="status">Cargando…</p>;

  const onSave = async () => {
    const errs = await validateProduct(form);
    setErrors(errs);
    if (errs.length) return;
    const saved = await saveProduct(form);
    toast('Producto guardado');
    if (isNew) navigate(`/productos/${saved.id}`, { replace: true });
    else setForm(saved);
  };

  const addCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    const existing = categories?.find((c) => c.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'));
    const cat = existing ?? (await putRecord('categories', { ...createBase(), name, archived: false }));
    set('categoryId', cat.id);
    setNewCat('');
  };

  const toggleArchive = async () => {
    if (!form.archived && !(await confirm('Archivar producto', 'Deja de aparecer en listas y al crear presupuestos. Los presupuestos existentes no cambian. Podés restaurarlo cuando quieras.', 'Archivar'))) return;
    const saved = await saveProduct({ ...form, archived: !form.archived });
    setForm(saved);
    toast(saved.archived ? 'Producto archivado' : 'Producto restaurado');
  };

  return (
    <>
      <PageHeader
        title={isNew ? 'Nuevo producto' : form.name || 'Producto'}
        back={{ to: '/productos', label: 'Productos' }}
        subtitle={form.archived ? 'Archivado' : undefined}
        actions={
          !isNew && (
            <>
            <button className="btn btn-primary" onClick={() => setSharing(true)}>
              <Icon name="share" />
              Compartir
            </button>
            <Menu label="Más acciones del producto">
              <Link to={`/costos/calculadora?producto=${form.id}`}>
                <Icon name="calculator" />
                Abrir en calculadora
              </Link>
              <Link to={`/costos/compras/nueva?producto=${form.id}`}>
                <Icon name="receipt" />
                Registrar compra
              </Link>
              <button onClick={toggleArchive}>
                <Icon name="archive" />
                {form.archived ? 'Restaurar' : 'Archivar'}
              </button>
            </Menu>
            </>
          )
        }
      />
      <ErrorSummary errors={errors} />
      <div className="grid grid-main-aside">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
          noValidate
        >
          <section className="card" aria-labelledby="sec-com">
            <h2 id="sec-com">Datos comerciales</h2>
            <p className="small muted" style={{ marginTop: -6, marginBottom: 12 }}>
              El nombre y la descripción pueden aparecer en presupuestos.
            </p>
            <div className="form-grid cols-2">
              <TextField className="span-all" label="Nombre" required value={form.name} onChange={(v) => set('name', v)} maxLength={120} />
              <TextField className="span-all" label="Descripción comercial" multiline value={form.description} onChange={(v) => set('description', v)} maxLength={500} />
              <TextField label="Código / SKU" value={form.sku} onChange={(v) => set('sku', v)} hint="Opcional, uso interno." />
              <TextField label="Unidad de medida" required value={form.unit} onChange={(v) => set('unit', v)} hint="u, kg, m, caja…" />
              <SelectField<string>
                label="Categoría"
                value={form.categoryId ?? ''}
                onChange={(v) => set('categoryId', v || null)}
                options={[{ value: '', label: 'Sin categoría' }, ...(categories ?? []).map((c) => ({ value: c.id, label: c.name }))]}
              />
              <div className="field">
                <label htmlFor="newcat">Nueva categoría</label>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <input id="newcat" className="input" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Ej. Muebles" />
                  <button type="button" className="btn" onClick={addCategory} disabled={!newCat.trim()}>
                    Agregar
                  </button>
                </div>
              </div>
              <Check label="Producto activo (disponible para presupuestar)" checked={form.active} onChange={(v) => set('active', v)} />
            </div>
          </section>

          <section className="card" aria-labelledby="sec-img">
            <div className="card-header">
              <h2 id="sec-img">Fotos y videos</h2>
              <span className="small muted">Para compartir en redes</span>
            </div>
            <ul className="media-grid" aria-label="Fotos del producto">
              {productPhotos(form).map((ph, i) => (
                <li key={`${i}-${ph.length}`} className="media-tile">
                  <img src={ph} alt={`Foto ${i + 1} de ${form.name || 'producto'}`} />
                  {i === 0 && <span className="badge badge-accent media-badge">Portada</span>}
                  <div className="media-actions">
                    {i > 0 && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={async () => {
                          const list = [...productPhotos(form)];
                          const [x] = list.splice(i, 1);
                          list.unshift(x!);
                          set('photos', list);
                          set('image', await thumbFromDataUrl(list[0]!));
                        }}
                      >
                        Usar de portada
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-icon"
                      aria-label={`Quitar foto ${i + 1}`}
                      onClick={async () => {
                        const list = productPhotos(form).filter((_, j) => j !== i);
                        set('photos', list);
                        set('image', list[0] ? await thumbFromDataUrl(list[0]) : null);
                      }}
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="actions" style={{ marginTop: 10 }}>
              <label className={`btn ${productPhotos(form).length >= MAX_PHOTOS ? 'btn-disabled' : ''}`}>
                <Icon name="image" />
                {busyImage ? 'Procesando…' : 'Agregar fotos'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  disabled={busyImage || productPhotos(form).length >= MAX_PHOTOS}
                  onChange={async (e) => {
                    const files = [...(e.target.files ?? [])];
                    e.target.value = '';
                    if (!files.length) return;
                    setBusyImage(true);
                    try {
                      const current = productPhotos(form);
                      const room = MAX_PHOTOS - current.length;
                      if (files.length > room) toast(`Se agregan ${room} de ${files.length}: máximo ${MAX_PHOTOS} fotos por producto.`);
                      const added: string[] = [];
                      for (const f of files.slice(0, room)) added.push(await resizePhoto(f));
                      const list = [...current, ...added];
                      set('photos', list);
                      if (!form.image || current.length === 0) set('image', await thumbFromDataUrl(list[0]!));
                    } catch (err) {
                      toast((err as Error).message, 'error');
                    } finally {
                      setBusyImage(false);
                    }
                  }}
                />
              </label>
              {isNew ? (
                <span className="small muted">Guardá el producto para agregar videos.</span>
              ) : (
                <label className="btn">
                  <Icon name="video" />
                  Agregar video
                  <input
                    type="file"
                    accept="video/*"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      const err = validateVideo(f);
                      if (err) return toast(err, 'error');
                      // Tabla local (no sincronizable): los videos quedan sólo en este dispositivo.
                      await db.productVideos.add({ id: newId(), productId: form.id, name: f.name, mime: f.type || 'video/mp4', size: f.size, blob: f, createdAt: nowIso() });
                      toast('Video agregado (queda guardado en este dispositivo)');
                    }}
                  />
                </label>
              )}
            </div>
            {videoUrls.length > 0 && (
              <ul className="media-grid" aria-label="Videos del producto" style={{ marginTop: 12 }}>
                {videoUrls.map(({ v, url }, i) => (
                  <li key={v.id} className="media-tile">
                    <video src={url} controls preload="metadata" aria-label={`Video ${i + 1}: ${v.name}`} />
                    <div className="media-actions">
                      <span className="small muted">{(v.size / 1024 / 1024).toFixed(1)} MB</span>
                      <button type="button" className="btn btn-sm btn-icon" aria-label={`Quitar video ${i + 1}`} onClick={() => db.productVideos.delete(v.id)}>
                        <Icon name="trash" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="small muted" style={{ marginTop: 8 }}>
              Hasta {MAX_PHOTOS} fotos (se optimizan en tu dispositivo y se sincronizan). Los videos quedan sólo en este dispositivo.
            </p>
          </section>

          <section className="card" aria-labelledby="sec-int">
            <div className="card-header">
              <h2 id="sec-int">Costos y precio</h2>
              <InternalLabel />
            </div>
            <div className="form-grid cols-2">
              <SelectField<string>
                label="Proveedor habitual"
                value={form.supplierId ?? ''}
                onChange={(v) => set('supplierId', v || null)}
                options={[{ value: '', label: 'Sin proveedor' }, ...(suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))]}
              />
              <DecimalField
                label="Costo manual"
                prefix="$"
                value={form.manualCost}
                onChange={(v) => set('manualCost', v || null)}
                hint="Se usa sólo si el producto no tiene compras registradas."
              />
              <DecimalField
                label="Margen objetivo"
                suffix="%"
                value={form.targetMarginPct}
                onChange={(v) => set('targetMarginPct', v || null)}
                hint={`Vacío = el general (${settings.defaultTargetMarginPct} %).`}
              />
              <DecimalField
                label="Precio de venta"
                prefix="$"
                value={form.manualPrice}
                onChange={(v) => set('manualPrice', v || null)}
                hint={suggested ? `Sugerido: ${money(suggested)}. Vacío = usar el sugerido.` : 'Sin costo no hay precio sugerido.'}
              />
              <DecimalField label="Peso unitario" suffix="kg" value={form.unitWeight} onChange={(v) => set('unitWeight', v || '0')} hint="Para distribuir gastos por peso." />
              <DecimalField label="Volumen unitario" suffix="l" value={form.unitVolume} onChange={(v) => set('unitVolume', v || '0')} hint="Para distribuir gastos por volumen." />
              <TextField className="span-all" label="Notas internas" multiline value={form.internalNotes} onChange={(v) => set('internalNotes', v)} hint="Nunca aparecen en documentos." />
            </div>
          </section>
          <div className="sticky-actions actions">
            <button className="btn btn-primary" type="submit">
              <Icon name="check" />
              Guardar producto
            </button>
            <Link className="btn btn-ghost" to="/productos">
              Cancelar
            </Link>
          </div>
        </form>

        <aside className="stack" aria-label="Costo real y rentabilidad">
          <section className="card">
            <div className="card-header">
              <h2>Costo real</h2>
              <InternalLabel text="Interno" />
            </div>
            {form.currentCost ? (
              <dl className="dl">
                {costInfo?.source === 'purchase' && (
                  <>
                    <dt>Costo de compra</dt>
                    <dd>{money(costInfo.purchaseUnitCost)}</dd>
                    <dt>Gastos asignados</dt>
                    <dd>{money(costInfo.allocatedPerUnit)}</dd>
                  </>
                )}
                <dt className="total">Costo unitario real</dt>
                <dd className="total">{money(form.currentCost)}</dd>
              </dl>
            ) : (
              <p className="muted">
                Sin costo todavía. <Link to={`/costos/compras/nueva?producto=${form.id}`}>Registrá una compra</Link> o cargá un costo manual.
              </p>
            )}
            {form.costUpdatedAt && (
              <p className="small muted" style={{ marginTop: 8 }}>
                Actualizado el {new Date(form.costUpdatedAt).toLocaleDateString('es-AR')} · {form.costSource ? SOURCE_LABEL[form.costSource] : ''}
                {costInfo?.date ? ` (compra del ${new Date(`${costInfo.date}T12:00:00`).toLocaleDateString('es-AR')})` : ''}
              </p>
            )}
          </section>
          {analysis && effectivePrice && (
            <section className="card">
              <h2>Rentabilidad a {money(effectivePrice)}</h2>
              <dl className="dl">
                <dt>Ganancia por unidad</dt>
                <dd className={analysis.isLoss ? 'danger-text' : ''}>{money(analysis.unitProfit)}</dd>
                <dt>Margen bruto</dt>
                <dd>{pct(analysis.grossMarginPct)}</dd>
                <dt>Margen tras cargos</dt>
                <dd>{pct(analysis.netMarginPct)}</dd>
                <dt>Markup</dt>
                <dd>{pct(analysis.markupPct)}</dd>
                <dt>Precio mínimo</dt>
                <dd>{analysis.breakEven.ok ? money(analysis.breakEven.price) : '—'}</dd>
              </dl>
              {analysis.isLoss && <p className="danger-text small" style={{ marginTop: 8 }}>Con este precio vendés a pérdida.</p>}
            </section>
          )}
          {!isNew && (
            <section className="card">
              <h2>Historial de costos</h2>
              {history && history.length > 0 ? (
                <table className="stack-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Origen</th>
                      <th className="num">Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(0, 20).map((h) => (
                      <tr key={h.id}>
                        <td data-label="Fecha">{new Date(h.at).toLocaleDateString('es-AR')}</td>
                        <td data-label="Origen">
                          {SOURCE_LABEL[h.source]}
                          <div className="small muted">{h.note}</div>
                        </td>
                        <td data-label="Costo" className="num">
                          {money(h.unitCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted small">Cada cambio de costo queda registrado acá.</p>
              )}
            </section>
          )}
        </aside>
      </div>
      {!isNew && <ShareProductDialog open={sharing} onClose={() => setSharing(false)} product={form} settings={settings} price={effectivePrice ?? null} />}
      {confirmNode}
    </>
  );
}
