# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico.

## [1.0.0] — 2026-11-17

Primera versión.

### Agregado
- Dominio financiero decimal (big.js): margen, markup, precio objetivo con cargos, punto de equilibrio, redondeos comerciales, escenarios.
- Productos, categorías, proveedores; imágenes optimizadas en el dispositivo.
- Compras con descuento/cargos de factura prorrateados; comprobante adjunto; anulación.
- Gastos asignables a compras o productos con 6 criterios de distribución, desglose previo y residuos exactos; sin doble conteo.
- Costo real por lote, historial de costos, gastos generales recurrentes y prorrateo por unidad.
- Calculadora de precios.
- Clientes privados con detección de duplicados.
- Presupuestos: ítems de catálogo o libres, descuentos, impuesto, envío, validez, condiciones, estados manuales, copia congelada al enviar, duplicado, historial de eventos.
- PDF comercial y mensaje de WhatsApp desde `PublicQuoteDocument` (allowlist) con pruebas anti-filtración.
- Estadísticas, personalización (temas, paletas, color propio con contraste AA), respaldo/importación versionados, datos de ejemplo ficticios.
- Sincronización opcional con Supabase Free: migración con RLS, push idempotente, versionado optimista, conflictos explícitos.
- PWA instalable y offline; app Android con Capacitor (Sharesheet nativo, íconos y splash propios).
- Identidad visual original (3 conceptos, variantes, íconos).
- CI en GitHub Actions: tipos, lint, unitarias, integración con PostgreSQL, e2e con axe, APK, lint Android, emulador.

### Corregido durante el desarrollo
- `100.000` se interpretaba como 100 (ahora es cien mil, convención es-AR).
- Desborde horizontal en móvil en grillas con títulos largos.
- Barras de acción fijas que tapaban formularios en escritorio.
- Etiquetas duplicadas («Teléfono») en Configuración.
- jsPDF actualizado a 4.2.1 por avisos de seguridad críticos en 3.x.
