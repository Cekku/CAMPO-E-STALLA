-- Campo e Stalla — schema del database Supabase
-- Esegui tutto questo file una volta: Supabase → SQL Editor → New query → incolla → Run.
-- Crea: aziende, membri con codice di invito, registrazioni sincronizzate, regole di accesso (RLS) e tempo reale.

create extension if not exists pgcrypto;

-- Aziende ---------------------------------------------------------------
create table if not exists public.farms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  join_code  text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Membri dell'azienda -----------------------------------------------------
create table if not exists public.farm_members (
  farm_id   uuid not null references public.farms(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  email     text,
  role      text not null default 'membro' check (role in ('titolare', 'membro')),
  joined_at timestamptz not null default now(),
  primary key (farm_id, user_id)
);

-- Registrazioni (campi, operazioni, capi, eventi, latte, magazzino, ...) ----
create table if not exists public.records (
  farm_id    uuid not null references public.farms(id) on delete cascade,
  col        text not null,
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (farm_id, col, id)
);
create index if not exists records_sync_idx on public.records (farm_id, updated_at);

-- Funzioni di supporto ----------------------------------------------------
create or replace function public.is_member(f uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from farm_members where farm_id = f and user_id = auth.uid());
$$;

create or replace function public.is_owner(f uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from farm_members where farm_id = f and user_id = auth.uid() and role = 'titolare');
$$;

-- L'orario di modifica lo decide il server: è la base della sincronizzazione
create or replace function public.touch_record() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.touch_record();

-- Crea un'azienda e ne rende titolare chi la crea
create or replace function public.create_farm(farm_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare f uuid;
begin
  if auth.uid() is null then raise exception 'Accesso richiesto'; end if;
  insert into farms (name, created_by) values (coalesce(nullif(trim(farm_name), ''), 'La mia azienda'), auth.uid()) returning id into f;
  insert into farm_members (farm_id, user_id, email, role)
    values (f, auth.uid(), (select email from auth.users where id = auth.uid()), 'titolare');
  return f;
end $$;

-- Entra in un'azienda con il codice di invito
create or replace function public.join_farm(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare f uuid;
begin
  if auth.uid() is null then raise exception 'Accesso richiesto'; end if;
  select id into f from farms where join_code = upper(trim(code));
  if f is null then raise exception 'Codice azienda non valido'; end if;
  insert into farm_members (farm_id, user_id, email)
    values (f, auth.uid(), (select email from auth.users where id = auth.uid()))
    on conflict do nothing;
  return f;
end $$;

-- Genera un nuovo codice di invito (solo il titolare)
create or replace function public.new_join_code(f uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_owner(f) then raise exception 'Solo il titolare può cambiare il codice'; end if;
  c := upper(substr(md5(gen_random_uuid()::text), 1, 8));
  update farms set join_code = c where id = f;
  return c;
end $$;

revoke all on function public.create_farm(text), public.join_farm(text), public.new_join_code(uuid) from public, anon;
grant execute on function public.create_farm(text), public.join_farm(text), public.new_join_code(uuid) to authenticated;

-- Versione dello schema (l'app la controlla per sapere se i conti sono protetti)
create or replace function public.ces_schema_version() returns int language sql immutable as $$ select 4 $$;
grant execute on function public.ces_schema_version() to authenticated;

-- Regole di accesso -------------------------------------------------------
-- I dati economici (fatture, bilanci, configurazione dei conti) sono visibili solo al titolare.
alter table public.farms        enable row level security;
alter table public.farm_members enable row level security;
alter table public.records      enable row level security;

drop policy if exists farms_select on public.farms;
create policy farms_select on public.farms for select to authenticated using (is_member(id));
drop policy if exists farms_update on public.farms;
create policy farms_update on public.farms for update to authenticated using (is_owner(id)) with check (is_owner(id));

drop policy if exists members_select on public.farm_members;
create policy members_select on public.farm_members for select to authenticated using (is_member(farm_id));
drop policy if exists members_delete on public.farm_members;
create policy members_delete on public.farm_members for delete to authenticated
  using ((is_owner(farm_id) and role <> 'titolare') or user_id = auth.uid());

drop policy if exists records_select on public.records;
create policy records_select on public.records for select to authenticated using (is_member(farm_id) and (col not in ('fatture', 'bilanci', 'econfig', 'paghe', 'pagamenti') or is_owner(farm_id)));
drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated with check (is_member(farm_id) and (col not in ('fatture', 'bilanci', 'econfig', 'paghe', 'pagamenti') or is_owner(farm_id)));
drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated using (is_member(farm_id) and (col not in ('fatture', 'bilanci', 'econfig', 'paghe', 'pagamenti') or is_owner(farm_id))) with check (is_member(farm_id) and (col not in ('fatture', 'bilanci', 'econfig', 'paghe', 'pagamenti') or is_owner(farm_id)));

-- Aggiornamenti in tempo reale tra telefono e computer
do $$ begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null; end $$;

-- Archivio delle fatture e delle foto degli interventi (dalla 1.12): stesso contenuto di aggiornamento-allegati.sql
insert into storage.buckets (id, name, public, file_size_limit)
values ('allegati', 'allegati', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = 15728640;
create or replace function public.is_member_path(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from farm_members where farm_id::text = split_part(p, '/', 1) and user_id = auth.uid());
$$;
revoke all on function public.is_member_path(text) from public, anon;
grant execute on function public.is_member_path(text) to authenticated;
drop policy if exists allegati_select on storage.objects;
create policy allegati_select on storage.objects for select to authenticated using (bucket_id = 'allegati' and public.is_member_path(name));
drop policy if exists allegati_insert on storage.objects;
create policy allegati_insert on storage.objects for insert to authenticated with check (bucket_id = 'allegati' and public.is_member_path(name));
drop policy if exists allegati_update on storage.objects;
create policy allegati_update on storage.objects for update to authenticated using (bucket_id = 'allegati' and public.is_member_path(name)) with check (bucket_id = 'allegati' and public.is_member_path(name));
drop policy if exists allegati_delete on storage.objects;
create policy allegati_delete on storage.objects for delete to authenticated using (bucket_id = 'allegati' and public.is_member_path(name));
