import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Preferences } from '../../domain/types';
import { APP_NAME, Icon, LogoMark } from '../components/Icon';
import { PageHeader, useToast } from '../components/ui';
import { usePrefs } from '../hooks';
import { contrastRatio, findPalette, hexToRgb, PALETTE_GROUP_LABELS, PALETTES, resolveTheme, type PaletteGroup, type ResolvedTheme } from '../theme/theme';

type Draft = Pick<Preferences, 'themeMode' | 'paletteId' | 'customAccent'>;
type Tab = PaletteGroup | 'propio';

const styleOf = (t: ResolvedTheme): CSSProperties => ({ ...(t.vars as CSSProperties), background: t.vars['--bg'], color: t.vars['--ink'] });

/** Mini interfaz pintada con los colores de un tema: se ve el resultado antes de elegirlo. */
function MiniPreview({ theme, label }: { theme: ResolvedTheme; label?: string }) {
  return (
    <span className="mini-preview spatial-bg" data-theme={theme.mode} style={styleOf(theme)} aria-hidden="true">
      <span className="mini-glass">
        <span className="mini-row">
          <span className="mini-dot" />
          <span className="mini-line" style={{ width: '58%' }} />
        </span>
        <span className="mini-line muted-line" style={{ width: '80%' }} />
        <span className="mini-row">
          <span className="mini-btn">{label ?? 'Aa'}</span>
          <span className="mini-chip" />
        </span>
      </span>
    </span>
  );
}

export default function Personalize() {
  const [prefs, update] = usePrefs();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>({ themeMode: prefs.themeMode, paletteId: prefs.paletteId, customAccent: prefs.customAccent });
  const [custom, setCustom] = useState(prefs.customAccent ?? '#1f6f43');
  const [tab, setTab] = useState<Tab>(prefs.customAccent ? 'propio' : findPalette(prefs.paletteId).group);
  useEffect(() => {
    setDraft({ themeMode: prefs.themeMode, paletteId: prefs.paletteId, customAccent: prefs.customAccent });
    if (prefs.customAccent) setCustom(prefs.customAccent);
  }, [prefs.themeMode, prefs.paletteId, prefs.customAccent]);

  const systemDark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  const preview = useMemo(() => resolveTheme(draft, systemDark), [draft, systemDark]);
  const changed = draft.themeMode !== prefs.themeMode || draft.paletteId !== prefs.paletteId || draft.customAccent !== prefs.customAccent;
  const customValid = !!hexToRgb(custom);
  const adjusted = draft.customAccent && preview.vars['--accent']!.toLowerCase() !== draft.customAccent.toLowerCase();
  const effectiveMode = preview.mode;

  const modes: Array<{ value: Preferences['themeMode']; label: string; icon: 'sun' | 'moon' | 'sparkle' }> = [
    { value: 'light', label: 'Claro', icon: 'sun' },
    { value: 'dark', label: 'Oscuro', icon: 'moon' },
    { value: 'system', label: 'Automático', icon: 'sparkle' },
  ];

  return (
    <>
      <PageHeader title="Personalización" subtitle="Elegí el tema y los colores. Todo se ve en la vista previa antes de aplicarlo." />
      <div className="grid grid-main-aside">
        <div className="stack">
          <section className="card" aria-labelledby="p-mode">
            <h2 id="p-mode">Tema</h2>
            <fieldset>
              <legend className="sr-only">Tema</legend>
              <div className="choice-grid choice-grid-3">
                {modes.map((m) => {
                  const t = resolveTheme({ ...draft, themeMode: m.value }, systemDark);
                  return (
                    <label key={m.value} className="choice-card">
                      <input type="radio" name="theme-mode" value={m.value} checked={draft.themeMode === m.value} onChange={() => setDraft({ ...draft, themeMode: m.value })} />
                      <MiniPreview theme={t} />
                      <span className="choice-label">
                        <Icon name={m.icon} />
                        {m.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </section>

          <section className="card" aria-labelledby="p-colors">
            <h2 id="p-colors">Colores</h2>
            <div className="segmented" role="tablist" aria-label="Tipo de colores" style={{ marginBottom: 12 }}>
              {(['clasicos', 'pasteles', 'propio'] as Tab[]).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} className={`seg-btn ${tab === t ? 'is-on' : ''}`} onClick={() => setTab(t)}>
                  {t === 'propio' ? 'Personalizado' : PALETTE_GROUP_LABELS[t]}
                </button>
              ))}
            </div>

            {tab !== 'propio' ? (
              <fieldset>
                <legend className="sr-only">Paleta {PALETTE_GROUP_LABELS[tab]}</legend>
                {tab === 'pasteles' && <p className="small muted" style={{ marginBottom: 10 }}>Colores suaves que tiñen el fondo. El texto se ajusta solo para que se lea bien.</p>}
                <div className="choice-grid">
                  {PALETTES.filter((p) => p.group === tab).map((p) => {
                    const t = resolveTheme({ themeMode: draft.themeMode, paletteId: p.id, customAccent: null }, systemDark);
                    return (
                      <label key={p.id} className="choice-card">
                        <input type="radio" name="palette" value={p.id} checked={!draft.customAccent && draft.paletteId === p.id} onChange={() => setDraft({ ...draft, paletteId: p.id, customAccent: null })} />
                        <MiniPreview theme={t} />
                        <span className="choice-label">
                          <span className="chip" style={{ background: p.accent }} aria-hidden="true" />
                          {p.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
              <div className="stack">
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
                    {preview.pastel && draft.customAccent ? ' Es un color claro: se usa como pastel.' : ''}
                  </span>
                </div>
              </div>
            )}
          </section>

          <div className="sticky-actions actions">
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
            <button className="btn btn-ghost" onClick={() => setDraft({ themeMode: 'system', paletteId: 'chediek', customAccent: null })}>
              Restablecer
            </button>
          </div>
        </div>

        <aside aria-labelledby="prev-h">
          <h2 id="prev-h" style={{ marginBottom: 8 }}>
            Vista previa
          </h2>
          <div className="theme-preview spatial-bg" data-theme={preview.mode} style={styleOf(preview)}>
            <div className="card glass">
              <div className="row" style={{ marginBottom: 10 }}>
                <LogoMark size={28} />
                <strong>{APP_NAME}</strong>
              </div>
              <div className="row-between">
                <strong>Venta V-00012</strong>
                <span className="badge badge-accent">Online · Instagram</span>
              </div>
              <p className="small" style={{ color: preview.vars['--muted'] }}>
                Lucía Fernández · 3 productos
              </p>
              <div className="row" style={{ marginTop: 12 }}>
                <span className="btn btn-primary">Compartir</span>
                <span className="btn">Secundaria</span>
              </div>
            </div>
            <p className="small" style={{ marginTop: 10 }}>
              {effectiveMode === 'dark' ? 'Oscuro' : 'Claro'} · Contraste del acento {contrastRatio(preview.vars['--accent']!, preview.vars['--surface']!).toFixed(2)}:1 · Texto del botón {contrastRatio(preview.vars['--on-accent-fill']!, preview.vars['--accent-fill']!).toFixed(2)}:1
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
