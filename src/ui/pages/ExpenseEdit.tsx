import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { matches } from '../search';
import { emptyExpense, saveExpense, voidExpense, deleteExpense } from '../../data/services';
import { ALLOCATION_METHOD_HELP, ALLOCATION_METHOD_LABELS, type AllocationMethod } from '../../domain/allocation';
import { allLots, computeExpenseAllocations, latestLotByProduct, lotsOfPurchase, type Lot } from '../../domain/costing';
import { D } from '../../domain/money';
import { EXPENSE_CATEGORIES, type Expense, type ExpenseTarget } from '../../domain/types';
import { Icon } from '../components/Icon';
import { DecimalField, ErrorSummary, InternalLabel, PageHeader, Segmented, SelectField, TextField, useConfirm, useToast } from '../components/ui';
import { useMoney } from '../hooks';

export default function ExpenseEdit() {
  const { id = 'nuevo' } = useParams();
  const [params] = useSearchParams();
  const isNew = id === 'nuevo';
  const navigate = useNavigate();
  const toast = useToast();
  const money = useMoney();
  const [confirm, confirmNode] = useConfirm();
  const stored = useLiveQuery(async () => (isNew ? null : ((await db.expenses.get(id)) ?? null)), [id]);
  const purchases = useLiveQuery(() => db.purchases.orderBy('date').reverse().toArray(), []);
  const products = useLiveQuery(() => db.products.filter((p) => !p.archived).toArray(), []);
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []);
  const [form, setForm] = useState<Expense | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [prodFilter, setProdFilter] = useState('');

  useEffect(() => {
    if (form) return;
    if (isNew) {
      const e = emptyExpense();
      const c = params.get('compra');
      if (c) Object.assign(e, { target: 'purchase', purchaseId: c });
      setForm(e);
    } else if (stored) setForm(stored);
  }, [isNew, stored, form, params]);

  const names = useMemo(() => new Map((products ?? []).map((p) => [p.id, p.name])), [products]);
  const supplierNames = useMemo(() => new Map((suppliers ?? []).map((s) => [s.id, s.name])), [suppliers]);
  const latest = useMemo(() => latestLotByProduct(allLots(purchases ?? [])), [purchases]);

  const lots: Lot[] = useMemo(() => {
    if (!form || !purchases) return [];
    if (form.target === 'purchase') {
      const p = purchases.find((x) => x.id === form.purchaseId);
      return p ? lotsOfPurchase(p) : [];
    }
    if (form.target === 'products') return form.productIds.map((pid) => latest.get(pid)).filter((l): l is Lot => !!l);
    return [];
  }, [form, purchases, latest]);

  const preview = useMemo(() => {
    if (!form || !purchases || !form.amount || form.target === 'unassigned') return null;
    return computeExpenseAllocations(form, purchases, names);
  }, [form, purchases, names]);

  if (stored === null && !isNew) return <PageHeader title="Gasto no encontrado" back={{ to: '/costos/gastos', label: 'Gastos' }} />;
  if (!form || !purchases || !products) return <p role="status">Cargando…</p>;

  const set = <K extends keyof Expense>(k: K, v: Expense[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const isVoid = form.status === 'void';
  const methodValuesSum = form.method === 'percent' || form.method === 'amount' ? lots.reduce((a, l) => a.plus(D(form.manualValues[l.lotKey] || '0')), D(0)) : null;

  const onSave = async () => {
    const r = await saveExpense(form);
    if (!r.ok) {
      setErrors([r.error]);
      return;
    }
    setErrors([]);
    toast(form.target === 'unassigned' ? 'Gasto guardado sin asignar' : 'Gasto asignado. Costos actualizados.');
    navigate('/costos/gastos');
  };

  return (
    <>
      <PageHeader title={isNew ? 'Registrar gasto' : 'Gasto'} subtitle={isVoid ? 'Anulado' : <InternalLabel />} back={{ to: '/costos/gastos', label: 'Gastos' }} />
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
          <h2>Gasto</h2>
          <div className="form-grid cols-3">
            <SelectField<string> label="Categoría" value={form.category} onChange={(v) => set('category', v)} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))} />
            <DecimalField label="Importe" prefix="$" required value={form.amount} onChange={(v) => set('amount', v)} />
            <TextField label="Fecha" type="date" value={form.date} onChange={(v) => set('date', v)} />
            <TextField className="span-all" label="Descripción" value={form.description} onChange={(v) => set('description', v)} placeholder="Ej. Viaje a Mercado Central" />
          </div>
        </section>

        <section className="card">
          <h2>¿A qué corresponde?</h2>
          <Segmented<ExpenseTarget>
            legend="Destino del gasto"
            value={form.target}
            onChange={(v) => set('target', v)}
            options={[
              { value: 'unassigned', label: 'Sin asignar' },
              { value: 'purchase', label: 'A una compra' },
              { value: 'products', label: 'A productos' },
            ]}
          />
          <p className="small muted" style={{ marginTop: 8 }}>
            {form.target === 'unassigned' && 'Queda pendiente: no afecta costos hasta que lo asignes. Tampoco se suma a gastos generales.'}
            {form.target === 'purchase' && 'Se reparte entre los artículos de la compra elegida y se suma a su costo real.'}
            {form.target === 'products' && 'Se reparte entre el lote más reciente de cada producto elegido.'}
          </p>

          {form.target === 'purchase' && (
            <div style={{ marginTop: 12 }}>
              <SelectField<string>
                label="Compra"
                value={form.purchaseId ?? ''}
                onChange={(v) => setForm({ ...form, purchaseId: v || null, manualValues: {} })}
                options={[
                  { value: '', label: 'Elegí una compra…' },
                  ...purchases
                    .filter((p) => !p.voided)
                    .map((p) => ({
                      value: p.id,
                      label: `${new Date(`${p.date}T12:00:00`).toLocaleDateString('es-AR')} · ${(p.supplierId && supplierNames.get(p.supplierId)) || 'Sin proveedor'} · ${p.items.length} art.`,
                    })),
                ]}
              />
            </div>
          )}

          {form.target === 'products' && (
            <fieldset style={{ marginTop: 12 }}>
              <legend>Productos</legend>
              <label htmlFor="pf" className="sr-only">
                Filtrar productos
              </label>
              <input id="pf" className="input" placeholder="Filtrar…" value={prodFilter} onChange={(e) => setProdFilter(e.target.value)} style={{ marginBottom: 8 }} />
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 10px' }}>
                {products
                  .filter((p) => matches(p.name, prodFilter))
                  .map((p) => {
                    const has = latest.has(p.id);
                    return (
                      <label key={p.id} className="check">
                        <input
                          type="checkbox"
                          checked={form.productIds.includes(p.id)}
                          disabled={!has}
                          onChange={(e) => set('productIds', e.target.checked ? [...form.productIds, p.id] : form.productIds.filter((x) => x !== p.id))}
                        />
                        <span>
                          {p.name}
                          {!has && <span className="small muted"> — sin compras registradas</span>}
                        </span>
                      </label>
                    );
                  })}
              </div>
            </fieldset>
          )}
        </section>

        {form.target !== 'unassigned' && (
          <section className="card" aria-labelledby="dist">
            <h2 id="dist">Criterio de distribución</h2>
            <SelectField<AllocationMethod>
              label="Distribuir"
              value={form.method}
              onChange={(v) => set('method', v)}
              options={(Object.keys(ALLOCATION_METHOD_LABELS) as AllocationMethod[]).map((m) => ({ value: m, label: ALLOCATION_METHOD_LABELS[m] }))}
              hint={ALLOCATION_METHOD_HELP[form.method]}
            />
            {lots.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 14 }}>
                <table className="stack-table">
                  <caption className="sr-only">Desglose previo a confirmar</caption>
                  <thead>
                    <tr>
                      <th>Artículo</th>
                      <th className="num">Unidades</th>
                      {(form.method === 'percent' || form.method === 'amount') && <th>{form.method === 'percent' ? 'Porcentaje' : 'Importe'}</th>}
                      <th className="num">Asignado</th>
                      <th className="num">Por unidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((l) => {
                      const share = preview?.ok ? preview.allocations.find((a) => a.lotKey === l.lotKey) : undefined;
                      return (
                        <tr key={l.lotKey}>
                          <td data-label="Artículo">{names.get(l.productId) ?? 'Producto'}</td>
                          <td data-label="Unidades" className="num">
                            {l.quantity.toString()}
                          </td>
                          {(form.method === 'percent' || form.method === 'amount') && (
                            <td data-label={form.method === 'percent' ? 'Porcentaje' : 'Importe'}>
                              <DecimalField
                                label={`${form.method === 'percent' ? 'Porcentaje' : 'Importe'} para ${names.get(l.productId) ?? 'artículo'}`}
                                suffix={form.method === 'percent' ? '%' : undefined}
                                prefix={form.method === 'amount' ? '$' : undefined}
                                value={form.manualValues[l.lotKey] ?? ''}
                                onChange={(v) => set('manualValues', { ...form.manualValues, [l.lotKey]: v })}
                              />
                            </td>
                          )}
                          <td data-label="Asignado" className="num">
                            {share ? money(share.amount) : '—'}
                          </td>
                          <td data-label="Por unidad" className="num">
                            {share && l.quantity.gt(0) ? money(D(share.amount).div(l.quantity)) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {methodValuesSum && (
              <p className="small" style={{ marginTop: 8 }} aria-live="polite">
                Suma cargada: {form.method === 'percent' ? `${methodValuesSum.toString()} % de 100 %` : `${money(methodValuesSum)} de ${money(form.amount || '0')}`}
              </p>
            )}
            {preview && !preview.ok && (
              <p className="warn-text small" role="status" style={{ marginTop: 8 }}>
                {preview.error}
              </p>
            )}
            {preview?.ok && (
              <p className="ok-text small" style={{ marginTop: 8 }}>
                <Icon name="check" className="sr-only" />
                Desglose listo: la suma asignada es exactamente {money(form.amount)}. Los centavos de redondeo se asignan a los artículos con mayor fracción.
              </p>
            )}
          </section>
        )}

        <section className="card">
          <TextField label="Notas privadas" multiline value={form.notes} onChange={(v) => set('notes', v)} />
        </section>

        <div className="sticky-actions actions">
          {!isVoid && (
            <button className="btn btn-primary" type="submit">
              <Icon name="check" />
              {form.target === 'unassigned' ? 'Guardar gasto' : 'Confirmar y asignar'}
            </button>
          )}
          {!isNew && !isVoid && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                if (!(await confirm('Anular gasto', 'Se quita de los costos de los productos. El historial de costos se conserva.', 'Anular gasto', true))) return;
                await voidExpense(form);
                toast('Gasto anulado. Costos actualizados.');
                navigate('/costos/gastos');
              }}
            >
              Anular
            </button>
          )}
          {isVoid && stored && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                if (!(await confirm('Eliminar gasto', 'El gasto anulado se borra del historial. Los costos no cambian (ya no lo usaban). Esta acción no se puede deshacer.', 'Eliminar', true))) return;
                await deleteExpense(stored);
                toast('Gasto eliminado');
                navigate('/costos/gastos', { replace: true });
              }}
            >
              <Icon name="trash" />
              Eliminar
            </button>
          )}
          {isVoid && (
            <button
              type="button"
              className="btn"
              onClick={() => setForm({ ...form, status: form.target === 'unassigned' ? 'unassigned' : 'allocated' })}
            >
              Reactivar
            </button>
          )}
          <Link className="btn btn-ghost" to="/costos/gastos">
            Cancelar
          </Link>
        </div>
      </form>
      {confirmNode}
    </>
  );
}
