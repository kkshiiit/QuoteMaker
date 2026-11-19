/** Recibo / comprobante de pedido para el cliente: PDF y WhatsApp sólo con datos públicos. */
import { useMemo, useState } from 'react';
import type { BusinessSettings, Sale } from '../../domain/types';
import { saveFile, shareFile, openExternal } from '../../platform/share';
import { buildPublicReceipt, receiptText } from '../../privacy/publicReceipt';
import { whatsappUrl } from '../../privacy/whatsapp';
import { ensureContrast } from '../theme/theme';
import { useMoney } from '../hooks';
import { Icon } from './Icon';
import { Check, Dialog, TextField, useToast } from './ui';

export function ReceiptDialog({ open, onClose, sale, settings, phone = '' }: { open: boolean; onClose: () => void; sale: Sale; settings: BusinessSettings; phone?: string }) {
  const toast = useToast();
  const money = useMoney();
  const [socials, setSocials] = useState(true);
  const [busy, setBusy] = useState(false);
  const doc = useMemo(() => buildPublicReceipt(sale, settings, { includeSocials: socials }), [sale, settings, socials]);
  const text = useMemo(() => receiptText(doc, money), [doc, money]);
  const [edited, setEdited] = useState<string | null>(null);

  const pdf = async (mode: 'save' | 'share') => {
    setBusy(true);
    try {
      const accent = ensureContrast(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1f6f43', '#ffffff', 4.5);
      const { generateReceiptPdf } = await import('../../privacy/receiptPdf');
      const { bytes, fileName } = await generateReceiptPdf(doc, { accent });
      const outcome = mode === 'share' ? await shareFile(bytes, fileName, 'application/pdf', `${doc.kind} ${doc.number}`) : await saveFile(bytes, fileName, 'application/pdf');
      if (outcome !== 'cancelled') toast(outcome === 'shared' ? 'PDF listo para compartir' : `PDF descargado: ${fileName}`);
    } catch (e) {
      toast(`No se pudo generar el PDF: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${doc.kind} ${doc.number} para el cliente`}
      actions={
        <button className="btn btn-ghost" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      <p className="small muted" style={{ marginTop: 0 }}>
        Sólo datos para el cliente: nunca incluye costos, ganancia, el costo real del envío ni notas internas.
      </p>
      <Check label="Incluir links a mis redes" checked={socials} onChange={setSocials} />
      <TextField label="Mensaje (podés editarlo)" multiline value={edited ?? text} onChange={setEdited} />
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" disabled={busy} onClick={() => void pdf('save')}>
          <Icon name="download" />
          Descargar PDF
        </button>
        <button className="btn" disabled={busy} onClick={() => void pdf('share')}>
          <Icon name="share" />
          Compartir PDF
        </button>
        <button className="btn" onClick={() => openExternal(whatsappUrl(edited ?? text, phone))}>
          <Icon name="message" />
          WhatsApp
        </button>
      </div>
    </Dialog>
  );
}
