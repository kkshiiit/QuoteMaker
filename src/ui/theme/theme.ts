/**
 * Temas: claro / oscuro / automático + paletas predefinidas + acento personalizado.
 * Los colores de acento se ajustan automáticamente para cumplir contraste WCAG AA (4.5:1)
 * sobre la superficie de cada modo.
 */
import type { Preferences } from '../../domain/types';

export interface Palette {
  id: string;
  name: string;
  accent: string; // tono base
}

export const PALETTES: Palette[] = [
  { id: 'bosque', name: 'Bosque', accent: '#1f6f43' },
  { id: 'oceano', name: 'Océano', accent: '#1d5fa8' },
  { id: 'terracota', name: 'Terracota', accent: '#b4532a' },
  { id: 'ciruela', name: 'Ciruela', accent: '#7a3d8f' },
  { id: 'grafito', name: 'Grafito', accent: '#3f4752' },
];

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(rgb: RGB): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrastRatio(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return 1;
  const [l1, l2] = [luminance(ra), luminance(rb)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Oscurece (o aclara) el color hasta lograr el contraste pedido contra `bg`. */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!f || !b) return fg;
  if (contrastRatio(fg, bg) >= min) return fg;
  const target: RGB = luminance(b) > 0.5 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = rgbToHex(mix(f, target, t));
    if (contrastRatio(c, bg) >= min) return c;
  }
  return rgbToHex(target);
}

export const SURFACES = {
  light: { bg: '#f6f5f1', surface: '#ffffff', surface2: '#efeee9', ink: '#1b1c1e', muted: '#5c5f66', line: '#dddbd3' },
  dark: { bg: '#121314', surface: '#1b1d1f', surface2: '#24272a', ink: '#ecebe7', muted: '#a8abb1', line: '#33373b' },
} as const;

export interface ResolvedTheme {
  mode: 'light' | 'dark';
  vars: Record<string, string>;
}

export function resolveTheme(prefs: Pick<Preferences, 'themeMode' | 'paletteId' | 'customAccent'>, systemDark: boolean): ResolvedTheme {
  const mode = prefs.themeMode === 'system' ? (systemDark ? 'dark' : 'light') : prefs.themeMode;
  const s = SURFACES[mode];
  const base = (prefs.customAccent && hexToRgb(prefs.customAccent) ? prefs.customAccent : PALETTES.find((p) => p.id === prefs.paletteId)?.accent) ?? PALETTES[0]!.accent;
  const accent = ensureContrast(base, s.surface, 4.5); // texto/íconos de acento sobre superficie
  const accentRgb = hexToRgb(accent)!;
  const onAccent = contrastRatio('#ffffff', accent) >= 4.5 ? '#ffffff' : '#111111';
  const soft = rgbToHex(mix(accentRgb, hexToRgb(s.surface)!, mode === 'light' ? 0.88 : 0.78));
  return {
    mode,
    vars: {
      '--bg': s.bg,
      '--surface': s.surface,
      '--surface-2': s.surface2,
      '--ink': s.ink,
      '--muted': s.muted,
      '--line': s.line,
      '--accent': accent,
      '--on-accent': onAccent,
      '--accent-soft': soft,
      '--accent-ink': ensureContrast(accent, soft, 4.5),
    },
  };
}

export function applyTheme(t: ResolvedTheme, el: HTMLElement = document.documentElement) {
  el.dataset.theme = t.mode;
  for (const [k, v] of Object.entries(t.vars)) el.style.setProperty(k, v);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.vars['--bg']!);
}
