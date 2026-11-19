/**
 * Cambio rápido de tema: modo claro / oscuro / automático y colores de firma. Cada toque se
 * aplica al instante a toda la app (la app misma es la vista previa) y se puede deshacer.
 */
import type { Preferences } from '../../domain/types';
import { usePrefs } from '../hooks';
import { findPalette, PALETTES, resolveTheme } from '../theme/theme';
import { Icon } from './Icon';

export const THEME_MODES: Array<{ value: Preferences['themeMode']; label: string; icon: 'sun' | 'moon' | 'sparkle' }> = [
  { value: 'light', label: 'Claro', icon: 'sun' },
  { value: 'dark', label: 'Oscuro', icon: 'moon' },
  { value: 'system', label: 'Automático', icon: 'sparkle' },
];

export function ModeSwitch({ compact = false }: { compact?: boolean }) {
  const [prefs, update] = usePrefs();
  return (
    <div className={`mode-switch ${compact ? 'compact' : ''}`} role="radiogroup" aria-label="Modo de color">
      {THEME_MODES.map((m) => (
        <button key={m.value} type="button" role="radio" aria-checked={prefs.themeMode === m.value} onClick={() => void update({ themeMode: m.value })}>
          <Icon name={m.icon} />
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Muestras de color: círculo partido con el fondo y el botón principal de cada paleta. */
export function PaletteSwatches({ ids, size = 40 }: { ids?: string[]; size?: number }) {
  const [prefs, update] = usePrefs();
  const dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  const list = ids ? ids.map(findPalette) : PALETTES.filter((p) => p.group === 'firma');
  return (
    <div className="palette-swatches" role="radiogroup" aria-label="Colores">
      {list.map((p) => {
        const t = resolveTheme({ themeMode: prefs.themeMode, paletteId: p.id, customAccent: null }, dark);
        const on = !prefs.customAccent && prefs.paletteId === p.id;
        return (
          <button key={p.id} type="button" role="radio" aria-checked={on} aria-label={p.name} title={p.name} className="pal-swatch" style={{ width: size, height: size }} onClick={() => void update({ paletteId: p.id, customAccent: null })}>
            <span style={{ background: `linear-gradient(135deg, ${t.vars['--bg']} 0 50%, ${t.vars['--accent-fill']} 50% 100%)` }} />
          </button>
        );
      })}
    </div>
  );
}
