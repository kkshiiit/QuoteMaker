# Rendimiento

Todas las cifras son **mediciones reales**, no estimaciones. Se pueden reproducir con los comandos indicados.

## Web (build de producción, `vite preview`, Chromium)

`npm run build && npm run preview` y luego `npm run perf` (`scripts/measure-perf.mjs`; mediana de 3 cargas en frío). Resultado guardado en [`perf-results.json`](perf-results.json).

| Escenario | FCP | DOMContentLoaded | Inicio visible | Transferido |
|---|---|---|---|---|
| Escritorio, sin limitación | 108 ms | 63 ms | 204 ms | 156 KB |
| Móvil (Pixel 7), CPU 4× más lenta + red 1,6 Mbps / 150 ms | 1.300 ms | 1.146 ms | 1.674 ms | 156 KB |

| Carga de datos | Resultado |
|---|---|
| Abrir la lista con 2.000 productos | 109 ms |
| Abrir la lista con 1.000 presupuestos (calcula totales de cada uno) | 123 ms |
| Inicio con 1.000 presupuestos | 37 ms |
| Heap JS usado con 2.000 productos + 1.000 presupuestos | 7,7 MB |

Las listas muestran 50 ítems y «Mostrar más» (paginación incremental); la búsqueda usa `useDeferredValue` para no bloquear la escritura.

## Bundle

| | Tamaño | gzip |
|---|---|---|
| Ruta crítica (HTML + entrada + React + Dexie/big.js + CSS) | — | **≈ 139 KB** |
| `dist/` completo | 1,68 MB | — |
| Precache del service worker (offline) | 1,24 MB (51 archivos) | — |

- Cada pantalla es un fragmento cargado bajo demanda (`React.lazy`), de 2 a 17 KB.
- **jsPDF** (386 KB) se carga sólo al generar un PDF. **Supabase JS** (226 KB) sólo si la nube está configurada.
- Las dependencias opcionales de jsPDF que no se usan (html2canvas, DOMPurify, canvg) se excluyen del precache.
- Imágenes de productos: se reducen a 480 px WebP en el dispositivo antes de guardarse.

## Cálculos (`tests/unit/perf.test.ts`, Node 22)

| Operación | Tiempo |
|---|---|
| Distribuir un gasto entre 1.000 destinos (mayor resto) | 29,5 ms |
| Presupuesto de 500 ítems (comercial + interno) | 43,0 ms |
| Costeo de 5.000 lotes (1.000 compras) con 2.000 gastos | 109,9 ms |

Las pruebas fallan si hay una regresión grave (límites de 1 a 5 s).

## Android

| Métrica | Valor | Fuente |
|---|---|---|
| APK debug | **4.795.186 bytes (4,6 MB)** | `docs/media/android/package-info.txt` (CI) |
| Arranque en frío (emulador API 34, x86_64, CI) | `TotalTime: 5733 ms` (`am start -W`) | Log del job «Android · prueba en emulador» |

El arranque en el emulador de CI (sin aceleración de GPU) es más lento que en un teléfono real; no se midió en un dispositivo físico.

## Sincronización

No medida contra un servidor Supabase real (no hay proyecto configurado). Contra PostgreSQL local, la suite de integración completa (8 pruebas, incluidos ciclos de push/pull) corre en < 1 s.

## No medido

- Firefox y Safari.
- Consumo de batería en Android.
- Rendimiento en teléfonos físicos de gama baja.
