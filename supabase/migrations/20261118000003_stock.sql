-- QuoteMaker / Chediek Home · migración 0003: stock por variante (color / talle).
-- Agrega la colección 'stockMoves' (movimientos de stock inmutables) a la lista cerrada de
-- qm_records. Idempotente: se puede ejecutar más de una vez. No cambia políticas RLS.
alter table public.qm_records drop constraint if exists qm_records_collection_chk;
alter table public.qm_records add constraint qm_records_collection_chk check (collection in (
  'settings','categories','suppliers','products','costHistory','purchases',
  'expenses','overheads','customers','quotes','quoteDocuments','sales','stockMoves'));
