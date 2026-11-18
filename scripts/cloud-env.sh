#!/usr/bin/env bash
# Resuelve la configuración de la nube (Supabase) para la CI y la exporta a $GITHUB_ENV.
#
# Fuentes, en orden: secretos VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, variables del
# repositorio con el mismo nombre, o un secreto combinado (QM_CLOUD_COMBINED) con líneas
# "VITE_SUPABASE_URL = …" y "VITE_SUPABASE_ANON_KEY = …".
#
# Sólo acepta la clave pública (publishable/anon); rechaza claves secretas o service_role.
# Nunca imprime la clave: sólo informa si está presente y su longitud.
set -euo pipefail

# Extrae del texto combinado la URL del proyecto y la clave pública, sin depender del formato
# (nombres, "=", comillas, espacios, CRLF o caracteres invisibles copiados del navegador).
combined_url() {
  # Acepta con o sin https://, mayúsculas o espacios alrededor; devuelve https://<ref>.supabase.co
  local ref
  ref="$(printf '%s' "${QM_CLOUD_COMBINED:-}" | tr -d '\r' | grep -oiE '[a-z0-9-]{10,}\.supabase\.(co|com|in)' | head -1 | cut -d. -f1 | tr 'A-Z' 'a-z' || true)"
  [ -n "$ref" ] && printf 'https://%s.supabase.co' "$ref" || true
}
combined_key() { printf '%s' "${QM_CLOUD_COMBINED:-}" | tr -d '\r' | grep -oE 'sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' | head -1 || true; }
combined_secret() { printf '%s' "${QM_CLOUD_COMBINED:-}" | grep -qE 'sb_secret_|service_role'; }

URL="${QM_CLOUD_URL:-}"
KEY="${QM_CLOUD_KEY:-}"
[ -n "$URL" ] || URL="$(combined_url)"
[ -n "$KEY" ] || KEY="$(combined_key)"
if combined_secret; then
  echo "::error::El secreto combinado contiene una clave SECRETA. Usá sólo la publishable (sb_publishable_…)."
  exit 1
fi
URL="$(printf '%s' "$URL" | tr -d '[:space:]')"
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"

case "$KEY" in
  sb_secret_* | *service_role*)
    echo "::error::Se configuró una clave SECRETA. Usá sólo la publishable (sb_publishable_…) o la anon."
    exit 1 ;;
esac
if [ -n "$URL" ] && ! printf '%s' "$URL" | grep -Eq '^https://[a-z0-9-]+\.supabase\.co/?$'; then
  echo "::error::VITE_SUPABASE_URL no tiene el formato https://<ref>.supabase.co"
  exit 1
fi

[ -n "$KEY" ] && echo "::add-mask::$KEY"
if [ -z "$URL" ] && [ -n "${QM_CLOUD_COMBINED:-}" ]; then
  # Diagnóstico sin revelar contenido: letras → a/A, dígitos → 9 (se ve sólo la forma de cada línea).
  echo "Forma del secreto combinado (sin valores):"
  printf '%s\n' "$QM_CLOUD_COMBINED" | tr -d '\r' | sed -E 's/[a-z]/a/g; s/[A-Z]/A/g; s/[0-9]/9/g; s/a+/a…/g; s/A+/A…/g; s/9+/9…/g' | sed 's/^/  │ /'
fi
echo "Nube · URL: ${URL:-AUSENTE}"
if [ -n "$KEY" ]; then echo "Nube · clave: presente (${#KEY} caracteres)"; else echo "Nube · clave: AUSENTE"; fi

if [ -n "$URL" ] && [ -n "$KEY" ]; then
  {
    echo "VITE_SUPABASE_URL=$URL"
    echo "VITE_SUPABASE_ANON_KEY=$KEY"
    echo "QM_SUPABASE_URL=$URL"
    echo "QM_SUPABASE_ANON_KEY=$KEY"
    echo "QM_CLOUD=1"
  } >> "${GITHUB_ENV:-/dev/null}"
else
  echo "Sin configuración de nube: se compila en modo local (Solo en este dispositivo)."
fi
