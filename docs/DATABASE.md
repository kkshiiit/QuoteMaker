# Base de datos y sincronización

## Local (IndexedDB, Dexie) — `src/data/db.ts`

| Tabla | Clave / índices | Contenido | ¿Se sincroniza? |
|---|---|---|---|
| `settings` | `id` (= `business`) | Identidad comercial, moneda, impuestos, numeración, márgenes y redondeos por defecto | Sí |
| `categories` | `id`, name, archived | Categorías de productos | Sí |
| `suppliers` | `id`, name, archived | Proveedores (notas privadas) | Sí |
| `products` | `id`, name, sku, categoryId, supplierId, active, archived | Producto, costo actual calculado, precio manual, margen objetivo, notas internas | Sí |
| `costHistory` | `id`, productId, at | Historial inmutable de costos (origen y referencia) | Sí |
| `purchases` | `id`, date, supplierId, voided | Compra con renglones (`items`), descuento y cargos de factura, comprobante | Sí |
| `expenses` | `id`, date, status, purchaseId | Gasto, destino, método, valores manuales y **asignaciones calculadas** por lote | Sí |
| `overheads` | `id`, active, category | Gastos generales únicos/recurrentes | Sí |
| `customers` | `id`, name, archived | Clientes privados (notas privadas) | Sí |
| `quotes` | `id`, number, status, customerId, issueDate | Presupuesto editable + copia congelada + eventos | Sí |
| `quoteDocuments` | `id`, quoteId | Registro de cada PDF/mensaje generado (nombre, canal, SHA-256) | Sí |
| `prefs` | `id` | Tema y preferencias de este dispositivo | No |
| `outbox` | `mutationId`, `[collection+recordId]` | Cola durable de mutaciones pendientes | No |
| `syncState` | `key`, status | Estado de sync por registro, versión del servidor, copia remota en conflicto | No |
| `meta` | `key` | Cursor de pull, cuenta vinculada, último respaldo | No |

Entidades del prompt evaluadas y cómo quedaron:

- `profiles`, `workspaces`: un usuario = un espacio. El aislamiento lo da `user_id` + RLS; no hace falta una tabla extra.
- `purchase_batches` / `purchase_batch_items` → `purchases` con `items`.
- `expense_allocations` → `expenses.allocations` (por lote, con trazabilidad compra/ítem/producto).
- `quote_items` / `quote_internal_calculations` → `quotes.items` (con costo congelado) + cálculo derivado (`computeInternal`), nunca persistido en documentos.
- `quote_events` → `quotes.events`. `quote_sequences` → `settings.nextQuoteNumber`. `quote_documents` → `quoteDocuments`.
- `app_settings` → `prefs`. `sync_metadata` → `outbox`, `syncState`, `meta`.

## Cloud (Supabase Free) — `supabase/migrations/20261117000001_quotemaker_sync.sql`

Modelo **documental por usuario**: cada registro local se guarda como JSONB en `qm_records`. Así el esquema local y el remoto no pueden divergir, y RLS protege una sola tabla.

```sql
qm_records(user_id uuid → auth.users, collection text, record_id text,
           payload jsonb, version bigint, deleted bool, seq bigint, last_mutation_id uuid, updated_at)
  PK (user_id, collection, record_id) · índice (user_id, seq)
qm_mutations(user_id, mutation_id, version, applied_at)  -- idempotencia
qm_push(mutation_id, collection, record_id, op, payload, base_version) → jsonb
```

- **RLS forzada** en ambas tablas: `user_id = auth.uid()` para SELECT/INSERT/UPDATE. Sin política DELETE (los borrados son lápidas `deleted = true`). Sin permisos para `anon`.
- **Validación del servidor**: colección en lista cerrada, `payload.id = record_id`, tamaño ≤ 2 MB, operación válida, autenticación obligatoria.
- **Idempotencia**: un `mutation_id` repetido devuelve `duplicate` sin reaplicar.
- **Concurrencia optimista**: si `base_version` ≠ versión actual → `conflict` con la copia del servidor.
- **Orden de pull**: `pg_advisory_xact_lock` por usuario → el `seq` crece en el mismo orden en que se confirman las transacciones, así el cursor nunca saltea filas.
- `qm_push` es `SECURITY INVOKER`: corre con los permisos y la RLS del usuario.

### Documentos (Storage)

No se suben PDF a Storage: cada PDF se regenera de forma determinista desde la copia congelada del presupuesto, y se sincroniza su **registro** (`quoteDocuments` con SHA-256). Eso evita guardar archivos duplicados y cuotas de Storage. Las copias exportadas (descargas, Drive vía Sharesheet) son independientes: borrarlas no afecta el registro, y viceversa.

## Migraciones

- Versionadas en `supabase/migrations/` (prefijo de fecha). Idempotentes (`if not exists`, `drop policy if exists`, `create or replace`).
- Probadas en CI y localmente sobre **PostgreSQL 16 real**, aplicándolas dos veces (`tests/integration/sync.pg.test.ts`). `tests/integration/supabase-local-stub.sql` reproduce sólo lo que Supabase ya trae (`auth.uid()` idéntica, roles `anon`/`authenticated`).

Aplicar en un proyecto Supabase: SQL Editor → pegar el archivo → Run (o `supabase db push` con la CLI). Ver [INSTALLATION.md](INSTALLATION.md#supabase-opcional).

## Resolución de conflictos (regla documentada)

| Situación | Resultado |
|---|---|
| Cambio local sin conflicto | Se sube; versión +1 |
| El servidor cambió y aquí no hay cambios pendientes | Se aplica la versión del servidor |
| Ambos cambiaron | Estado **conflicto**: se guardan ambas versiones; la persona elige «Mantener la mía» (se re-sube sobre la versión del servidor) o «Usar la de la nube». Nunca se descarta nada automáticamente. |
| Error de red | Estado **error**, la cola queda intacta, reintento con backoff (2 s → 5 min) |

## Backups

`quotemaker-respaldo-AAAA-MM-DD.json`: `{ format: "quotemaker-backup", version: 1, exportedAt, app, data: {colección: [...]} }`. Importación con validación (formato, versión, colecciones, ids) en modo **combinar** o **reemplazar**. El respaldo contiene datos internos: es privado.
