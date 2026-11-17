import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { saveProduct } from '../../data/services';
import { overheadPerUnit } from '../../domain/costing';
import { D, type Dec, toDec } from '../../domain/money';
import { analyzePrice, applyRounding, buildScenarios, ROUNDING_LABELS, solvePrice, type PriceAnalysis, type RoundingRule } from '../../domain/pricing';
import { Check, DecimalField, InternalLabel, SelectField, useToast } from '../components/ui';
import { pct, useMoney, useSettings } from '../hooks';

const REASON = {
  denominator: 'Cargos porcentuales + margen suman 100 % o más: no existe un precio que lo logre. Bajá el margen o los cargos.',
  'negative-cost': 'El costo no puede ser negativo.',
  'invalid-margin': 'El margen y los cargos deben ser positivos.',
} as const;

export default function Calculator() {
  const settings = useSettings();
  const money = useMoney();
  const toast = useToast();
  const [params] = useSearchParams();
  const products = useLiveQuery(() => db.products.filter((p) => !p.archived).toArray(), []);
  const overheads = useLiveQuery(() => db.overheads.toArray(), []);
  const [productId, setProductId] = useState(params.get('producto') ?? '');
  const [cost, setCost] = useState<Dec | ''>('');
  const [fixed, setFixed] = useState<Dec | ''>('');
  const [pctCharges, setPctCharges] = useState<Dec | ''>('');
  const [margin, setMargin] = useState<Dec | ''>('');
  const [tax, setTax] = useState<Dec | ''>('');
  const [qty, setQty] = useState<Dec | ''>('1');
  const [discount, setDiscount] = useState<Dec | ''>('');
  const [current, setCurrent] = useState<Dec | ''>('');
  const [rounding, setRounding] = useState<RoundingRule>(settings.rounding);
  const [useOverhead, setUseOverhead] = useState(false);
  const [init, setInit] = useState(false);

  useEffect(() => {
    if (init || !products) return;
    setFixed(settings.defaultFixedPerUnit === '0' ? '' : settings.defaultFixedPerUnit);
    setPctCharges(settings.defaultPctCharges === '0' ? '' : settings.defaultPctCharges);
    setMargin(settings.defaultTargetMarginPct);
    setTax(settings.defaultTaxPct === '0' ? '' : settings.defaultTaxPct);
    setRounding(settings.rounding);
    const p = products.find((x) => x.id === productId);
    if (p) {
      setCost(p.currentCost ?? '');
      if (p.targetMarginPct) setMargin(p.targetMarginPct);
      setCurrent(p.manualPrice ?? '');
    }
    setInit(true);
  }, [init, products, productId, settings]);

  const overheadUnit = useMemo(() => (overheads ? overheadPerUnit(overheads, settings.estimatedMonthlyUnits) : null), [overheads, settings.estimatedMonthlyUnits]);
  const fixedTotal = D(fixed || '0').plus(useOverhead && overheadUnit ? overheadUnit : 0);

  const result = useMemo(() => {
    if (cost === '') return null;
    const solved = solvePrice({ unitCost: cost, fixedPerUnit: fixedTotal, pctCharges: pctCharges || '0', targetMarginPct: margin || '0' });
    const breakEven = solvePrice({ unitCost: cost, fixedPerUnit: fixedTotal, pctCharges: pctCharges || '0', targetMarginPct: '0' });
    const recommended = solved.ok ? applyRounding(solved.price, rounding) : null;
    const base = { unitCost: cost, fixedPerUnit: toDec(fixedTotal, 4), pctCharges: pctCharges || '0', taxPct: tax || '0', quantity: qty || '1', discountPct: discount || '0' };
    const atRec: PriceAnalysis | null = recommended ? analyzePrice({ ...base, price: recommended.toFixed(2) }) : null;
    const atCurrent: PriceAnalysis | null = current ? analyzePrice({ ...base, price: current }) : null;
    const margins = Array.from(new Set(['20', '30', '40', '50', margin || '0'])).sort((a, b) => D(a).cmp(D(b)));
    const scenarios = buildScenarios({ unitCost: cost, fixedPerUnit: toDec(fixedTotal, 4), pctCharges: pctCharges || '0', margins, rounding, quantity: qty || '1' });
    return { solved, breakEven, recommended, atRec, atCurrent, scenarios };
  }, [cost, fixedTotal, pctCharges, margin, rounding, tax, qty, discount, current]);

  const product = products?.find((p) => p.id === productId);

  return (
    <div className="grid grid-main-aside">
      <section className="card" aria-labelledby="calc-in">
        <div className="card-header">
          <h2 id="calc-in">Variables</h2>
          <InternalLabel text="Interno" />
        </div>
        <div className="form-grid cols-2">
          <SelectField<string>
            className="span-all"
            label="Producto (opcional)"
            value={productId}
            onChange={(v) => {
              setProductId(v);
              const p = products?.find((x) => x.id === v);
              if (p) {
                setCost(p.currentCost ?? '');
                setMargin(p.targetMarginPct ?? settings.defaultTargetMarginPct);
                setCurrent(p.manualPrice ?? '');
              }
            }}
            options={[{ value: '', label: 'Cálculo libre' }, ...(products ?? []).map((p) => ({ value: p.id, label: p.name }))]}
          />
          <DecimalField label="Costo unitario real" prefix="$" value={cost} onChange={setCost} hint="Compra + gastos asignados." />
          <DecimalField label="Costos fijos por unidad" prefix="$" value={fixed} onChange={setFixed} hint="Comisión fija, embalaje, envío no cobrado…" />
          <DecimalField label="Cargos % sobre el precio" suffix="%" value={pctCharges} onChange={setPctCharges} hint="Comisiones de cobro o de plataforma." />
          <DecimalField label="Margen objetivo" suffix="%" value={margin} onChange={setMargin} hint="Sobre el precio de venta (no es markup)." />
          <DecimalField label="Impuesto para el cliente" suffix="%" value={tax} onChange={setTax} />
          <DecimalField label="Descuento a aplicar" suffix="%" value={discount} onChange={setDiscount} />
          <DecimalField label="Cantidad" value={qty} onChange={setQty} />
          <DecimalField label="Precio actual" prefix="$" value={current} onChange={setCurrent} hint="Para comparar con el recomendado." />
          <SelectField<RoundingRule>
            className="span-all"
            label="Redondeo"
            value={rounding}
            onChange={setRounding}
            options={(Object.keys(ROUNDING_LABELS) as RoundingRule[]).map((r) => ({ value: r, label: ROUNDING_LABELS[r] }))}
          />
          <div className="span-all">
            <Check
              label={`Sumar gastos generales por unidad${overheadUnit ? ` (${money(overheadUnit)})` : ''}`}
              checked={useOverhead}
              onChange={setUseOverhead}
              hint={overheadUnit ? 'Gastos generales marcados para prorratear ÷ unidades estimadas por mes (Configuración).' : 'Configurá las unidades estimadas por mes y marcá gastos generales para prorratear.'}
            />
          </div>
        </div>
      </section>

      <aside className="stack" aria-label="Resultados">
        <section className="card" aria-live="polite">
          <h2>Precio recomendado</h2>
          {!result ? (
            <p className="muted">Ingresá el costo unitario para calcular.</p>
          ) : !result.solved.ok ? (
            <p className="danger-text">{REASON[result.solved.reason]}</p>
          ) : (
            <>
              <p className="num" style={{ fontSize: '2rem', fontWeight: 750 }}>
                {money(result.recommended)}
              </p>
              <p className="small muted">
                Sin redondeo: {money(result.solved.price)} · Con impuesto: {result.atRec ? money(result.atRec.priceWithTax) : '—'}
              </p>
              <p className="small muted" style={{ marginTop: 8 }}>
                Fórmula: (costo {money(cost || '0')} + fijos {money(fixedTotal)}) ÷ (1 − cargos {pctCharges || 0} % − margen {margin || 0} %)
              </p>
              {product && result.recommended && (
                <button
                  className="btn btn-sm"
                  style={{ marginTop: 10 }}
                  onClick={async () => {
                    await saveProduct({ ...product, manualPrice: result.recommended!.toFixed(2), targetMarginPct: margin || null });
                    setCurrent(result.recommended!.toFixed(2));
                    toast(`Precio de ${product.name} actualizado`);
                  }}
                >
                  Usar como precio de {product.name}
                </button>
              )}
            </>
          )}
          {result?.breakEven.ok && (
            <p style={{ marginTop: 10 }}>
              Precio mínimo (equilibrio): <strong className="num">{money(result.breakEven.price)}</strong>
            </p>
          )}
        </section>
        {result && (result.atRec || result.atCurrent) && (
          <section className="card">
            <h2>Comparación</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Indicador</th>
                    {result.atCurrent && <th className="num">Actual</th>}
                    {result.atRec && <th className="num">Recomendado</th>}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['Precio neto', (a: PriceAnalysis) => money(a.netPrice)],
                      ['Ganancia c/u', (a: PriceAnalysis) => money(a.unitProfit)],
                      [`Ganancia × ${qty || 1}`, (a: PriceAnalysis) => money(a.totalProfit)],
                      ['Margen bruto', (a: PriceAnalysis) => pct(a.grossMarginPct)],
                      ['Margen tras cargos', (a: PriceAnalysis) => pct(a.netMarginPct)],
                      ['Markup', (a: PriceAnalysis) => pct(a.markupPct)],
                    ] as const
                  ).map(([label, fn]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      {result.atCurrent && <td className={`num ${result.atCurrent.isLoss && label.startsWith('Ganancia') ? 'danger-text' : ''}`}>{fn(result.atCurrent)}</td>}
                      {result.atRec && <td className="num">{fn(result.atRec)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.atCurrent?.isLoss && <p className="danger-text small" style={{ marginTop: 8 }}>El precio actual genera pérdida.</p>}
          </section>
        )}
        {result?.solved.ok && (
          <section className="card">
            <h2>Escenarios</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Margen</th>
                    <th className="num">Precio</th>
                    <th className="num">Markup</th>
                    <th className="num">Ganancia c/u</th>
                  </tr>
                </thead>
                <tbody>
                  {result.scenarios.map((s) => (
                    <tr key={s.targetMarginPct}>
                      <td>{s.targetMarginPct} %</td>
                      <td className="num">{s.rounded ? money(s.rounded) : 'Imposible'}</td>
                      <td className="num">{s.analysis ? pct(s.analysis.markupPct) : '—'}</td>
                      <td className="num">{s.analysis ? money(s.analysis.unitProfit) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}
