/**
 * Almacenamiento persistente: pide al navegador que NO borre los datos de la app cuando falta
 * espacio o el sitio se usa poco (Safari/Chrome pueden desalojar IndexedDB «best effort»).
 * En la app Android los datos viven en el almacenamiento privado de la app y no se desalojan.
 */
import { isNative } from './share';

export type StorageProtection = 'protegido' | 'puede-borrarse' | 'desconocido';

export async function storageProtection(): Promise<StorageProtection> {
  if (isNative()) return 'protegido';
  try {
    if (!navigator.storage?.persisted) return 'desconocido';
    return (await navigator.storage.persisted()) ? 'protegido' : 'puede-borrarse';
  } catch {
    return 'desconocido';
  }
}

let asked = false;
/** Pide protección una vez por sesión (algunos navegadores lo conceden solos; Firefox pregunta). */
export async function ensurePersistentStorage(): Promise<StorageProtection> {
  const now = await storageProtection();
  if (now !== 'puede-borrarse' || asked) return now;
  asked = true;
  try {
    return (await navigator.storage.persist()) ? 'protegido' : 'puede-borrarse';
  } catch {
    return 'puede-borrarse';
  }
}
