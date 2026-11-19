import { describe, expect, it } from 'vitest';
import { elapsedDays, periodOf, shiftPeriod } from '../../src/domain/periods';

describe('períodos del panel de gastos', () => {
  it('día, quincena (1-15 / 16-fin) y mes, incluido febrero bisiesto', () => {
    expect(periodOf('dia', '2026-11-18')).toMatchObject({ from: '2026-11-18', to: '2026-11-18', days: 1 });
    expect(periodOf('quincena', '2026-11-15')).toMatchObject({ from: '2026-11-01', to: '2026-11-15', days: 15 });
    expect(periodOf('quincena', '2026-11-18')).toMatchObject({ from: '2026-11-16', to: '2026-11-30', days: 15, label: '16 al 30 de noviembre 2026' });
    expect(periodOf('quincena', '2028-02-20')).toMatchObject({ from: '2028-02-16', to: '2028-02-29', days: 14 });
    expect(periodOf('mes', '2026-11-18')).toMatchObject({ from: '2026-11-01', to: '2026-11-30', days: 30, label: 'Noviembre 2026' });
  });
  it('anterior y siguiente cruzan meses y años', () => {
    expect(shiftPeriod(periodOf('quincena', '2026-12-20'), 1).from).toBe('2027-01-01');
    expect(shiftPeriod(periodOf('quincena', '2026-12-03'), -1)).toMatchObject({ from: '2026-11-16', to: '2026-11-30' });
    expect(shiftPeriod(periodOf('mes', '2026-03-10'), -1).to).toBe('2026-02-28');
    expect(shiftPeriod(periodOf('dia', '2026-01-01'), -1).from).toBe('2025-12-31');
  });
  it('días transcurridos para el promedio de un período en curso', () => {
    const p = periodOf('mes', '2026-11-18');
    expect(elapsedDays(p, '2026-11-18')).toBe(18);
    expect(elapsedDays(p, '2026-12-05')).toBe(30);
    expect(elapsedDays(p, '2026-10-01')).toBe(0);
  });
});
