/**
 * Compartir un producto: fotos, videos, descripción, precio y links a las redes del negocio.
 * Por defecto se incluye todo; cada parte se puede desactivar. Lo que se comparte sale de
 * `buildPublicProduct` (allowlist): nunca costos, márgenes, proveedores ni notas internas.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import type { BusinessSettings, Product } from '../../domain/types';
import { dataUrlToFile, openExternal, shareFiles, copyText, type ShareableFile } from '../../platform/share';
import { buildPublicProduct, DEFAULT_SHARE_OPTIONS, productFileBase, productShareText, type ShareOptions } from '../../privacy/publicProduct';
import { whatsappUrl } from '../../privacy/whatsapp';
import { Icon } from './Icon';
import { Check, Dialog, useToast } from './ui';

export function productPhotos(p: Product): string[] {
  if (p.photos && p.photos.length) return p.photos;
  return p.image ? [p.image] : [];
}

export function ShareProductDialog({ open, onClose, product, settings, price }: { open: boolean; onClose: () => void; product: Product; settings: BusinessSettings; price: string | null }) {
  const toast = useToast();
  const videos = useLiveQuery(() => db.productVideos.where('productId').equals(product.id).toArray(), [product.id]);
  const [opts, setOpts] = useState<ShareOptions>(DEFAULT_SHARE_OPTIONS);
  const [text, setText] = useState('');
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const photos = productPhotos(product);

  const doc = useMemo(() => buildPublicProduct(product, settings, price, opts), [product, settings, price, opts]);
  const generated = useMemo(() => productShareText(doc), [doc]);
  useEffect(() => {
    if (!edited) setText(generated);
  }, [generated, edited]);
  useEffect(() => {
    if (open) {
      setOpts(DEFAULT_SHARE_OPTIONS);
      setEdited(false);
    }
  }, [open]);

  const hasFacebook = doc.socials.some((s) => s.network === 'facebook') || !opts.includeSocials;
  const set = (k: keyof ShareOptions, v: boolean) => setOpts((o) => ({ ...o, [k]: v }));

  const files = (): ShareableFile[] => {
    const base = productFileBase(doc);
    const out: ShareableFile[] = [];
    if (opts.includePhotos) photos.forEach((ph, i) => out.push(dataUrlToFile(ph, `${base}-${i + 1}`)));
    if (opts.includeVideos) (videos ?? []).forEach((v, i) => out.push({ name: `${base}-video-${i + 1}.${v.mime.split('/')[1]?.split(';')[0] || 'mp4'}`, mime: v.mime, data: v.blob }));
    return out;
  };

  const share = async () => {
    setBusy(true);
    try {
      const r = await shareFiles(files(), text, product.name);
      if (r === 'downloaded') toast('Tu navegador no comparte archivos: se descargaron y el texto quedó copiado para pegarlo.');
      else if (r === 'saved') toast('Texto copiado: pegalo en tu publicación.');
      else if (r === 'shared') toast('Listo para publicar');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Compartir producto"
      actions={
        <>
          <button className="btn btn-primary" onClick={share} disabled={busy}>
            <Icon name="share" />
            {busy ? 'Preparando…' : 'Compartir'}
          </button>
          <button className="btn" onClick={() => openExternal(whatsappUrl(text))}>
            <Icon name="message" />
            WhatsApp (texto)
          </button>
          <button
            className="btn"
            onClick={async () => {
              const ok = await copyText(text);
              toast(ok ? 'Texto copiado' : 'No se pudo copiar', ok ? 'info' : 'error');
            }}
          >
            <Icon name="copy" />
            Copiar texto
          </button>
        </>
      }
    >
      <div className="share-preview" aria-label="Vista previa de lo que se comparte">
        {opts.includePhotos && photos[0] ? <img src={photos[0]} alt={`Foto de ${product.name}`} className="share-cover" /> : <span className="share-cover share-cover-empty" aria-hidden="true"><Icon name="image" /></span>}
        <div className="share-body">
          <strong>{doc.name}</strong>
          {doc.description && <p className="small">{doc.description}</p>}
          {doc.price && <p className="share-price">{doc.price}</p>}
          <div className="share-meta small muted">
            {opts.includePhotos && photos.length > 0 && <span><Icon name="image" /> {photos.length} foto(s)</span>}
            {opts.includeVideos && (videos?.length ?? 0) > 0 && <span><Icon name="video" /> {videos!.length} video(s)</span>}
            {doc.socials.map((s) => (
              <span key={s.network}>
                <Icon name={s.network} /> {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <fieldset style={{ marginTop: 12 }}>
        <legend>Qué incluir</legend>
        <div className="form-grid cols-2">
          <Check label={`Fotos${photos.length ? ` (${photos.length})` : ' (no hay)'}`} checked={opts.includePhotos} onChange={(v) => set('includePhotos', v)} />
          <Check label={`Videos${videos?.length ? ` (${videos.length})` : ' (no hay)'}`} checked={opts.includeVideos} onChange={(v) => set('includeVideos', v)} />
          <Check label="Precio" checked={opts.includePrice} onChange={(v) => set('includePrice', v)} hint={price ? undefined : 'Sin precio de venta cargado.'} />
          <Check label="Links a mis redes (Instagram, Facebook, TikTok)" checked={opts.includeSocials} onChange={(v) => set('includeSocials', v)} />
        </div>
      </fieldset>
      {!hasFacebook && (
        <p className="warn-text small" role="status" style={{ marginTop: 8 }}>
          Todavía no cargaste tu Facebook. <Link to="/configuracion">Agregalo en Configuración</Link> para que salga el link.
        </p>
      )}

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="share-text">Texto (podés editarlo)</label>
        <textarea
          id="share-text"
          className="input"
          rows={7}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setEdited(true);
          }}
        />
        {edited && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEdited(false)}>
            Volver al texto automático
          </button>
        )}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        Se abre el menú para compartir de tu dispositivo: elegí Instagram, Facebook, TikTok, WhatsApp u otra app. No se publica nada automáticamente.
      </p>
    </Dialog>
  );
}
