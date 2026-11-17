-- QuoteMaker · sincronización cloud (Supabase Free)
-- Migración versionada 0001. Idempotente donde es posible.
--
-- Modelo: almacenamiento de documentos por usuario. Cada registro local (producto, compra,
-- gasto, presupuesto…) se guarda como JSONB en qm_records, aislado por user_id con RLS.
-- Versionado optimista por registro + cola de mutaciones idempotentes (qm_mutations).
-- Ver docs/DATABASE.md para la justificación del diseño.

create sequence if not exists public.qm_records_seq;

create table if not exists public.qm_records (
  user_id          uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  collection       text        not null,
  record_id        text        not null,
  payload          jsonb,
  version          bigint      not null default 1,
  deleted          boolean     not null default false,
  seq              bigint      not null default nextval('public.qm_records_seq'),
  last_mutation_id uuid,
  updated_at       timestamptz not null default now(),
  primary key (user_id, collection, record_id),
  constraint qm_records_collection_chk check (collection in (
    'settings','categories','suppliers','products','costHistory','purchases',
    'expenses','overheads','customers','quotes','quoteDocuments')),
  constraint qm_records_id_chk check (char_length(record_id) between 1 and 64),
  constraint qm_records_payload_chk check (
    (deleted and payload is null) or
    (not deleted and jsonb_typeof(payload) = 'object' and payload ->> 'id' = record_id)),
  constraint qm_records_size_chk check (payload is null or pg_column_size(payload) <= 2000000)
);

create index if not exists qm_records_user_seq_idx on public.qm_records (user_id, seq);

create table if not exists public.qm_mutations (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  mutation_id uuid        not null,
  version     bigint      not null,
  applied_at  timestamptz not null default now(),
  primary key (user_id, mutation_id)
);

alter table public.qm_records enable row level security;
alter table public.qm_records force row level security;
alter table public.qm_mutations enable row level security;
alter table public.qm_mutations force row level security;

drop policy if exists qm_records_select on public.qm_records;
drop policy if exists qm_records_insert on public.qm_records;
drop policy if exists qm_records_update on public.qm_records;
drop policy if exists qm_mutations_select on public.qm_mutations;
drop policy if exists qm_mutations_insert on public.qm_mutations;

create policy qm_records_select on public.qm_records for select to authenticated
  using (user_id = auth.uid());
create policy qm_records_insert on public.qm_records for insert to authenticated
  with check (user_id = auth.uid());
create policy qm_records_update on public.qm_records for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Sin política DELETE: los borrados son lápidas (deleted = true) para que otros dispositivos se enteren.

create policy qm_mutations_select on public.qm_mutations for select to authenticated
  using (user_id = auth.uid());
create policy qm_mutations_insert on public.qm_mutations for insert to authenticated
  with check (user_id = auth.uid());

revoke all on public.qm_records, public.qm_mutations from anon, public;
grant select, insert, update on public.qm_records to authenticated;
grant select, insert on public.qm_mutations to authenticated;
grant usage, select on sequence public.qm_records_seq to authenticated;

-- Push idempotente con control de versión optimista.
-- Devuelve {status: applied|duplicate|conflict, version, payload?, deleted?}.
create or replace function public.qm_push(
  p_mutation_id  uuid,
  p_collection   text,
  p_record_id    text,
  p_op           text,
  p_payload      jsonb,
  p_base_version bigint
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  cur public.qm_records%rowtype;
  prev_version bigint;
  new_version bigint;
begin
  if uid is null then
    raise exception 'QuoteMaker: autenticación requerida' using errcode = '28000';
  end if;
  if p_op not in ('upsert', 'delete') then
    raise exception 'QuoteMaker: operación inválida %', p_op using errcode = '22023';
  end if;
  if p_op = 'upsert' and (p_payload is null or p_payload ->> 'id' is distinct from p_record_id) then
    raise exception 'QuoteMaker: payload inconsistente' using errcode = '22023';
  end if;

  -- Serializa las escrituras de un mismo usuario: el orden de seq coincide con el de commit,
  -- así el cursor de pull nunca saltea filas.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  select m.version into prev_version from public.qm_mutations m
   where m.user_id = uid and m.mutation_id = p_mutation_id;
  if found then
    return jsonb_build_object('status', 'duplicate', 'version', prev_version);
  end if;

  select * into cur from public.qm_records r
   where r.user_id = uid and r.collection = p_collection and r.record_id = p_record_id
   for update;

  if found then
    if cur.version <> p_base_version then
      return jsonb_build_object('status', 'conflict', 'version', cur.version, 'payload', cur.payload, 'deleted', cur.deleted);
    end if;
    new_version := cur.version + 1;
    update public.qm_records
       set payload = case when p_op = 'delete' then null else p_payload end,
           deleted = (p_op = 'delete'),
           version = new_version,
           seq = nextval('public.qm_records_seq'),
           last_mutation_id = p_mutation_id,
           updated_at = now()
     where user_id = uid and collection = p_collection and record_id = p_record_id;
  else
    if p_base_version <> 0 then
      return jsonb_build_object('status', 'conflict', 'version', 0, 'payload', null, 'deleted', true);
    end if;
    new_version := 1;
    insert into public.qm_records (user_id, collection, record_id, payload, deleted, version, last_mutation_id)
    values (uid, p_collection, p_record_id,
            case when p_op = 'delete' then null else p_payload end,
            p_op = 'delete', new_version, p_mutation_id);
  end if;

  insert into public.qm_mutations (user_id, mutation_id, version) values (uid, p_mutation_id, new_version);
  return jsonb_build_object('status', 'applied', 'version', new_version);
end;
$$;

revoke all on function public.qm_push(uuid, text, text, text, jsonb, bigint) from public, anon;
grant execute on function public.qm_push(uuid, text, text, text, jsonb, bigint) to authenticated;
