/**
 * Temas: claro / oscuro / automático + paletas predefinidas + acento personalizado.
 * Los colores de acento se ajustan automáticamente para cumplir contraste WCAG AA (4.5:1)
 * sobre la superficie de cada modo.
 */
import type { Preferences } from '../../domain/types';

export type PaletteGroup = 'clasicos' | 'pasteles';

export interface Palette {
  id: string;
  name: string;
  accent: string; // tono base
  group: PaletteGroup;
  /** Segundo tono para los brillos de fondo (estilo Spatial). */
  glow: string;
}

/**
 * Paletas curadas. Las clásicas son tonos profundos (botones con texto blanco); las «(+) Pasteles»
 * tiñen suavemente el fondo y usan el pastel como relleno de botones con texto oscuro. En todas,
 * el acento usado para texto e íconos se ajusta para cumplir contraste AA.
 */
export const PALETTES: Palette[] = [
  { id: 'bosque', name: 'Bosque', accent: '#1f6f43', glow: '#7cc6a0', group: 'clasicos' },
  { id: 'oceano', name: 'Océano', accent: '#1d5fa8', glow: '#79b4f0', group: 'clasicos' },
  { id: 'terracota', name: 'Terracota', accent: '#b4532a', glow: '#f2a57b', group: 'clasicos' },
  { id: 'ciruela', name: 'Ciruela', accent: '#7a3d8f', glow: '#d39be6', group: 'clasicos' },
  { id: 'grafito', name: 'Grafito', accent: '#3f4752', glow: '#9aa7b8', group: 'clasicos' },
  { id: 'arena', name: 'Arena', accent: '#8a6324', glow: '#e9c98c', group: 'clasicos' },
  { id: 'indigo', name: 'Índigo', accent: '#4338ca', glow: '#a5b4fc', group: 'clasicos' },
  { id: 'petroleo', name: 'Petróleo', accent: '#0f6e75', glow: '#7fd4d9', group: 'clasicos' },
  { id: 'vino', name: 'Vino', accent: '#8e2846', glow: '#f09ab3', group: 'clasicos' },
  { id: 'menta', name: 'Menta', accent: '#9be3c4', glow: '#c9f2df', group: 'pasteles' },
  { id: 'lavanda', name: 'Lavanda', accent: '#c7b8f5', glow: '#e6ddff', group: 'pasteles' },
  { id: 'durazno', name: 'Durazno', accent: '#ffc7a8', glow: '#ffe3d1', group: 'pasteles' },
  { id: 'celeste', name: 'Celeste', accent: '#a8d8f5', glow: '#d6eefc', group: 'pasteles' },
  { id: 'rosa', name: 'Rosa', accent: '#f6b8d1', glow: '#fde0ec', group: 'pasteles' },
  { id: 'limon', name: 'Limón', accent: '#f1e58f', glow: '#fbf5c8', group: 'pasteles' },
];

export const PALETTE_GROUP_LABELS: Record<PaletteGroup, string> = {
  clasicos: 'Clásicos',
  pasteles: '(+) Pasteles',
};

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
  pastel: boolean;
  vars: Record<string, string>;
}

const rgba = (hex: string, a: number) => {
  const c = hexToRgb(hex)!;
  return `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])} / ${a})`;
};

export function findPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
}

export function resolveTheme(prefs: Pick<Preferences, 'themeMode' | 'paletteId' | 'customAccent'>, systemDark: boolean): ResolvedTheme {
  const mode = prefs.themeMode === 'system' ? (systemDark ? 'dark' : 'light') : prefs.themeMode;
  const custom = prefs.customAccent && hexToRgb(prefs.customAccent) ? prefs.customAccent : null;
  const palette = findPalette(prefs.paletteId);
  const base = custom ?? palette.accent;
  const baseRgb = hexToRgb(base)!;
  // Un color propio muy claro se trata como pastel (relleno claro con texto oscuro).
  const pastel = custom ? luminance(baseRgb) > 0.55 : palette.group === 'pasteles';
  const glow = custom ? rgbToHex(mix(baseRgb, [255, 255, 255], 0.45)) : palette.glow;

  const s0 = SURFACES[mode];
  const tint = (hex: string, t: number) => rgbToHex(mix(baseRgb, hexToRgb(hex)!, t));
  // Pasteles: fondo y superficies apenas teñidos del color elegido.
  const s = pastel
    ? mode === 'light'
      ? { ...s0, bg: tint('#ffffff', 0.8), surface2: tint('#ffffff', 0.88), line: tint('#d4d2cb', 0.75) }
      : { ...s0, bg: tint('#101112', 0.93), surface2: tint('#24272a', 0.9), line: tint('#33373b', 0.88) }
    : s0;

  const accent = ensureContrast(base, s.surface, 4.5); // texto/íconos de acento sobre superficie
  const accentRgb = hexToRgb(accent)!;
  const onAccent = contrastRatio('#ffffff', accent) >= 4.5 ? '#ffffff' : '#111111';
  // Relleno de botones: en pasteles, el pastel tal cual con texto oscuro; en clásicos, el acento.
  const fill = pastel ? base : accent;
  const onFill = contrastRatio('#111111', fill) >= contrastRatio('#ffffff', fill) ? '#111111' : '#ffffff';
  const soft = rgbToHex(mix(pastel ? baseRgb : accentRgb, hexToRgb(s.surface)!, mode === 'light' ? (pastel ? 0.55 : 0.88) : 0.78));
  return {
    mode,
    pastel,
    vars: {
      '--bg': s.bg,
      '--surface': s.surface,
      '--surface-2': s.surface2,
      '--ink': s.ink,
      '--muted': s.muted,
      '--line': s.line,
      '--accent': accent,
      '--on-accent': onAccent,
      '--accent-fill': fill,
      '--on-accent-fill': onFill,
      '--accent-soft': soft,
      '--accent-ink': ensureContrast(accent, soft, 4.5),
      // Estilo Spatial: vidrio translúcido, bordes de luz y brillos de fondo.
      '--glass': rgba(s.surface, mode === 'light' ? 0.78 : 0.7),
      '--glass-strong': rgba(s.surface, mode === 'light' ? 0.92 : 0.86),
      '--glass-border': mode === 'light' ? 'rgb(255 255 255 / 0.75)' : 'rgb(255 255 255 / 0.09)',
      '--glow-1': rgba(pastel ? base : glow, mode === 'light' ? 0.38 : 0.2),
      '--glow-2': rgba(glow, mode === 'light' ? 0.3 : 0.14),
    },
  };
}

export function applyTheme(t: ResolvedTheme, el: HTMLElement = document.documentElement) {
  el.dataset.theme = t.mode;
  for (const [k, v] of Object.entries(t.vars)) el.style.setProperty(k, v);
  el.dataset.pastel = t.pastel ? 'true' : 'false';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.vars['--bg']!);
}
