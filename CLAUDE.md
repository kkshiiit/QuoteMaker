# CLAUDE.md — guía para agentes

QuoteMaker: app privada de costos, precios y presupuestos para emprendedores. React 19 + TypeScript estricto + Vite (web/PWA) y Capacitor 7 (Android). Datos locales en IndexedDB (Dexie); sync opcional con Supabase. Idioma de producto y documentación: **español**.

## Reglas no negociables

1. **Privacidad**: nada interno (costos, márgenes, markup, ganancias, proveedores, gastos, notas privadas) puede llegar a PDF, WhatsApp, nombres de archivo, metadatos ni payloads públicos. Los generadores (`src/privacy/pdf.ts`, `whatsapp.ts`) sólo aceptan `PublicQuoteDocument`. Para agregar un campo al documento: agregalo a la allowlist en `src/privacy/publicQuote.ts` **y** a las pruebas anti-filtración.
2. **Dinero**: nunca `number`/`parseFloat` para montos. Usá `D()`, `toDec()`, `roundMoney()` de `src/domain/money.ts`. Montos como string decimal.
3. **Escrituras**: siempre vía `putRecord`/`putRecords`/`deleteRecord` (`src/data/repo.ts`) para que se encolen en la sincronización. Nunca escribir tablas sincronizables directo con Dexie.
4. **Estados de presupuestos**: sólo cambian por acción explícita (`changeQuoteStatus`). Nada automático.
5. **Históricos**: no modificar `quote.frozen` ni borrar `costHistory`.
6. **Costo cero**: no agregar servicios pagos ni dependencias comerciales.
7. **Ramas**: sólo `main` y `releases`. Trabajar en `releases`; PR `releases → main`; no fusionar sin autorización.
8. No declarar algo como probado si no se ejecutó la prueba.

## Comandos

```bash
npm run dev | build | preview
npm run typecheck && npm run lint
npm test                    # unitarias (Vitest)
npm run test:integration    # PostgreSQL real (QM_PG_URL); `service postgresql start` en contenedores Ubuntu
npm run test:e2e            # Playwright + axe sobre el build (requiere npm run build)
npm run media               # capturas y GIFs reales (requiere preview en :4173)
npm run perf                # métricas reales (requiere preview en :4173)
node scripts/render-brand.mjs && node scripts/render-android.mjs   # regenerar íconos
```

`tsc -b` no emite archivos (`noEmit`). Si aparecen `.js` junto a `.ts` en `src/`, borralos: Vite los preferiría.

## Mapa

- `src/domain` lógica pura y tipos · `src/privacy` frontera pública · `src/data` BD, repo, servicios, backup, demo · `src/sync` motor + Supabase · `src/platform` compartir/imágenes · `src/ui` pantallas.
- `supabase/migrations` SQL versionado (probado en `tests/integration`).
- `tests/android` prueba en emulador (sólo CI).
- Docs: `docs/ARCHITECTURE.md`, `DATABASE.md`, `SECURITY.md`.

## Convenciones de UI

Componentes accesibles en `src/ui/components/ui.tsx` (`TextField`, `DecimalField`, `SelectField`, `Dialog`, `useConfirm`, `ErrorSummary`, `PageHeader`). Cada pantalla: un `PageHeader` (h1 enfocable), una acción principal, estados vacíos útiles, errores con `ErrorSummary`. Datos internos marcados con `InternalLabel` y ocultables con «modo cliente».
