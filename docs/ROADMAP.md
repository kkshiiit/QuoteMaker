# Roadmap y estado real

## Estado real

Leyenda: ✅ implementado y probado · 🟡 implementado, verificación parcial · ⏳ pendiente / bloqueado

| Área | Estado | Evidencia / detalle |
|---|---|---|
| Dominio financiero decimal (margen, markup, precio objetivo, equilibrio, redondeos, escenarios) | ✅ | `tests/unit/domain.money-pricing.test.ts` |
| Distribución de gastos (6 criterios), residuos, anulación, reasignación | ✅ | `tests/unit/domain.costing.test.ts`, e2e |
| Costo real por lote + historial; no doble conteo | ✅ | unitarias + `data.services.test.ts` + e2e |
| Productos, categorías, proveedores, compras, gastos, gastos generales | ✅ | e2e (flujo completo) |
| Clientes privados | ✅ | e2e |
| Presupuestos: estados manuales, copia congelada, duplicar, historial | ✅ | unitarias + e2e |
| PDF y WhatsApp sin filtraciones | ✅ | anti-filtración unitaria + e2e (PDF descargado) |
| Persistencia local (IndexedDB) y reapertura | ✅ | unitaria (reapertura de BD), e2e (recarga), Android (force-stop + reapertura) |
| Offline (PWA) | ✅ | e2e offline |
| Respaldo/importación versionados | ✅ | unitarias |
| Accesibilidad WCAG 2.2 AA (automática) | ✅ | axe en 25 pantallas × 2 tamaños |
| Responsive (sin scroll horizontal) | ✅ | e2e escritorio/móvil + Android |
| Personalización con vista previa y contraste | ✅ | e2e |
| Estadísticas | ✅ | e2e (accesibilidad/render); cálculos vía funciones probadas |
| APK Android (compila, lint, pruebas JVM) | ✅ | GitHub Actions |
| App Android en emulador API 34: abre en el WebView con Capacitor nativo, carga datos, 8 pantallas sin scroll horizontal, PDF generado en el dispositivo sin filtraciones y entregado al Sharesheet nativo, estado y datos persisten tras `force-stop` y reapertura | ✅ | CI «Android · prueba en emulador» + capturas en `docs/media/android/` |
| Migración Supabase + RLS + motor de sync | 🟡 | Probado contra **PostgreSQL 16 real** (2 usuarios, anónimo, idempotencia, conflictos, 2 dispositivos). **No probado contra un proyecto Supabase real.** |
| Login Supabase (Auth) | ⏳ | Implementado con supabase-js; sin proyecto no se pudo probar |
| Compatibilidad Firefox / Safari / Edge | ⏳ | Sólo Chromium disponible en el entorno (Edge usa el mismo motor, pero no se probó) |
| Lector de pantalla (TalkBack/VoiceOver/NVDA) | ⏳ | Sin lector disponible |
| Teléfono Android físico | ⏳ | Sólo emulador |

## Bloqueos externos y cómo resolverlos

1. **Sincronización real con Supabase**: crear un proyecto Supabase Free, aplicar la migración y compilar con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` ([INSTALLATION.md](INSTALLATION.md#supabase-opcional)). Para que un agente lo verifique desde este entorno además hace falta permitir el host `<project-ref>.supabase.co` en la red del entorno.
2. **APK firmado de release**: crear un keystore y cargar los 4 secretos `ANDROID_*` en GitHub. Sin eso, CI entrega un APK *debug* instalable.
3. **Publicación web**: decidir si se habilita GitHub Pages (hace pública la app, no los datos).

## Próximos pasos propuestos

- Pruebas en Firefox y WebKit en CI (`npx playwright install firefox webkit`).
- Numeración de presupuestos a prueba de dos dispositivos offline (hoy cada dispositivo usa el contador sincronizado; dos dispositivos sin conexión podrían emitir el mismo número: se recomienda prefijos distintos por dispositivo).
- Sincronización en segundo plano en Android (hoy sólo con la app abierta).
- Bloqueo con PIN/biometría y cifrado opcional del respaldo.
- Stock/inventario sólo si se define un modelo coherente con compras y ventas.
- Importación de productos desde CSV.
