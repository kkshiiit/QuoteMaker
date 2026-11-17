# Instalación

## Requisitos

| Para | Necesitás |
|---|---|
| Usar la versión web | Un navegador moderno (probado en Chromium; ver limitaciones) |
| Usar en Android | Android 6.0+ (API 23), permitir instalar apps de origen desconocido |
| Desarrollar web | Node.js ≥ 20.19 (probado con 22), npm |
| Compilar Android | Además: JDK 21 y Android SDK (Android Studio o command-line tools) |
| Pruebas de integración | PostgreSQL 16 accesible (`npm run test:integration`; falla con un aviso explícito si no hay Postgres) |

## Web

```bash
git clone https://github.com/kkshiiit/QuoteMaker.git
cd QuoteMaker
npm ci
npm run dev          # desarrollo en http://localhost:5173
npm run build        # build de producción en dist/
npm run preview      # sirve dist/ en http://localhost:4173
```

`dist/` es estático (rutas con `#`), por lo que se puede publicar gratis en cualquier hosting estático: GitHub Pages, Cloudflare Pages o Netlify (planes gratuitos, sin dominio pago). Al abrirla, el navegador ofrece **Instalar app** (PWA) y queda disponible sin conexión.

### Publicar en GitHub Pages (gratis)

1. Settings → Pages → Source: *GitHub Actions*.
2. Agregar un workflow que suba `dist/` con `actions/upload-pages-artifact` y `actions/deploy-pages`.

No está activado por defecto: publicarlo hace pública la app (no los datos, que viven en cada dispositivo). Decisión del titular.

## Android

### Instalar el APK

1. Abrí [Actions → CI](https://github.com/kkshiiit/QuoteMaker/actions/workflows/ci.yml), entrá a la última ejecución exitosa de `releases` y descargá el artefacto **quotemaker-apk** (requiere sesión de GitHub). Cuando exista una etiqueta `v*`, el APK se publica en **Releases**.
2. En el teléfono, abrí `app-debug.apk` (o `app-release.apk` si está firmado) y aceptá instalar de origen desconocido.

> El APK de CI sin secretos configurados es de tipo *debug* (firmado con la clave de depuración). Sirve para usar y probar; para distribución estable conviene configurar la firma de release.

### Compilar localmente

```bash
npm ci
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug        # APK en android/app/build/outputs/apk/debug/
```

### Firma de release (opcional, sin secretos en el repo)

```bash
keytool -genkeypair -v -keystore quotemaker.keystore -alias quotemaker -keyalg RSA -keysize 2048 -validity 10000
```

En GitHub → Settings → Secrets and variables → Actions, crear:
`ANDROID_KEYSTORE_BASE64` (`base64 -w0 quotemaker.keystore`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. CI generará `app-release.apk` firmado. Localmente: `QM_KEYSTORE_FILE=/ruta/quotemaker.keystore QM_KEYSTORE_PASSWORD=… QM_KEY_ALIAS=… QM_KEY_PASSWORD=… ./gradlew assembleRelease`.

**Guardá el keystore en un lugar seguro**: si se pierde, las actualizaciones futuras no se podrán instalar encima.

## Supabase (opcional)

Sin estos pasos la app funciona completa en modo local y muestra «Solo en este dispositivo».

1. Crear un proyecto en **supabase.com con el plan Free** (no requiere tarjeta). Límites del plan Free (consultá supabase.com/pricing, pueden cambiar): base de datos de 500 MB, 2 proyectos activos, y **pausa del proyecto tras ~1 semana sin actividad** (se reactiva desde el panel). QuoteMaker sigue funcionando offline mientras tanto.
2. SQL Editor → pegar `supabase/migrations/20261117000001_quotemaker_sync.sql` → Run.
3. Authentication → Providers → Email habilitado. Si dejás «Confirm email», cada cuenta debe confirmar su email antes de iniciar sesión.
4. Project Settings → API: copiar **Project URL** y la clave **anon public** (nunca `service_role`).
5. Crear `.env.local`:
   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon public key>
   ```
6. `npm run build` (y `npx cap sync android` para el APK). En la app: **Sincronización** → crear cuenta o iniciar sesión.

Para CI, agregá esos dos valores como secretos y pasalos como variables de entorno al paso `npm run build` (no se configuró porque no hay proyecto).

## Variables de entorno

| Variable | Uso | Obligatoria |
|---|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase | No |
| `VITE_SUPABASE_ANON_KEY` | Clave pública anon | No |
| `QM_PG_URL` | Postgres para pruebas de integración | No (default `postgres://postgres:postgres@localhost:5432/postgres`) |
| `QM_KEYSTORE_FILE`, `QM_KEYSTORE_PASSWORD`, `QM_KEY_ALIAS`, `QM_KEY_PASSWORD` | Firma Android release | No |

## Pruebas

```bash
npm run typecheck && npm run lint
npm test                 # Vitest: dominio, privacidad, datos, rendimiento
npm run test:integration # PostgreSQL real: migración, RLS con 2 usuarios, motor de sync
npm run build && npm run test:e2e   # Playwright (escritorio + móvil) con axe
```

## Publicar una versión

1. Actualizar `version` en `package.json`, `versionName`/`versionCode` en `android/app/build.gradle` y `CHANGELOG.md`.
2. PR `releases → main`, revisar y fusionar (decisión del titular).
3. `git tag v1.0.0 && git push origin v1.0.0` → CI compila, prueba y publica el APK en Releases.
   Alternativa sin empujar etiquetas: Actions → CI → *Run workflow* sobre la rama `main` con `release_tag` (p. ej. `v1.0.0`); GitHub crea la etiqueta sobre el commit exacto que se compiló y probó, y publica la release al terminar las pruebas. Las etiquetas con sufijo (`-rc.1`) se publican como pre-release.
