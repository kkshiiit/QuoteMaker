/**
 * Períodos del panel de gastos. Quincena = del 1 al 15 y del 16 al último día del mes
 * (períodos calendario, no móviles). Fechas en YYYY-MM-DD, sin zonas horarias.
 */
export type PeriodKind = 'dia' | 'quincena' | 'mes';

export interface Period {
  kind: PeriodKind;
  from: string;
  to: string;
  days: number;
  label: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function periodOf(kind: PeriodKind, date: string): Period {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  if (kind === 'dia') return { kind, from: date, to: date, days: 1, label: `${d} de ${MONTHS[m - 1]} de ${y}` };
  if (kind === 'mes') {
    const ld = lastDay(y, m);
    return { kind, from: iso(y, m, 1), to: iso(y, m, ld), days: ld, label: `${MONTHS[m - 1]![0]!.toUpperCase()}${MONTHS[m - 1]!.slice(1)} ${y}` };
  }
  const first = d <= 15;
  const ld = lastDay(y, m);
  return first
    ? { kind, from: iso(y, m, 1), to: iso(y, m, 15), days: 15, label: `1 al 15 de ${MONTHS[m - 1]} ${y}` }
    : { kind, from: iso(y, m, 16), to: iso(y, m, ld), days: ld - 15, label: `16 al ${ld} de ${MONTHS[m - 1]} ${y}` };
}

/** Período anterior (-1) o siguiente (+1). */
export function shiftPeriod(p: Period, dir: -1 | 1): Period {
  const [y, m, d] = (dir < 0 ? p.from : p.to).split('-').map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d) + dir * 86400000;
  const n = new Date(t);
  return periodOf(p.kind, iso(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate()));
}

/** Días transcurridos del período hasta `today` (para el promedio diario de un período en curso). */
export function elapsedDays(p: Period, today: string): number {
  if (today < p.from) return 0;
  if (today >= p.to) return p.days;
  const a = Date.UTC(...(p.from.split('-').map(Number) as [number, number, number]).map((v, i) => (i === 1 ? v - 1 : v)) as [number, number, number]);
  const b = Date.UTC(...(today.split('-').map(Number) as [number, number, number]).map((v, i) => (i === 1 ? v - 1 : v)) as [number, number, number]);
  return Math.round((b - a) / 86400000) + 1;
}
