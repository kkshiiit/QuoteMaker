-- QuoteMaker / Chediek Home · migración 0002: historial de ventas.
-- Agrega la colección 'sales' a la lista cerrada de qm_records. Idempotente: se puede
-- ejecutar más de una vez. No cambia políticas RLS (siguen aplicando por user_id).
alter table public.qm_records drop constraint if exists qm_records_collection_chk;
alter table public.qm_records add constraint qm_records_collection_chk check (collection in (
  'settings','categories','suppliers','products','costHistory','purchases',
  'expenses','overheads','customers','quotes','quoteDocuments','sales'));
