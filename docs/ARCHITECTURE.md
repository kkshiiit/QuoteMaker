# Arquitectura

## Vista general

```
┌──────────────────────────── UI (React 19 + TypeScript estricto) ───────────────────────────┐
│ src/ui/pages/*  ·  src/ui/components/*  ·  tema (src/ui/theme)  ·  rutas con HashRouter     │
└───────────────┬───────────────────────────────┬──────────────────────────────┬─────────────┘
                │ servicios de negocio          │ documentos comerciales       │ sync (opcional)
┌───────────────▼──────────────┐  ┌─────────────▼──────────────────┐  ┌────────▼─────────────┐
│ src/data/services.ts         │  │ src/privacy/publicQuote.ts     │  │ src/sync/engine.ts   │
│ src/data/repo.ts (outbox)    │  │   ↳ allowlist → PublicQuoteDoc │  │ src/sync/supabase.ts │
│ src/data/db.ts (Dexie/IDB)   │  │ src/privacy/pdf.ts (jsPDF)     │  │ src/sync/controller  │
│ src/data/backup.ts           │  │ src/privacy/whatsapp.ts        │  └────────┬─────────────┘
└───────────────┬──────────────┘  └────────────────────────────────┘           │ HTTPS (anon key + sesión)
┌───────────────▼──────────────────────────────────────────────┐   ┌───────────▼──────────────────┐
│ src/domain/* — lógica pura, sin I/O                           │   │ Supabase Free: Postgres + RLS │
│ money (big.js) · pricing · allocation · costing · quote       │   │ supabase/migrations/*.sql     │
└───────────────────────────────────────────────────────────────┘   └──────────────────────────────┘
Plataformas: Web/PWA (vite-plugin-pwa)  ·  Android (Capacitor 7: WebView + Filesystem + Share)
```

Capas:

| Capa | Carpeta | Responsabilidad | Depende de |
|---|---|---|---|
| Dominio | `src/domain` | Reglas financieras puras y tipos. 100 % testeables. | big.js |
| Privacidad | `src/privacy` | Única frontera hacia documentos de clientes. ESLint prohíbe que importe `data/`, `sync/` o `ui/`. | dominio |
| Datos | `src/data` | IndexedDB, cola de sincronización, servicios de negocio, backups, datos de ejemplo. | dominio, Dexie |
| Sync | `src/sync` | Motor offline-first, adaptador Supabase, estado para la UI. | datos |
| Plataforma | `src/platform` | Compartir/guardar archivos (Web Share, descarga, Sharesheet de Android), imágenes. | Capacitor |
| UI | `src/ui` | Pantallas y componentes accesibles. | todo lo anterior |

## Precisión decimal

- Todo importe se guarda como **string decimal** y se opera con **big.js** (`src/domain/money.ts`). `number` sólo se usa para mostrar ya redondeado (Intl) y para cantidades enteras de UI.
- Escalas: dinero 2 decimales; costo unitario 4 decimales; redondeo **half-up**.
- Distribuciones: método del **mayor resto** al centavo → la suma de partes es exactamente el total.
- Redondeo comercial de precios: siempre **hacia arriba** (no perder margen).
- ESLint prohíbe `parseFloat`. La entrada del usuario se interpreta con `parseDecimalInput` (acepta `1.234,56`, `1234.56`; `100.000` = cien mil, convención es-AR).

## Modelo de costos

1. **Lote** = renglón de una compra. Costo del lote = neto del renglón ± parte de cargos/descuento general de la factura (por valor) + gastos asignados.
2. **Costo actual del producto** = costo unitario real de su lote más reciente; si no hay compras, el costo manual.
3. Cada cambio se registra en `costHistory` (origen: compra, gasto, manual) — el historial nunca se borra.
4. **Gastos**: `unassigned` (no afecta costos), `allocated` (dentro del costo de los lotes) o `void`. Los gastos generales viven en otra colección (`overheads`). El libro de gastos (`expenseLedger`) suma cada gasto una sola vez.
5. Los **presupuestos** guardan en cada ítem el costo unitario del momento y, al marcarse como Enviado, una copia congelada (`frozen`) de negocio, cliente, ítems, impuestos y condiciones.

## Privacidad por diseño

- `buildPublicQuoteDocument(quote, settings)` copia campo por campo una allowlist; `assertPublicDocument` rechaza en tiempo de ejecución cualquier clave extra.
- `generateQuotePdf` y `buildWhatsAppMessage` sólo aceptan `PublicQuoteDocument`.
- Modelos internos (`QuoteInternalCalculation`, `LotCost`, `ProductCost`) jamás se pasan a los generadores.
- Pruebas: `tests/unit/privacy.leak.test.ts` (texto, metadatos y streams descomprimidos del PDF; WhatsApp; nombres de archivo) y `tests/e2e/main-flow.spec.ts` (PDF descargado desde la UI real).

## Offline-first y sincronización

- IndexedDB es la fuente de verdad local. Toda escritura pasa por `repo.putRecord`, que en una sola transacción guarda el registro y encola la mutación (`outbox`) con un `mutationId` (idempotencia).
- Estados visibles por registro: `local`, `pending`, `synced`, `error`, `conflict`.
- Motor (`src/sync/engine.ts`): push en orden → pull por cursor monotónico (`seq`). Versionado optimista por registro; si el servidor tiene una versión más nueva, el registro pasa a **conflicto** con ambas copias guardadas y la persona elige. Backoff exponencial ante errores de red; un solo ciclo a la vez.
- Disparadores: inicio, volver a estar online, volver a la pestaña, cada 5 min visible y 4 s después de un cambio local.

## Por qué Capacitor y no Kotlin/Compose

El prompt maestro sugiere Kotlin + Compose + Room + WorkManager. Se eligió **una sola base de código** (React) empaquetada con **Capacitor** por:

1. **Coherencia financiera y de privacidad**: una única implementación de cálculos, allowlist y pruebas anti-filtración. Duplicarlas en Kotlin multiplica el riesgo de divergencias en dinero y privacidad.
2. **Costo cero y mantenimiento**: un solo equipo/código para web y Android.
3. **Entorno**: este entorno no puede descargar el SDK de Android (`dl.google.com` bloqueado); el APK se compila y prueba en GitHub Actions.

Equivalencias: Room → IndexedDB (Dexie) dentro del WebView; DataStore → tabla `prefs`; WorkManager → disparadores del controlador de sync mientras la app está abierta (no hay sync en segundo plano con la app cerrada: limitación documentada); Sharesheet nativo → `@capacitor/share`; archivos → `@capacitor/filesystem` (caché privada de la app).

## Estructura

```
src/domain      lógica pura (money, pricing, allocation, costing, quote, types)
src/privacy     documento público, PDF, WhatsApp
src/data        db, repo (outbox), services, backup, demo, defaults
src/sync        engine, supabase, controller
src/platform    share, image
src/ui          App, pages/*, components/*, theme/*, styles.css
supabase/       migraciones SQL versionadas
android/        proyecto Capacitor (íconos/splash propios)
tests/unit      Vitest (dominio, privacidad, datos, rendimiento)
tests/integration  Vitest + PostgreSQL real (migración, RLS, sync)
tests/e2e       Playwright + axe (flujos, accesibilidad, responsive, offline)
tests/android   prueba de humo en emulador (CI)
scripts/        marca, recursos Android, capturas/GIFs, medición de rendimiento
```
