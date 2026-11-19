import { useRef, useState, type CSSProperties } from 'react';
import type { Preferences } from '../../domain/types';
import { Icon } from '../components/Icon';
import { THEME_MODES } from '../components/QuickTheme';
import { PageHeader } from '../components/ui';
import { usePrefs } from '../hooks';
import { contrastRatio, findPalette, hexToRgb, PALETTE_GROUP_LABELS, PALETTES, resolveTheme, type PaletteGroup, type ResolvedTheme } from '../theme/theme';

type Theme = Pick<Preferences, 'themeMode' | 'paletteId' | 'customAccent'>;
type Tab = PaletteGroup | 'propio';

const styleOf = (t: ResolvedTheme): CSSProperties => ({ ...(t.vars as CSSProperties), background: t.vars['--bg'], color: t.vars['--ink'] });

/** Muestra rápida: mini pantalla pintada con los colores del tema. */
function MiniPreview({ theme }: { theme: ResolvedTheme }) {
  return (
    <span className="mini-preview" data-theme={theme.mode} style={styleOf(theme)} aria-hidden="true">
      <span className="mini-glass">
        <span className="mini-row">
          <span className="mini-dot" />
          <span className="mini-line" style={{ width: '58%' }} />
        </span>
        <span className="mini-line muted-line" style={{ width: '80%' }} />
        <span className="mini-row">
          <span className="mini-btn">Aa</span>
          <span className="mini-chip" />
        </span>
      </span>
    </span>
  );
}

/** Personalización: cada toque se aplica al instante en toda la app (la app es la vista previa). */
export default function Personalize() {
  const [prefs, update] = usePrefs();
  const current: Theme = { themeMode: prefs.themeMode, paletteId: prefs.paletteId, customAccent: prefs.customAccent };
  const [tab, setTab] = useState<Tab>(prefs.customAccent ? 'propio' : findPalette(prefs.paletteId).group);
  const [custom, setCustom] = useState(prefs.customAccent ?? '#9a5b55');
  const [undo, setUndo] = useState<Theme | null>(null);
  const [said, setSaid] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const systemDark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  const live = resolveTheme(current, systemDark);

  const apply = (patch: Partial<Theme>, label: string) => {
    setUndo(current);
    void update(patch);
    setSaid(`Aplicado: ${label}`);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaid(''), 2500);
  };
  const customValid = !!hexToRgb(custom);
  const adjusted = !!prefs.customAccent && live.vars['--accent']!.toLowerCase() !== prefs.customAccent.toLowerCase();

  return (
    <>
      <PageHeader title="Personalización" subtitle="Tocá una opción: se aplica al instante en toda la app." />
      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>
      <div className="stack">
        <section className="card" aria-labelledby="p-mode">
          <h2 id="p-mode">Modo</h2>
          <fieldset>
            <legend className="sr-only">Modo de color</legend>
            <div className="choice-grid choice-grid-3">
              {THEME_MODES.map((m) => (
                <label key={m.value} className="choice-card">
                  <input type="radio" name="theme-mode" value={m.value} checked={prefs.themeMode === m.value} onChange={() => apply({ themeMode: m.value }, m.label)} />
                  <MiniPreview theme={resolveTheme({ ...current, themeMode: m.value }, systemDark)} />
                  <span className="choice-label">
                    <Icon name={m.icon} />
                    {m.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="card" aria-labelledby="p-colors">
          <h2 id="p-colors">Colores</h2>
          <div className="segmented tabs-4" role="tablist" aria-label="Tipo de colores" style={{ marginBottom: 12 }}>
            {(['firma', 'clasicos', 'pasteles', 'propio'] as Tab[]).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={`seg-btn ${tab === t ? 'is-on' : ''}`} onClick={() => setTab(t)}>
                {t === 'propio' ? 'Personalizado' : PALETTE_GROUP_LABELS[t]}
              </button>
            ))}
          </div>
          {tab !== 'propio' ? (
            <fieldset>
              <legend className="sr-only">Paleta {PALETTE_GROUP_LABELS[tab]}</legend>
              {tab === 'firma' && <p className="small muted" style={{ marginBottom: 10 }}>Las paletas de la casa: vidrio suave, botones profundos y versión oscura propia.</p>}
              {tab === 'pasteles' && <p className="small muted" style={{ marginBottom: 10 }}>Colores suaves que tiñen el fondo. El texto se ajusta solo para que se lea bien.</p>}
              <div className="choice-grid">
                {PALETTES.filter((p) => p.group === tab).map((p) => (
                  <label key={p.id} className="choice-card">
                    <input type="radio" name="palette" value={p.id} checked={!prefs.customAccent && prefs.paletteId === p.id} onChange={() => apply({ paletteId: p.id, customAccent: null }, p.name)} />
                    <MiniPreview theme={resolveTheme({ themeMode: prefs.themeMode, paletteId: p.id, customAccent: null }, systemDark)} />
                    <span className="choice-label">
                      <span className="chip" style={{ background: p.signature ? p.signature.light.fill : p.accent }} aria-hidden="true" />
                      {p.name}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <div className="field">
              <label htmlFor="custom-color">Color personalizado</label>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input
                  type="color"
                  aria-label="Selector de color"
                  value={customValid ? custom : '#9a5b55'}
                  onChange={(e) => {
                    setCustom(e.target.value);
                    apply({ customAccent: e.target.value }, 'color propio');
                  }}
                  style={{ width: 52, height: 44, border: 0, background: 'transparent' }}
                />
                <input
                  id="custom-color"
                  className="input"
                  value={custom}
                  onChange={(e) => {
                    setCustom(e.target.value);
                    if (hexToRgb(e.target.value)) apply({ customAccent: e.target.value }, 'color propio');
                  }}
                  aria-invalid={!customValid || undefined}
                  aria-describedby="custom-hint"
                />
              </div>
              <span id="custom-hint" className="hint">
                Formato #RRGGBB. {adjusted ? 'Se ajustó el tono para que el texto sea legible (contraste AA).' : 'Contraste verificado automáticamente.'}
                {live.pastel && prefs.customAccent ? ' Es un color claro: se usa como pastel.' : ''}
              </span>
            </div>
          )}
          <p className="small muted" style={{ marginTop: 12 }}>
            Contraste del texto de acento {contrastRatio(live.vars['--accent']!, live.vars['--surface']!).toFixed(1)}:1 · botón {contrastRatio(live.vars['--on-accent-fill']!, live.vars['--accent-fill']!).toFixed(1)}:1 (mínimo 4,5:1)
          </p>
        </section>

        <div className="actions">
          <button className="btn" disabled={!undo} onClick={() => undo && (void update(undo), setUndo(null), setSaid('Cambio deshecho'))}>
            <Icon name="refresh" />
            Deshacer
          </button>
          <button className="btn btn-ghost" onClick={() => apply({ themeMode: 'system', paletteId: 'chediek', customAccent: null }, 'Rosé Chediek automático')}>
            Restablecer
          </button>
        </div>
      </div>
    </>
  );
}
