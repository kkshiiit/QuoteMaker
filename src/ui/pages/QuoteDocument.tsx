import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ensureContrast } from '../theme/theme';
import { useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { recordQuoteDocument } from '../../data/services';
import { formatMoney, formatNumber } from '../../domain/money';
import { buildPublicQuoteDocument, publicFileName, type PublicQuoteDocument } from '../../privacy/publicQuote';
import { formatDate } from '../../privacy/pdf';
import { buildWhatsAppMessage, whatsappUrl } from '../../privacy/whatsapp';
import { copyText, isNative, openExternal, saveFile, shareFile, shareText } from '../../platform/share';
import { Icon } from '../components/Icon';
import { PageHeader, TextField, useToast } from '../components/ui';
import { useSettings } from '../hooks';

/** Vista previa HTML del documento comercial. Recibe SOLO el documento público. */
export function DocumentPreview({ doc, accent }: { doc: PublicQuoteDocument; accent?: string }) {
  const m = (v: string) => formatMoney(v, doc.currency, doc.locale);
  const t = doc.totals;
  return (
    <article className="doc-preview" style={accent ? ({ '--doc-accent': accent } as CSSProperties) : undefined} aria-label={`Vista previa del presupuesto ${doc.number}`}>
      <header className="doc-head">
        <div>
          <p style={{ fontWeight: 800, fontSize: '1.2rem' }}>{doc.business.name || 'Tu negocio'}</p>
          {[doc.business.legalName, doc.business.taxId && `ID fiscal: ${doc.business.taxId}`, [doc.business.phone, doc.business.email].filter(Boolean).join(' · '), doc.business.address, doc.business.website]
            .filter(Boolean)
            .map((l) => (
              <p key={String(l)} className="doc-muted">
                {l}
              </p>
            ))}
        </div>
        <div>
          <p className="doc-title">{doc.isDraft ? 'PRESUPUESTO (BORRADOR)' : 'PRESUPUESTO'}</p>
          <p style={{ textAlign: 'right' }}>N.º {doc.number}</p>
          <p className="doc-muted" style={{ textAlign: 'right' }}>
            Fecha: {formatDate(doc.issueDate, doc.locale)}
          </p>
          {doc.validUntil && (
            <p className="doc-muted" style={{ textAlign: 'right' }}>
              Válido hasta: {formatDate(doc.validUntil, doc.locale)}
            </p>
          )}
        </div>
      </header>
      <section style={{ margin: '18px 0' }}>
        <p className="doc-muted small">PARA</p>
        <p style={{ fontWeight: 700 }}>{doc.customer.name || 'Cliente'}</p>
        {[doc.customer.taxId && `ID fiscal: ${doc.customer.taxId}`, [doc.customer.phone, doc.customer.email].filter(Boolean).join(' · '), doc.customer.address].filter(Boolean).map((l) => (
          <p key={String(l)} className="doc-muted">
            {l}
          </p>
        ))}
      </section>
      <div style={{ overflowX: 'auto' }}>
        <table className="stack-table">
          <thead>
            <tr>
              <th>Descripción</th>
              <th className="num">Cant.</th>
              <th className="num">P. unit.</th>
              <th className="num">Desc.</th>
              <th className="num">Importe</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={i}>
                <td data-label="Descripción" style={{ textAlign: 'left' }}>
                  {l.description}
                </td>
                <td data-label="Cant." className="num">
                  {formatNumber(l.quantity, 3, doc.locale)} {l.unit}
                </td>
                <td data-label="P. unit." className="num">
                  {m(l.unitPrice)}
                </td>
                <td data-label="Desc." className="num">
                  {l.discountPct !== '0' ? `${formatNumber(l.discountPct, 2, doc.locale)} %` : '—'}
                </td>
                <td data-label="Importe" className="num">
                  {m(l.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginLeft: 'auto', maxWidth: 320, marginTop: 14 }}>
        <dl className="dl" style={{ color: '#1c1c1e' }}>
          <dt className="doc-muted">Subtotal</dt>
          <dd>{m(t.subtotal)}</dd>
          {t.globalDiscount !== '0.00' && (
            <>
              <dt className="doc-muted">Descuento ({formatNumber(t.globalDiscountPct, 2, doc.locale)} %)</dt>
              <dd>−{m(t.globalDiscount)}</dd>
            </>
          )}
          {t.tax !== '0.00' && (
            <>
              <dt className="doc-muted">
                {t.taxLabel} ({formatNumber(t.taxPct, 2, doc.locale)} %)
              </dt>
              <dd>{m(t.tax)}</dd>
            </>
          )}
          {t.shipping !== '0.00' && (
            <>
              <dt className="doc-muted">Envío</dt>
              <dd>{m(t.shipping)}</dd>
            </>
          )}
        </dl>
        <div className="doc-total" style={{ marginTop: 10 }}>
          <span>TOTAL</span>
          <span className="num">{m(t.total)}</span>
        </div>
      </div>
      {doc.conditions && (
        <section style={{ marginTop: 18 }}>
          <p className="doc-muted small">CONDICIONES</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{doc.conditions}</p>
        </section>
      )}
      {doc.notes && (
        <section style={{ marginTop: 12 }}>
          <p className="doc-muted small">NOTAS</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{doc.notes}</p>
        </section>
      )}
    </article>
  );
}

export default function QuoteDocument() {
  const { id = '' } = useParams();
  const toast = useToast();
  const settings = useSettings();
  const quote = useLiveQuery(() => db.quotes.get(id).then((q) => q ?? null), [id]);
  const doc = useMemo(() => (quote ? buildPublicQuoteDocument(quote, settings) : null), [quote, settings]);
  const generated = useMemo(() => (doc ? buildWhatsAppMessage(doc) : null), [doc]);
  const [text, setText] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (generated) {
      setText(generated.text);
      setPhone(generated.phone);
    }
  }, [generated]);

  if (quote === null) return <PageHeader title="Presupuesto no encontrado" back={{ to: '/presupuestos', label: 'Presupuestos' }} />;
  if (!quote || !doc) return <p role="status">Cargando…</p>;

  const accent = ensureContrast(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1f6f43', '#ffffff', 4.5);

  const pdf = async (mode: 'save' | 'share') => {
    setBusy(true);
    try {
      const { generateQuotePdf } = await import('../../privacy/pdf');
      const { bytes, fileName } = await generateQuotePdf(doc, { accent });
      const outcome = mode === 'share' ? await shareFile(bytes, fileName, 'application/pdf', `Presupuesto ${doc.number}`) : await saveFile(bytes, fileName, 'application/pdf');
      if (outcome === 'cancelled') {
        toast('Compartir cancelado');
        return;
      }
      await recordQuoteDocument(quote, 'pdf', fileName, outcome === 'shared' ? 'share' : 'download', bytes);
      toast(outcome === 'shared' ? 'PDF listo para compartir' : `PDF descargado: ${fileName}`);
    } catch (e) {
      toast(`No se pudo generar el PDF: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={`Documento ${doc.number}`}
        subtitle="Esto es exactamente lo que ve tu cliente. No incluye costos, márgenes, proveedores ni notas internas."
        back={{ to: `/presupuestos/${quote.id}`, label: `Presupuesto ${quote.number}` }}
      />
      <div className="grid grid-main-aside">
        <DocumentPreview doc={doc} accent={accent} />
        <aside className="stack">
          <section className="card" aria-labelledby="pdfh">
            <h2 id="pdfh">PDF</h2>
            <p className="small muted" style={{ marginBottom: 10 }}>
              Archivo: {publicFileName(doc)}
            </p>
            <div className="stack">
              <button className="btn btn-primary btn-block" onClick={() => pdf('share')} disabled={busy}>
                <Icon name="share" />
                Compartir PDF
              </button>
              <button className="btn btn-block" onClick={() => pdf('save')} disabled={busy}>
                <Icon name="download" />
                {isNative() ? 'Guardar PDF (Archivos / Drive)' : 'Descargar PDF'}
              </button>
            </div>
            {doc.isDraft && <p className="small warn-text" style={{ marginTop: 8 }}>Es un borrador: el PDF dice «BORRADOR». Marcalo como enviado para emitirlo.</p>}
          </section>
          <section className="card" aria-labelledby="wah">
            <h2 id="wah">Mensaje para WhatsApp</h2>
            <TextField label="Teléfono del cliente" value={phone} onChange={setPhone} inputMode="tel" hint="Con código de país, ej. 5491155551234. Vacío = elegís el chat en WhatsApp." />
            <div style={{ marginTop: 12 }}>
              <TextField label="Texto (editable)" multiline value={text} onChange={setText} className="whatsapp-text" />
            </div>
            <div className="stack" style={{ marginTop: 12 }}>
              <button
                className="btn btn-primary btn-block"
                onClick={async () => {
                  openExternal(whatsappUrl(text, phone));
                  await recordQuoteDocument(quote, 'whatsapp', publicFileName(doc, 'txt'), 'open', text);
                }}
              >
                <Icon name="message" />
                Abrir en WhatsApp
              </button>
              <div className="row">
                <button
                  className="btn"
                  style={{ flex: 1 }}
                  onClick={async () => {
                    const ok = await copyText(text);
                    toast(ok ? 'Mensaje copiado' : 'No se pudo copiar', ok ? 'info' : 'error');
                    if (ok) await recordQuoteDocument(quote, 'whatsapp', publicFileName(doc, 'txt'), 'copy', text);
                  }}
                >
                  <Icon name="copy" />
                  Copiar
                </button>
                <button
                  className="btn"
                  style={{ flex: 1 }}
                  onClick={async () => {
                    const r = await shareText(text, `Presupuesto ${doc.number}`);
                    if (r === 'shared') await recordQuoteDocument(quote, 'whatsapp', publicFileName(doc, 'txt'), 'share', text);
                    else toast('Tu navegador no permite compartir texto: usá Copiar.', 'info');
                  }}
                >
                  <Icon name="share" />
                  Compartir
                </button>
              </div>
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>
              QuoteMaker no envía nada por su cuenta: WhatsApp se abre con el texto cargado y vos decidís si enviarlo.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
