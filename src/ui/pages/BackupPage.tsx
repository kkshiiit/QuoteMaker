import { useState } from 'react';
import { backupFileName, exportBackup, importBackup, validateBackup } from '../../data/backup';
import { db } from '../../data/db';
import { saveFile } from '../../platform/share';
import { Icon } from '../components/Icon';
import { Dialog, InternalLabel, PageHeader, Segmented, useConfirm, useToast } from '../components/ui';

export default function BackupPage() {
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [pending, setPending] = useState<{ raw: unknown; name: string; counts: string } | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      const file = await exportBackup(__APP_VERSION__);
      const name = backupFileName();
      const out = await saveFile(JSON.stringify(file, null, 2), name, 'application/json');
      if (out !== 'cancelled') {
        await db.meta.put({ key: 'lastBackupAt', value: new Date().toISOString() });
        toast(out === 'downloaded' ? `Respaldo descargado: ${name}` : 'Respaldo listo para guardar');
      }
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File) => {
    try {
      const raw = JSON.parse(await f.text());
      const v = validateBackup(raw);
      if (!v.ok) {
        toast(v.error, 'error');
        return;
      }
      const counts = Object.entries(v.file.data)
        .filter(([, rows]) => (rows as unknown[]).length)
        .map(([c, rows]) => `${(rows as unknown[]).length} ${c}`)
        .join(', ');
      setPending({ raw, name: f.name, counts });
    } catch {
      toast('El archivo no es un JSON válido.', 'error');
    }
  };

  const doImport = async () => {
    if (!pending) return;
    if (mode === 'replace' && !(await confirm('Reemplazar todos los datos', 'Se borran los datos actuales de este dispositivo y se restauran los del respaldo. Te recomendamos exportar un respaldo antes.', 'Reemplazar', true))) return;
    setBusy(true);
    const r = await importBackup(pending.raw, mode);
    setBusy(false);
    setPending(null);
    toast(r.ok ? 'Respaldo importado' : r.error, r.ok ? 'info' : 'error');
  };

  return (
    <>
      <PageHeader title="Respaldo" subtitle="Copias de seguridad versionadas de todos tus datos." />
      <div className="grid grid-2">
        <section className="card">
          <h2>Exportar</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            Descarga un archivo JSON con productos, compras, gastos, clientes y presupuestos.
          </p>
          <div className="internal small" style={{ marginBottom: 12 }}>
            <InternalLabel text="Contiene información interna" />
            <p>Incluye costos, márgenes y notas privadas. Guardalo en un lugar seguro y no lo compartas con clientes.</p>
          </div>
          <button className="btn btn-primary" onClick={doExport} disabled={busy}>
            <Icon name="download" />
            Exportar respaldo
          </button>
        </section>
        <section className="card">
          <h2>Importar</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            Restaurá un respaldo de QuoteMaker (versión 1 o anterior).
          </p>
          <label className="btn">
            <Icon name="upload" />
            Elegir archivo…
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void onFile(f);
              }}
            />
          </label>
        </section>
      </div>
      <Dialog
        open={!!pending}
        onClose={() => setPending(null)}
        title="Importar respaldo"
        actions={
          <>
            <button className="btn" onClick={() => setPending(null)}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={doImport} disabled={busy}>
              Importar
            </button>
          </>
        }
      >
        <p style={{ marginBottom: 10 }}>
          <strong>{pending?.name}</strong>
          <br />
          <span className="small muted">{pending?.counts || 'Sin registros'}</span>
        </p>
        <Segmented<'merge' | 'replace'>
          legend="Cómo importar"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'merge', label: 'Combinar' },
            { value: 'replace', label: 'Reemplazar todo' },
          ]}
        />
        <p className="small muted" style={{ marginTop: 8 }}>
          {mode === 'merge' ? 'Agrega y actualiza registros por identificador; no borra nada.' : 'Borra los datos locales y deja sólo los del respaldo.'}
        </p>
      </Dialog>
      {confirmNode}
    </>
  );
}
