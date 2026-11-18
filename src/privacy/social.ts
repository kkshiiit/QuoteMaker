/**
 * Perfiles públicos del negocio en redes sociales. Se aceptan URLs completas o @usuario y se
 * normalizan a un link directo al perfil. Sólo se aceptan los dominios de cada red.
 */
export type SocialNetwork = 'instagram' | 'facebook' | 'tiktok';

export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
};

export const SOCIAL_ORDER: SocialNetwork[] = ['instagram', 'facebook', 'tiktok'];

const HOSTS: Record<SocialNetwork, RegExp> = {
  instagram: /^(www\.)?instagram\.com$/i,
  facebook: /^((www|m|web)\.)?(facebook\.com|fb\.com)$/i,
  tiktok: /^(www\.)?tiktok\.com$/i,
};

const BASE: Record<SocialNetwork, (u: string) => string> = {
  instagram: (u) => `https://instagram.com/${u}`,
  facebook: (u) => `https://facebook.com/${u}`,
  tiktok: (u) => `https://tiktok.com/@${u}`,
};

/**
 * Devuelve el link al perfil, '' si está vacío, o null si no es válido para esa red.
 * Ej.: "@chediek.home" → https://instagram.com/chediek.home
 */
export function normalizeSocial(network: SocialNetwork, raw: string | undefined | null): string | null {
  const v = (raw ?? '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v) || /^(www\.)?[a-z]+\.com\//i.test(v)) {
    try {
      const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      if (!HOSTS[network].test(url.hostname)) return null;
      const path = url.pathname.replace(/\/+$/, '');
      if (!path || path === '/') return null;
      return `https://${url.hostname.replace(/^(www|m|web)\./i, '')}${path}${url.search}`;
    } catch {
      return null;
    }
  }
  const user = v.replace(/^@/, '');
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(user)) return null;
  return BASE[network](user);
}

export interface SocialLink {
  network: SocialNetwork;
  label: string;
  url: string;
}

export function socialLinks(settings: { instagram?: string; facebook?: string; tiktok?: string }): SocialLink[] {
  const out: SocialLink[] = [];
  for (const n of SOCIAL_ORDER) {
    const url = normalizeSocial(n, settings[n]);
    if (url) out.push({ network: n, label: SOCIAL_LABELS[n], url });
  }
  return out;
}

/** Bloque de texto con los links, para agregar al final de un mensaje. */
export function socialBlock(links: SocialLink[]): string {
  if (!links.length) return '';
  return ['Seguinos:', ...links.map((l) => `${l.label}: ${l.url}`)].join('\n');
}
