import { backupFileName, exportBackup } from '../data/backup';
import { db } from '../data/db';
import { saveFile, type ShareOutcome } from '../platform/share';

/** Exporta el respaldo completo y registra la fecha (si no se canceló). */
export async function exportBackupNow(): Promise<{ outcome: ShareOutcome; name: string }> {
  const file = await exportBackup(__APP_VERSION__);
  const name = backupFileName();
  const outcome = await saveFile(JSON.stringify(file, null, 2), name, 'application/json');
  if (outcome !== 'cancelled') {
    await db.meta.put({ key: 'lastBackupAt', value: new Date().toISOString() });
    await db.meta.delete('backupSnoozeUntil');
  }
  return { outcome, name };
}
