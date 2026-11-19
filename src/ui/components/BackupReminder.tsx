/** Aviso de respaldo en el Inicio (sólo sin nube): evita perder datos si se borra el navegador o se cambia de teléfono. */
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import { backupReminder, snoozeUntil } from '../../domain/backupReminder';
import { ensurePersistentStorage } from '../../platform/storage';
import { useSync } from '../../sync/controller';
import { exportBackupNow } from '../backupActions';
import { Icon } from './Icon';
import { useToast } from './ui';

export function BackupReminder({ firstDataAt }: { firstDataAt: string | null }) {
  const sync = useSync();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const meta = useLiveQuery(async () => ({
    last: ((await db.meta.get('lastBackupAt'))?.value as string | undefined) ?? null,
    snooze: ((await db.meta.get('backupSnoozeUntil'))?.value as string | undefined) ?? null,
  }), []);
  // Con datos propios cargados, se pide al navegador que no borre el almacenamiento.
  useEffect(() => {
    if (firstDataAt) void ensurePersistentStorage();
  }, [firstDataAt]);
  if (!meta) return null;
  const r = backupReminder({ now: new Date().toISOString(), lastBackupAt: meta.last, snoozeUntil: meta.snooze, firstDataAt, cloudSynced: !!(sync.configured && sync.userEmail) });
  if (!r.show) return null;
  return (
    <section className="card soft backup-reminder" role="status" aria-labelledby="bk-h">
      <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <Icon name="database" />
        <div className="grow">
          <h2 id="bk-h">{r.days === null ? 'Todavía no hiciste un respaldo' : `Hace ${r.days} días que no hacés un respaldo`}</h2>
          <p className="small">Tus datos están sólo en este dispositivo. Si se borra el navegador o cambiás de teléfono, el respaldo es la forma de recuperarlos.</p>
        </div>
      </div>
      <div className="actions" style={{ marginTop: 10 }}>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const { outcome, name } = await exportBackupNow();
              if (outcome !== 'cancelled') toast(outcome === 'downloaded' ? `Respaldo descargado: ${name}` : 'Respaldo listo para guardar');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="download" />
          Hacer respaldo ahora
        </button>
        <button className="btn btn-ghost" onClick={() => void db.meta.put({ key: 'backupSnoozeUntil', value: snoozeUntil(new Date().toISOString()) })}>
          Recordar en 7 días
        </button>
        <Link className="btn btn-ghost" to="/nube">
          Activar la nube
        </Link>
      </div>
    </section>
  );
}
