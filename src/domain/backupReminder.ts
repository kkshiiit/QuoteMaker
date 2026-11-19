/**
 * Cuándo recordar hacer un respaldo. Sin nube, los datos viven sólo en este dispositivo:
 * si el navegador borra su almacenamiento o se cambia/reinstala el teléfono, el respaldo es la
 * única forma de recuperarlos.
 */
export const BACKUP_EVERY_DAYS = 14;
export const SNOOZE_DAYS = 7;

export interface BackupReminderInput {
  now: string; // ISO
  lastBackupAt: string | null;
  snoozeUntil: string | null;
  /** Fecha del dato más viejo cargado (null = no hay datos propios). */
  firstDataAt: string | null;
  /** La nube está activa y con sesión: hay una copia fuera del dispositivo. */
  cloudSynced: boolean;
}

export interface BackupReminder {
  show: boolean;
  /** Días desde el último respaldo (null = nunca). */
  days: number | null;
}

const DAY = 86400000;

export function backupReminder(i: BackupReminderInput): BackupReminder {
  const now = Date.parse(i.now);
  const days = i.lastBackupAt ? Math.floor((now - Date.parse(i.lastBackupAt)) / DAY) : null;
  if (!i.firstDataAt || i.cloudSynced) return { show: false, days };
  if (i.snoozeUntil && Date.parse(i.snoozeUntil) > now) return { show: false, days };
  if (days === null) {
    // Nunca hubo respaldo: se avisa recién cuando ya hay al menos un día de trabajo cargado.
    return { show: now - Date.parse(i.firstDataAt) >= DAY, days };
  }
  return { show: days >= BACKUP_EVERY_DAYS, days };
}

export function snoozeUntil(now: string, days = SNOOZE_DAYS): string {
  return new Date(Date.parse(now) + days * DAY).toISOString();
}
