/**
 * Compartir/guardar archivos y textos.
 *  - Android (Capacitor): guarda en la caché privada y abre el Sharesheet nativo
 *    (desde ahí se puede enviar por WhatsApp, guardar en Drive o en Archivos).
 *  - Web: Web Share API si el navegador la soporta; si no, descarga directa.
 * Nunca se envía nada automáticamente: el destino lo elige la persona.
 */
import { Capacitor } from '@capacitor/core';

export const isNative = () => Capacitor.isNativePlatform();

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function downloadBytes(bytes: Uint8Array | string, fileName: string, mime: string) {
  const blob = new Blob([typeof bytes === 'string' ? bytes : (bytes as BlobPart)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export type ShareOutcome = 'shared' | 'downloaded' | 'saved' | 'cancelled';

/** Comparte un archivo. Devuelve qué ocurrió realmente (no se asume éxito). */
export async function shareFile(bytes: Uint8Array | string, fileName: string, mime: string, title: string): Promise<ShareOutcome> {
  if (isNative()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const written = await Filesystem.writeFile(
      typeof bytes === 'string'
        ? { path: fileName, data: bytes, directory: Directory.Cache, encoding: Encoding.UTF8 }
        : { path: fileName, data: toBase64(bytes), directory: Directory.Cache },
    );
    try {
      await Share.share({ title, files: [written.uri], dialogTitle: title });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const file = new File([typeof bytes === 'string' ? bytes : (bytes as BlobPart)], fileName, { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
    }
  }
  downloadBytes(bytes, fileName, mime);
  return 'downloaded';
}

/** Guarda localmente (descarga en web; en Android, Documentos de la app + Sharesheet para elegir destino). */
export async function saveFile(bytes: Uint8Array | string, fileName: string, mime: string): Promise<ShareOutcome> {
  if (isNative()) return shareFile(bytes, fileName, mime, fileName);
  downloadBytes(bytes, fileName, mime);
  return 'downloaded';
}

export interface ShareableFile {
  name: string;
  mime: string;
  data: Blob | Uint8Array;
}

async function blobToBase64(b: Blob): Promise<string> {
  return toBase64(new Uint8Array(await b.arrayBuffer()));
}

/**
 * Comparte varios archivos (fotos/videos) junto con un texto.
 *  - Android: escribe en la caché privada y abre el Sharesheet (Instagram, Facebook, TikTok, WhatsApp…).
 *  - Web: Web Share API con archivos si el navegador la soporta; si no, descarga los archivos
 *    y copia el texto al portapapeles para pegarlo en la publicación.
 * Sin archivos, comparte sólo el texto.
 */
export async function shareFiles(files: ShareableFile[], text: string, title: string): Promise<ShareOutcome> {
  if (!files.length) {
    const r = await shareText(text, title);
    if (r !== 'cancelled' || isNative()) return r;
    return (await copyText(text)) ? 'saved' : 'cancelled';
  }
  if (isNative()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const uris: string[] = [];
    for (const f of files) {
      const data = f.data instanceof Blob ? await blobToBase64(f.data) : toBase64(f.data);
      const w = await Filesystem.writeFile({ path: f.name, data, directory: Directory.Cache });
      uris.push(w.uri);
    }
    try {
      await Share.share({ title, text, files: uris, dialogTitle: title });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const webFiles = files.map((f) => new File([f.data as BlobPart], f.name, { type: f.mime }));
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: webFiles })) {
    try {
      await nav.share({ files: webFiles, text, title });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
    }
  }
  for (const f of files) downloadBytes(f.data instanceof Blob ? new Uint8Array(await f.data.arrayBuffer()) : f.data, f.name, f.mime);
  await copyText(text);
  return 'downloaded';
}

/** Convierte un data URL (foto guardada) en bytes compartibles. */
export function dataUrlToFile(dataUrl: string, baseName: string): ShareableFile {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error('Imagen inválida');
  const mime = m[1]!;
  const raw = m[2] ? atob(m[3]!) : decodeURIComponent(m[3]!);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'img';
  return { name: `${baseName}.${ext}`, mime, data: bytes };
}

export async function shareText(text: string, title: string): Promise<ShareOutcome> {
  if (isNative()) {
    const { Share } = await import('@capacitor/share');
    try {
      await Share.share({ title, text, dialogTitle: title });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ text, title });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  return 'cancelled';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function openExternal(url: string) {
  if (isNative()) {
    // En Android, Capacitor deriva las URLs externas al sistema (abre WhatsApp o el navegador).
    window.location.href = url;
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
