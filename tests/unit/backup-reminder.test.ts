import { describe, expect, it } from 'vitest';
import { backupReminder, snoozeUntil } from '../../src/domain/backupReminder';

const now = '2026-11-19T12:00:00.000Z';
const base = { now, lastBackupAt: null, snoozeUntil: null, firstDataAt: '2026-11-10T12:00:00.000Z', cloudSynced: false };

describe('recordatorio de respaldo', () => {
  it('nunca hubo respaldo y ya hay datos de más de un día: avisa', () => {
    expect(backupReminder(base)).toEqual({ show: true, days: null });
  });
  it('datos recién cargados (menos de un día) o sin datos: no molesta', () => {
    expect(backupReminder({ ...base, firstDataAt: '2026-11-19T08:00:00.000Z' }).show).toBe(false);
    expect(backupReminder({ ...base, firstDataAt: null }).show).toBe(false);
  });
  it('avisa a partir de 14 días desde el último respaldo', () => {
    expect(backupReminder({ ...base, lastBackupAt: '2026-11-06T12:00:00.000Z' })).toEqual({ show: false, days: 13 });
    expect(backupReminder({ ...base, lastBackupAt: '2026-11-05T12:00:00.000Z' })).toEqual({ show: true, days: 14 });
  });
  it('con la nube activa no avisa (ya hay copia fuera del dispositivo)', () => {
    expect(backupReminder({ ...base, cloudSynced: true }).show).toBe(false);
  });
  it('«Recordar en 7 días» lo pospone', () => {
    const s = snoozeUntil(now);
    expect(s).toBe('2026-11-26T12:00:00.000Z');
    expect(backupReminder({ ...base, snoozeUntil: s }).show).toBe(false);
    expect(backupReminder({ ...base, now: '2026-11-27T12:00:00.000Z', snoozeUntil: s }).show).toBe(true);
  });
});
