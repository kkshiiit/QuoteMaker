# Seguridad y privacidad

## Principios

1. **Los costos internos nunca llegan a un documento de cliente.** No se ocultan en la plantilla: no llegan al generador.
2. **Local primero.** Sin configuración cloud, ningún dato sale del dispositivo. No hay analíticas, rastreo, CDN ni fuentes externas.
3. **Nada automático hacia afuera.** QuoteMaker no envía mensajes, no cambia estados solo y no crea links públicos.
4. **Mínimo privilegio en la nube.** Sólo clave pública `anon` + sesión del usuario + RLS forzada.

## Modelo de amenazas

| Amenaza | Control | Evidencia |
|---|---|---|
| Filtrar costos/márgenes/proveedores en el PDF | `PublicQuoteDocument` con allowlist + `assertPublicDocument`; generadores tipados para aceptar sólo ese modelo; ESLint impide que `src/privacy` importe datos o UI | `tests/unit/privacy.leak.test.ts` extrae texto, metadatos y **streams descomprimidos** del PDF con datos «trampa»; `tests/e2e/main-flow.spec.ts` analiza el PDF descargado desde la UI |
| Filtrar en WhatsApp o en la URL `wa.me` | Mensaje construido desde el documento público | Pruebas unitarias y e2e sobre el texto y la URL decodificada |
| Nombre de archivo revelador | `Presupuesto-<número>.pdf`, caracteres saneados (sin path traversal) | Prueba unitaria |
| Metadatos del PDF | Sólo título (número), asunto genérico, autor (nombre comercial) y creador «QuoteMaker» | Prueba unitaria sobre `getMetadata()` |
| Notas privadas del cliente en documentos | Snapshot comercial del cliente sin `notes` | Prueba unitaria y e2e |
| Mostrar datos internos al girar la pantalla hacia el cliente | «Modo cliente» oculta todos los bloques internos | `tests/e2e/quality.spec.ts` |
| Acceso a datos de otro usuario (IDOR) | RLS `user_id = auth.uid()` forzada; PK incluye `user_id`; `qm_push` es `SECURITY INVOKER` | `tests/integration/sync.pg.test.ts`: dos usuarios, lectura/escritura/inserción cruzada rechazadas |
| Acceso anónimo | Sin `GRANT` para `anon`; `qm_push` exige `auth.uid()` | Pruebas de integración |
| Borrado destructivo remoto | Sin política DELETE; sólo lápidas | Prueba de integración |
| Payloads inválidos o enormes | CHECK de colección, `payload.id = record_id`, ≤ 2 MB | Prueba de integración |
| Repetición de mutaciones | `qm_mutations` (idempotencia) | Prueba de integración |
| Sobrescribir cambios ajenos | Versionado optimista + conflictos explícitos | Prueba de integración (dos dispositivos) |
| Secretos en el repo | `.env*` ignorados; `.env.example` sin valores; firma Android sólo por variables de entorno / secretos de GitHub; jamás `service_role` | Revisión |
| Mezclar cuentas en un dispositivo | El dispositivo queda vinculado a la primera cuenta; otra cuenta se rechaza con mensaje | `src/sync/controller.tsx` |
| XSS | React escapa todo; no se usa `dangerouslySetInnerHTML`; imágenes como data URL generadas localmente | Revisión |
| Dependencias vulnerables | `npm audit` = 0 vulnerabilidades (jsPDF actualizado a 4.2.1 por avisos críticos de 3.x) | `npm audit` |

## Compartir productos y redes sociales

- Lo que se comparte de un producto sale de `buildPublicProduct` (`src/privacy/publicProduct.ts`), una **allowlist**: nombre, descripción, unidad, precio de venta (opcional), nombre del negocio y links a redes (opcional). `assertPublicProduct` rechaza cualquier clave extra. Pruebas en `tests/unit/sales-share.test.ts` y e2e verifican que costo, margen, proveedor, SKU y notas no aparecen.
- Los links a Instagram, Facebook y TikTok se normalizan y **sólo** se aceptan dominios de cada red (`src/privacy/social.ts`).
- Las fotos se re-codifican en el dispositivo (WebP, máx. 1280 px), lo que descarta metadatos EXIF (ubicación, cámara). Los videos se comparten tal cual: si tienen metadatos de ubicación, los conserva el archivo original.
- Videos: tabla local `productVideos`, no se sincronizan ni se incluyen en el respaldo.
- Chediek Home nunca publica por su cuenta: abre el menú del sistema y la persona elige la app y confirma.

## Datos sensibles en el dispositivo

- IndexedDB no está cifrado por la app (depende del cifrado del dispositivo/navegador). En Android, los datos viven en el almacenamiento privado de la app.
- El respaldo JSON contiene información interna: la pantalla de Respaldo lo advierte.
- Los PDF compartidos en Android se escriben en la **caché privada** de la app antes de abrir el Sharesheet.

## Registro (logs)

La app no envía logs. No se imprimen datos de negocio en consola.

## Pendiente / límites

- RLS y sincronización probadas sobre PostgreSQL 16 (stub de `auth.uid()`) **y en vivo contra el proyecto Supabase real** desde la CI (`npm run test:live`: rol anónimo bloqueado, dos dispositivos, conflicto, borrado, aislamiento entre cuentas, idempotencia y, con la migración 0002 aplicada, ventas).
- Sin cifrado adicional de IndexedDB ni bloqueo con PIN (ver [ROADMAP](ROADMAP.md)).

## Reportar vulnerabilidades

Abrí un issue privado de seguridad («Security advisory») en GitHub. No publiques detalles explotables en issues abiertos.
