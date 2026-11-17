# Capturas y GIFs

Todas son **capturas reales** de la app en ejecución (build de producción) con los **datos de ejemplo ficticios** («Taller Aurora»). No contienen datos reales.

- Web: generadas con `npm run media` (`scripts/capture-media.mjs`, Chromium + Playwright). Escritorio 1440×900; móvil Pixel 7 (412×915 @2x).
- GIFs: video real de Playwright convertido con ffmpeg (8 fps, 760 px).
- Android: `docs/media/android/` las genera la prueba en emulador de CI (API 34) con `adb screencap`.
- `screenshots/15-pdf-generado-1.png`: página 1 del PDF real (`presupuesto-ejemplo.pdf`) rasterizada con `pdftoppm`.

| Archivo | Muestra |
|---|---|
| 01-inicio | Panel de inicio con pendientes, rentabilidad y actividad |
| 02-productos | Catálogo con búsqueda, filtros y costo interno |
| 03-detalle-producto | Costo real (compra + gastos), rentabilidad e historial |
| 04-registro-compra | Compra con costo real por unidad en vivo |
| 05-costos-gastos | Gastos con estado (en costos / sin asignar) |
| 06-distribucion-gastos | Desglose previo de un gasto distribuido por peso |
| 07-calculadora-precios | Precio recomendado, comparación y escenarios |
| 08-clientes | Clientes privados |
| 09-presupuestos / 10-presupuesto | Lista y editor con rentabilidad interna |
| 11-vista-previa-documento | Exactamente lo que ve el cliente + PDF y WhatsApp |
| 12-estadisticas | Estadísticas del período |
| 13-personalizacion-vista-previa / 14-inicio-oscuro-terracota | Editor de tema y resultado |

GIFs: `01-navegacion`, `02-crear-producto`, `03-cargar-gasto`, `04-calcular-precio`, `05-crear-presupuesto`, `06-personalizar-tema`.

Android (`android/`): inicio, productos, compras, gastos, calculadora, presupuestos, clientes, estadísticas, menú Más, editor y documento de presupuesto, selector nativo para compartir el PDF, tema oscuro y presupuestos tras reiniciar la app. `android-presupuesto.pdf` es el PDF generado en el dispositivo.
