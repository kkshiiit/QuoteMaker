import { useEffect, useState } from 'react';
import { getSettings, saveSettings } from '../../data/services';
import { D } from '../../domain/money';
import { ROUNDING_LABELS, type RoundingRule } from '../../domain/pricing';
import type { BusinessSettings } from '../../domain/types';
import { Icon } from '../components/Icon';
import { Check, DecimalField, ErrorSummary, InternalLabel, PageHeader, SelectField, TextField, useToast } from '../components/ui';

const CURRENCIES = ['ARS', 'USD', 'EUR', 'UYU', 'CLP', 'MXN', 'COP', 'PEN', 'BRL', 'PYG', 'BOB'];

export default function SettingsPage() {
  const toast = useToast();
  const [form, setForm] = useState<BusinessSettings | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [initialNext, setInitialNext] = useState(1);
  useEffect(() => {
    void getSettings().then((s) => {
      setForm(s);
      setInitialNext(s.nextQuoteNumber);
    });
  }, []);
  if (!form) return <p role="status">Cargando…</p>;
  const set = <K extends keyof BusinessSettings>(k: K, v: BusinessSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const onSave = async () => {
    const e: string[] = [];
    if (!form.businessName.trim()) e.push('El nombre comercial es obligatorio (aparece en tus presupuestos).');
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.push('El email no es válido.');
    if (D(form.defaultTargetMarginPct || '0').add(D(form.defaultPctCharges || '0')).gte(100)) e.push('Margen objetivo + cargos % deben sumar menos de 100 %.');
    if (!Number.isInteger(form.defaultValidityDays) || form.defaultValidityDays < 0 || form.defaultValidityDays > 365) e.push('La validez debe estar entre 0 y 365 días.');
    if (!Number.isInteger(form.nextQuoteNumber) || form.nextQuoteNumber < 1) e.push('El próximo número debe ser un entero positivo.');
    if (!/^[A-Za-z0-9_-]{0,8}$/.test(form.quotePrefix)) e.push('El prefijo admite hasta 8 letras, números, guion o guion bajo.');
    setErrors(e);
    if (e.length) return;
    // Conserva el próximo número más alto por si se creó un presupuesto mientras se editaba.
    const fresh = await getSettings();
    const next = form.nextQuoteNumber === initialNext ? fresh.nextQuoteNumber : form.nextQuoteNumber;
    await saveSettings({ ...form, nextQuoteNumber: next });
    setForm({ ...form, nextQuoteNumber: next });
    setInitialNext(next);
    toast('Configuración guardada');
  };

  return (
    <>
      <PageHeader title="Configuración" subtitle="Datos de tu negocio y valores por defecto." />
      <ErrorSummary errors={errors} />
      <form
        className="stack"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          void onSave();
        }}
      >
        <section className="card">
          <h2>Identidad comercial</h2>
          <p className="small muted" style={{ marginTop: -6, marginBottom: 12 }}>
            Aparece en el encabezado de PDF y mensajes.
          </p>
          <div className="form-grid cols-2">
            <TextField label="Nombre comercial" required value={form.businessName} onChange={(v) => set('businessName', v)} />
            <TextField label="Razón social" value={form.legalName} onChange={(v) => set('legalName', v)} />
            <TextField label="Teléfono" type="tel" value={form.phone} onChange={(v) => set('phone', v)} />
            <TextField label="Email" type="email" value={form.email} onChange={(v) => set('email', v)} />
            <TextField label="Dirección" value={form.address} onChange={(v) => set('address', v)} />
            <TextField label="Sitio web o red social" value={form.website} onChange={(v) => set('website', v)} />
            <TextField label="CUIT / ID fiscal" value={form.taxId} onChange={(v) => set('taxId', v)} />
          </div>
          <fieldset style={{ marginTop: 12 }}>
            <legend>Mostrar en documentos</legend>
            <div className="form-grid cols-2">
              <Check label="Mostrar teléfono" checked={form.showBusinessContactPhone} onChange={(v) => set('showBusinessContactPhone', v)} />
              <Check label="Mostrar email" checked={form.showBusinessContactEmail} onChange={(v) => set('showBusinessContactEmail', v)} />
              <Check label="Mostrar dirección" checked={form.showBusinessAddress} onChange={(v) => set('showBusinessAddress', v)} />
              <Check label="Mostrar CUIT / ID fiscal" checked={form.showBusinessTaxId} onChange={(v) => set('showBusinessTaxId', v)} />
            </div>
          </fieldset>
        </section>

        <section className="card">
          <h2>Presupuestos</h2>
          <div className="form-grid cols-3">
            <SelectField<string> label="Moneda" value={form.currency} onChange={(v) => set('currency', v)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            <TextField label="Nombre del impuesto" value={form.taxLabel} onChange={(v) => set('taxLabel', v)} hint="IVA, IGV…" />
            <DecimalField label="Impuesto por defecto" suffix="%" value={form.defaultTaxPct} onChange={(v) => set('defaultTaxPct', v || '0')} hint="0 si no discriminás impuestos." />
            <TextField label="Prefijo de numeración" value={form.quotePrefix} onChange={(v) => set('quotePrefix', v)} />
            <TextField label="Próximo número" inputMode="numeric" value={String(form.nextQuoteNumber)} onChange={(v) => set('nextQuoteNumber', Number.parseInt(v.replace(/\D/g, '') || '0', 10))} />
            <TextField label="Validez (días)" inputMode="numeric" value={String(form.defaultValidityDays)} onChange={(v) => set('defaultValidityDays', Number.parseInt(v.replace(/\D/g, '') || '0', 10))} />
            <TextField className="span-all" label="Condiciones por defecto" multiline value={form.defaultConditions} onChange={(v) => set('defaultConditions', v)} />
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Precios y costos</h2>
            <InternalLabel />
          </div>
          <div className="form-grid cols-3">
            <DecimalField label="Margen objetivo" suffix="%" value={form.defaultTargetMarginPct} onChange={(v) => set('defaultTargetMarginPct', v || '0')} hint="Sobre el precio de venta." />
            <DecimalField label="Cargos % sobre precio" suffix="%" value={form.defaultPctCharges} onChange={(v) => set('defaultPctCharges', v || '0')} hint="Comisiones de cobro." />
            <DecimalField label="Costos fijos por unidad" prefix="$" value={form.defaultFixedPerUnit} onChange={(v) => set('defaultFixedPerUnit', v || '0')} />
            <SelectField<RoundingRule> label="Redondeo de precios" value={form.rounding} onChange={(v) => set('rounding', v)} options={(Object.keys(ROUNDING_LABELS) as RoundingRule[]).map((r) => ({ value: r, label: ROUNDING_LABELS[r] }))} />
            <DecimalField label="Unidades vendidas por mes (estimado)" value={form.estimatedMonthlyUnits} onChange={(v) => set('estimatedMonthlyUnits', v || '0')} hint="Para prorratear gastos generales." />
            <TextField label="Costo desactualizado tras (días)" inputMode="numeric" value={String(form.costStaleDays)} onChange={(v) => set('costStaleDays', Number.parseInt(v.replace(/\D/g, '') || '0', 10))} />
          </div>
        </section>
        <div className="sticky-actions actions">
          <button className="btn btn-primary" type="submit">
            <Icon name="check" />
            Guardar configuración
          </button>
        </div>
      </form>
    </>
  );
}
