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

pick() { # $1 = nombre de la variable dentro del texto combinado
  printf '%s\n' "${QM_CLOUD_COMBINED:-}" | sed -nE "s/^[[:space:]]*$1[[:space:]]*[=:][[:space:]]*\"?([^\" ]+)\"?[[:space:]]*\$/\\1/p" | head -1
}

URL="${QM_CLOUD_URL:-}"
KEY="${QM_CLOUD_KEY:-}"
[ -n "$URL" ] || URL="$(pick VITE_SUPABASE_URL)"
[ -n "$KEY" ] || KEY="$(pick VITE_SUPABASE_ANON_KEY)"
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
