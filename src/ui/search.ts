/** Normaliza texto para búsquedas: sin mayúsculas ni acentos ("Martín" ≈ "martin"). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es').trim();
}

export function matches(haystack: string, needle: string): boolean {
  const n = fold(needle);
  return !n || fold(haystack).includes(n);
}
