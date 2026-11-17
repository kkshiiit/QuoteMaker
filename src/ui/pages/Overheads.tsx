import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { todayIso } from '../../data/defaults';
import { createBase, putRecord } from '../../data/repo';
import { overheadMonthlyEquivalent, overheadPerUnit } from '../../domain/costing';
import { D, sum } from '../../domain/money';
import { OVERHEAD_CATEGORIES, type Overhead, type OverheadFrequency } from '../../domain/types';
import { Icon } from '../components/Icon';
import { Check, DecimalField, EmptyState, ErrorSummary, InternalLabel, PageHeader, Segmented, SelectField, TextField, useToast } from '../components/ui';
import { useMoney, useSettings } from '../hooks';

const FREQ: Record<OverheadFrequency, string> = { once: 'Único', weekly: 'Semanal', monthly: 'Mensual', quarterly: 'Trimestral', yearly: 'Anual' };

export default function Overheads() {
  const { id } = useParams();
  return id ? <OverheadDetail id={id} /> : <OverheadList />;
}

function OverheadList() {
  const money = useMoney();
  const settings = useSettings();
  const list = useLiveQuery(() => db.overheads.toArray(), []);
  if (!list) return <p role="status">Cargando…</p>;
  const active = list.filter((o) => o.active);
  const monthly = sum(active.map(overheadMonthlyEquivalent));
  const perUnit = overheadPerUnit(list, settings.estimatedMonthlyUnits);
  return (
    <>
      <PageHeader
        title="Gastos generales"
        subtitle="Alquiler, servicios, publicidad… Gastos del negocio que no corresponden a una compra puntual."
        actions={
          <Link className="btn btn-primary" to="/gastos-generales/nuevo">
            <Icon name="plus" />
            Nuevo gasto general
          </Link>
        }
      />
      {list.length === 0 ? (
        <EmptyState icon="wallet" title="Sin gastos generales" text="Registrá tus gastos fijos y variables. Si querés, se prorratean por unidad en la calculadora de precios." />
      ) : (
        <>
          <div className="kpis" style={{ marginBottom: 16 }}>
            <div className="kpi">
              <div className="label">Equivalente mensual</div>
              <div className="value">{money(monthly)}</div>
              <div className="context">{active.length} gastos activos (los únicos no suman acá)</div>
            </div>
            <div className="kpi">
              <div className="label">Por unidad vendida</div>
              <div className="value">{perUnit ? money(perUnit) : '—'}</div>
              <div className="context">{perUnit ? `Sobre ${settings.estimatedMonthlyUnits} unidades/mes estimadas` : <Link to="/configuracion">Configurá unidades estimadas por mes</Link>}</div>
            </div>
          </div>
          <ul className="list">
            {list
              .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es'))
              .map((o) => (
                <li key={o.id}>
                  <Link className="list-item" to={`/gastos-generales/${o.id}`}>
                    <div className="grow">
                      <div className="title">{o.name}</div>
                      <div className="sub">
                        {o.category} · {FREQ[o.frequency]} · {o.kind === 'fixed' ? 'Fijo' : 'Variable'}
                        {o.includeInUnitCost ? ' · Se prorratea' : ''}
                      </div>
                    </div>
                    <div className="end">
                      <div className="num">{money(o.amount)}</div>
                      {!o.active && <span className="badge">Inactivo</span>}
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

function OverheadDetail({ id }: { id: string }) {
  const isNew = id === 'nuevo';
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const stored = useLiveQuery(async () => (isNew ? null : ((await db.overheads.get(id)) ?? null)), [id]);
  const [form, setForm] = useState<Overhead | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    if (isNew && !form)
      setForm({ ...createBase(), name: '', category: 'Alquiler', amount: '', currency: settings.currency, frequency: 'monthly', kind: 'fixed', startDate: todayIso(), endDate: null, active: true, includeInUnitCost: false, notes: '' });
    else if (stored && (!form || form.id !== stored.id)) setForm(stored);
  }, [isNew, stored, form, settings.currency]);
  if (stored === null && !isNew) return <PageHeader title="Gasto no encontrado" back={{ to: '/gastos-generales', label: 'Gastos generales' }} />;
  if (!form) return <p role="status">Cargando…</p>;
  const set = <K extends keyof Overhead>(k: K, v: Overhead[K]) => setForm({ ...form, [k]: v });
  const onSave = async () => {
    const errs: string[] = [];
    if (!form.name.trim()) errs.push('Poné un nombre.');
    if (!form.amount || D(form.amount).lte(0)) errs.push('El importe debe ser mayor que cero.');
    if (!form.startDate) errs.push('Indicá la fecha de inicio.');
    if (form.endDate && form.endDate < form.startDate) errs.push('La fecha de fin no puede ser anterior al inicio.');
    setErrors(errs);
    if (errs.length) return;
    await putRecord('overheads', { ...form, name: form.name.trim() });
    toast('Gasto general guardado');
    navigate('/gastos-generales');
  };
  return (
    <>
      <PageHeader title={isNew ? 'Nuevo gasto general' : form.name} back={{ to: '/gastos-generales', label: 'Gastos generales' }} subtitle={<InternalLabel />} />
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
          <div className="form-grid cols-2">
            <TextField label="Nombre" required value={form.name} onChange={(v) => set('name', v)} placeholder="Ej. Alquiler del taller" />
            <SelectField<string> label="Categoría" value={form.category} onChange={(v) => set('category', v)} options={OVERHEAD_CATEGORIES.map((c) => ({ value: c, label: c }))} />
            <DecimalField label="Importe" prefix="$" required value={form.amount} onChange={(v) => set('amount', v)} />
            <SelectField<OverheadFrequency> label="Frecuencia" value={form.frequency} onChange={(v) => set('frequency', v)} options={(Object.keys(FREQ) as OverheadFrequency[]).map((f) => ({ value: f, label: FREQ[f] }))} />
            <TextField label="Desde" type="date" value={form.startDate} onChange={(v) => set('startDate', v)} />
            <TextField label="Hasta (opcional)" type="date" value={form.endDate ?? ''} onChange={(v) => set('endDate', v || null)} />
            <div className="span-all">
              <Segmented<'fixed' | 'variable'> legend="Tipo" value={form.kind} onChange={(v) => set('kind', v)} options={[{ value: 'fixed', label: 'Fijo' }, { value: 'variable', label: 'Variable' }]} />
            </div>
            <Check label="Activo" checked={form.active} onChange={(v) => set('active', v)} />
            <Check
              label="Prorratear por unidad en la calculadora"
              checked={form.includeInUnitCost}
              onChange={(v) => set('includeInUnitCost', v)}
              hint="Se divide el equivalente mensual por las unidades estimadas por mes. No modifica el costo real guardado de los productos."
            />
            <TextField className="span-all" label="Notas" multiline value={form.notes} onChange={(v) => set('notes', v)} />
          </div>
        </section>
        <div className="sticky-actions actions">
          <button className="btn btn-primary" type="submit">
            <Icon name="check" />
            Guardar
          </button>
          <Link className="btn btn-ghost" to="/gastos-generales">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  );
}
