import { describe, expect, it } from 'vitest';
import { contrastRatio, PALETTES, resolveTheme } from '../../src/ui/theme/theme';

describe('temas y paletas (contraste WCAG AA en claro y oscuro)', () => {
  const modes = ['light', 'dark'] as const;
  for (const p of PALETTES) {
    for (const mode of modes) {
      it(`${p.name} (${p.group}) en ${mode === 'light' ? 'claro' : 'oscuro'}`, () => {
        const t = resolveTheme({ themeMode: mode, paletteId: p.id, customAccent: null }, false);
        const v = t.vars;
        expect(t.mode).toBe(mode);
        expect(t.pastel).toBe(p.group === 'pasteles');
        // texto normal
        expect(contrastRatio(v['--ink']!, v['--bg']!)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(v['--ink']!, v['--surface']!)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(v['--muted']!, v['--bg']!)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(v['--muted']!, v['--surface-2']!)).toBeGreaterThanOrEqual(4.5);
        // acento como texto/ícono y sobre su fondo suave
        expect(contrastRatio(v['--accent']!, v['--surface']!)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(v['--accent-ink']!, v['--accent-soft']!)).toBeGreaterThanOrEqual(4.5);
        // botón principal (relleno + texto)
        expect(contrastRatio(v['--on-accent-fill']!, v['--accent-fill']!)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(v['--on-accent']!, v['--accent']!)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('un color propio muy claro se trata como pastel y se ajusta para que se lea', () => {
    const t = resolveTheme({ themeMode: 'light', paletteId: 'bosque', customAccent: '#ffee00' }, false);
    expect(t.pastel).toBe(true);
    expect(t.vars['--accent']!.toLowerCase()).not.toBe('#ffee00');
    expect(contrastRatio(t.vars['--accent']!, t.vars['--surface']!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.vars['--on-accent-fill']!, t.vars['--accent-fill']!)).toBeGreaterThanOrEqual(4.5);
  });

  it('hay paletas clásicas y un grupo «(+) Pasteles» de al menos 6 colores', () => {
    expect(PALETTES.filter((p) => p.group === 'clasicos').length).toBeGreaterThanOrEqual(8);
    expect(PALETTES.filter((p) => p.group === 'pasteles').length).toBeGreaterThanOrEqual(6);
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
  });
});
