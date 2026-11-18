/** Reduce imágenes en el dispositivo (sin servicios externos) para no bloquear la UI ni pesar en la base. */
export async function resizeImage(file: File, max = 480): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen.');
  if (file.size > 25 * 1024 * 1024) throw new Error('La imagen supera 25 MB.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const webp = canvas.toDataURL('image/webp', 0.8);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.82);
}

export function readFileAsDataUrl(file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) return Promise.reject(new Error(`El archivo supera ${Math.round(maxBytes / 1024)} KB.`));
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('No se pudo leer el archivo.'));
    r.readAsDataURL(file);
  });
}

/** Foto para compartir: hasta 1280 px, WebP (o JPEG si el navegador no codifica WebP). */
export function resizePhoto(file: File): Promise<string> {
  return resizeImage(file, 1280);
}

export const MAX_PHOTOS = 6;
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

export function validateVideo(file: File): string | null {
  if (!file.type.startsWith('video/')) return 'El archivo no es un video.';
  if (file.size > MAX_VIDEO_BYTES) return `El video supera ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB.`;
  return null;
}

/** Miniatura (480 px) a partir de una foto ya guardada como data URL (sin fetch: respeta la CSP). */
export async function thumbFromDataUrl(dataUrl: string, max = 480): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL('image/webp', 0.8);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.82);
}
