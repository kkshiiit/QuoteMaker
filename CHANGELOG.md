# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico.

## [1.1.0] — 2026-11-18 · Chediek Home

### Agregado
- **Nueva identidad: Chediek Home.** Nombre, ícono (casa con puerta en arco, 3 conceptos en `docs/brand`), splash de Android y presentación de bienvenida en el primer inicio.
- **Diseño «Spatial»:** tarjetas de vidrio translúcido con desenfoque, brillos de fondo del color elegido, profundidad y controles en cápsula; barra lateral y barra inferior flotantes. Respeta «menos transparencia» y «menos movimiento».
- **Temas y colores:** claro, oscuro y automático; 9 paletas clásicas y el grupo **(+) Pasteles** (Menta, Lavanda, Durazno, Celeste, Rosa, Limón) que tiñen el fondo; color propio. Cada opción muestra una vista previa en miniatura y hay una vista previa grande antes de aplicar. Contraste AA verificado por prueba para las 15 paletas en claro y oscuro.
- **Historial de ventas:** ventas presenciales en el local y online (WhatsApp, Instagram, Facebook, TikTok, Mercado Libre, tienda web), con o sin cliente, forma de pago, descuentos, impuesto y envío. Totales por canal, por plataforma y por cliente; ganancia interna con costos congelados; anular/restaurar. Desde un presupuesto aceptado se registra la venta con un toque. La ficha de cada cliente muestra sus compras.
- **Compartir productos** con fotos (hasta 6, optimizadas en el dispositivo), videos (guardados sólo en el dispositivo), descripción, precio y links directos a Instagram, Facebook y TikTok. Todo incluido por defecto; cada parte se puede quitar. Vista previa clara antes de compartir y texto editable.
- **Redes sociales del negocio** en Configuración (@usuario o link). Los presupuestos (PDF y WhatsApp) pueden incluir los links.
- Migración `20261118000002_sales.sql` para sincronizar ventas en Supabase.

### Seguridad y privacidad
- Nueva allowlist `PublicProduct` + pruebas anti-filtración: al compartir un producto nunca salen costo, margen, proveedor, SKU interno ni notas.
- Los links a redes se validan por dominio (no se aceptan URLs de otros sitios).
- CSP: se permite `media-src blob:` sólo para reproducir videos locales.

### Corregido
- Al pasar de una ficha guardada a «nueva» (venta o producto) el formulario podía conservar datos de la ficha anterior.

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
- El foco automático al cambiar de pantalla podía robar el foco del primer campo si se empezaba a escribir enseguida (se perdía texto). Ahora el título se enfoca al montarse la pantalla y nunca si ya hay un campo en uso.
- Búsquedas sensibles a acentos (ahora «martin» encuentra «Martín»).
- jsPDF actualizado a 4.2.1 por avisos de seguridad críticos en 3.x.
