import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Preferences } from '../../domain/types';
import { Icon } from '../components/Icon';
import { PageHeader, Segmented, useToast } from '../components/ui';
import { usePrefs } from '../hooks';
import { contrastRatio, hexToRgb, PALETTES, resolveTheme } from '../theme/theme';

export default function Personalize() {
  const [prefs, update] = usePrefs();
  const toast = useToast();
  const [draft, setDraft] = useState<Pick<Preferences, 'themeMode' | 'paletteId' | 'customAccent'>>({ themeMode: prefs.themeMode, paletteId: prefs.paletteId, customAccent: prefs.customAccent });
  const [custom, setCustom] = useState(prefs.customAccent ?? '#1f6f43');
  useEffect(() => {
    setDraft({ themeMode: prefs.themeMode, paletteId: prefs.paletteId, customAccent: prefs.customAccent });
    if (prefs.customAccent) setCustom(prefs.customAccent);
  }, [prefs.themeMode, prefs.paletteId, prefs.customAccent]);

  const systemDark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  const preview = useMemo(() => resolveTheme(draft, systemDark), [draft, systemDark]);
  const changed = draft.themeMode !== prefs.themeMode || draft.paletteId !== prefs.paletteId || draft.customAccent !== prefs.customAccent;
  const customValid = !!hexToRgb(custom);
  const adjusted = draft.customAccent && preview.vars['--accent']!.toLowerCase() !== draft.customAccent.toLowerCase();

  return (
    <>
      <PageHeader title="Personalización" subtitle="Elegí cómo se ve QuoteMaker. Los cambios se previsualizan antes de aplicarse." />
      <div className="grid grid-2">
        <section className="card stack">
          <Segmented<Preferences['themeMode']>
            legend="Tema"
            value={draft.themeMode}
            onChange={(v) => setDraft({ ...draft, themeMode: v })}
            options={[
              { value: 'system', label: 'Automático' },
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Oscuro' },
            ]}
          />
          <fieldset>
            <legend>Paleta</legend>
            <div className="swatches">
              {PALETTES.map((p) => (
                <label key={p.id} className="swatch">
                  <input type="radio" name="palette" checked={!draft.customAccent && draft.paletteId === p.id} onChange={() => setDraft({ ...draft, paletteId: p.id, customAccent: null })} />
                  <span className="chip" style={{ background: p.accent }} aria-hidden="true" />
                  {p.name}
                </label>
              ))}
              <label className="swatch">
                <input type="radio" name="palette" checked={!!draft.customAccent} onChange={() => customValid && setDraft({ ...draft, customAccent: custom })} />
                <span className="chip" style={{ background: customValid ? custom : '#ccc' }} aria-hidden="true" />
                Personalizado
              </label>
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor="custom-color">Color personalizado</label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input
                type="color"
                aria-label="Selector de color"
                value={customValid ? custom : '#1f6f43'}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setDraft({ ...draft, customAccent: e.target.value });
                }}
                style={{ width: 52, height: 44, border: 0, background: 'transparent' }}
              />
              <input
                id="custom-color"
                className="input"
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  if (hexToRgb(e.target.value)) setDraft({ ...draft, customAccent: e.target.value });
                }}
                aria-invalid={!customValid || undefined}
                aria-describedby="custom-hint"
              />
            </div>
            <span id="custom-hint" className="hint">
              Formato #RRGGBB. {adjusted ? 'Se ajustó el tono para que el texto sea legible (contraste AA).' : 'Contraste verificado automáticamente.'}
            </span>
          </div>
          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={!changed}
              onClick={async () => {
                await update(draft);
                toast('Tema aplicado');
              }}
            >
              <Icon name="check" />
              Aplicar
            </button>
            <button className="btn" disabled={!changed} onClick={() => setDraft({ themeMode: prefs.themeMode, paletteId: prefs.paletteId, customAccent: prefs.customAccent })}>
              Descartar
            </button>
            <button className="btn btn-ghost" onClick={() => setDraft({ themeMode: 'system', paletteId: 'bosque', customAccent: null })}>
              Restablecer
            </button>
          </div>
        </section>
        <section aria-labelledby="prev-h">
          <h2 id="prev-h" style={{ marginBottom: 8 }}>
            Vista previa
          </h2>
          <div className="theme-preview" data-theme={preview.mode} style={{ ...(preview.vars as CSSProperties), background: preview.vars['--bg'], color: preview.vars['--ink'] }}>
            <div className="card">
              <div className="row-between">
                <strong>Presupuesto P-00012</strong>
                <span className="badge badge-accent">Enviado</span>
              </div>
              <p className="muted small" style={{ color: preview.vars['--muted'] }}>
                Lucía Fernández · 3 ítems
              </p>
              <div className="row" style={{ marginTop: 12 }}>
                <span className="btn btn-primary">Acción principal</span>
                <span className="btn">Secundaria</span>
              </div>
            </div>
            <p className="small" style={{ marginTop: 10 }}>
              Contraste del acento: {contrastRatio(preview.vars['--accent']!, preview.vars['--surface']!).toFixed(2)}:1 · Texto sobre botón: {contrastRatio(preview.vars['--on-accent']!, preview.vars['--accent']!).toFixed(2)}:1
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
