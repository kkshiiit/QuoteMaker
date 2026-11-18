/**
 * Backups versionados. El archivo contiene TODA la información interna (costos, márgenes,
 * notas privadas): es un respaldo privado del emprendedor, no un documento para clientes.
 */
import { SYNCED_COLLECTIONS, type CollectionName } from '../domain/types';
import { db } from './db';
import { putRecords } from './repo';

export const BACKUP_FORMAT = 'quotemaker-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  app: string;
  data: Partial<Record<CollectionName, unknown[]>>;
}

export async function exportBackup(appVersion = '1.0.0'): Promise<BackupFile> {
  const data: Partial<Record<CollectionName, unknown[]>> = {};
  for (const c of SYNCED_COLLECTIONS) data[c] = await db.coll(c).toArray();
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), app: `Chediek Home ${appVersion}`, data };
}

export function backupFileName(date = new Date()): string {
  return `quotemaker-respaldo-${date.toISOString().slice(0, 10)}.json`;
}

export type ImportResult = { ok: true; counts: Partial<Record<CollectionName, number>> } | { ok: false; error: string };

export function validateBackup(raw: unknown): { ok: true; file: BackupFile } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'El archivo no es un respaldo de QuoteMaker.' };
  const f = raw as Partial<BackupFile>;
  if (f.format !== BACKUP_FORMAT) return { ok: false, error: 'El archivo no es un respaldo de QuoteMaker.' };
  if (typeof f.version !== 'number' || f.version > BACKUP_VERSION) {
    return { ok: false, error: `Versión de respaldo no soportada (${String(f.version)}). Actualizá la app.` };
  }
  if (!f.data || typeof f.data !== 'object') return { ok: false, error: 'El respaldo está vacío o dañado.' };
  for (const [c, rows] of Object.entries(f.data)) {
    if (!SYNCED_COLLECTIONS.includes(c as CollectionName)) return { ok: false, error: `Colección desconocida: ${c}` };
    if (!Array.isArray(rows)) return { ok: false, error: `Colección ${c} dañada.` };
    for (const r of rows) {
      if (!r || typeof r !== 'object' || typeof (r as { id?: unknown }).id !== 'string') return { ok: false, error: `Registro inválido en ${c}.` };
    }
  }
  return { ok: true, file: f as BackupFile };
}

/**
 * Importa un respaldo.
 *  - 'merge': agrega/actualiza registros por id; no borra lo existente.
 *  - 'replace': borra los datos locales y restaura el respaldo.
 * Los registros importados quedan en la cola de sincronización (si cloud está activo).
 */
export async function importBackup(raw: unknown, mode: 'merge' | 'replace'): Promise<ImportResult> {
  const v = validateBackup(raw);
  if (!v.ok) return v;
  const counts: Partial<Record<CollectionName, number>> = {};
  if (mode === 'replace') {
    await db.transaction('rw', SYNCED_COLLECTIONS.map((c) => db.coll(c)), async () => {
      for (const c of SYNCED_COLLECTIONS) await db.coll(c).clear();
    });
  }
  for (const c of SYNCED_COLLECTIONS) {
    const rows = (v.file.data[c] ?? []) as Array<{ id: string; createdAt: string; updatedAt: string }>;
    await putRecords(c, rows);
    counts[c] = rows.length;
  }
  return { ok: true, counts };
}
