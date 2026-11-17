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
