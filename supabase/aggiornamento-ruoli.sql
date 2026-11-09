-- Campo e Stalla 1.26 — permessi delle persone (titolare, collaboratore con o senza allegati, sola lettura)
-- Da eseguire UNA volta: Supabase → SQL Editor → New query → incolla → Run. Si può rieseguire senza danni.
-- Effetto:
--   - il titolare sceglie dall'app (Impostazioni → Persone) i permessi di ogni persona;
--   - "Solo lettura" (ruolo lettore): legge campagna e stalla, non scrive niente, non vede conti né allegati;
--   - "Collaboratore senza allegati": registra come prima, ma non vede la fattura e le foto degli interventi;
--   - chi ha permessi ridotti non può togliersi da solo dall'azienda (rientrando con il codice tornerebbe collaboratore);
--   - il codice di invito lo vede solo il titolare (dopo averlo eseguito, crea un nuovo codice dall'app).

-- Per i database creati prima della 1.26.0: colonna degli allegati e ruolo "lettore" (solo lettura)
alter table public.farm_members add column if not exists allegati boolean not null default true;
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.farm_members'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%role%' loop
    execute format('alter table public.farm_members drop constraint %I', c);
  end loop;
end $$;
alter table public.farm_members add constraint farm_members_role_check check (role in ('titolare', 'membro', 'lettore'));

-- Può registrare: il titolare e i collaboratori, non chi è in sola lettura (dalla 1.26.0)
create or replace function public.can_write(f uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from farm_members where farm_id = f and user_id = auth.uid() and role in ('titolare', 'membro'));
$$;
revoke all on function public.can_write(uuid) from public, anon;
grant execute on function public.can_write(uuid) to authenticated;

-- Permessi di una persona (solo il titolare, dalla 1.26.0): 'membro' = collaboratore (con o senza allegati), 'lettore' = solo lettura
create or replace function public.set_member_role(f uuid, u uuid, ruolo text, con_allegati boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(f) then raise exception 'Solo il titolare può cambiare i permessi'; end if;
  if ruolo not in ('membro', 'lettore') then raise exception 'Permesso non valido'; end if;
  update farm_members set role = ruolo, allegati = (ruolo = 'membro' and coalesce(con_allegati, true))
    where farm_id = f and user_id = u and role <> 'titolare';
  if not found then raise exception 'Persona non trovata nell''azienda'; end if;
end $$;

revoke all on function public.create_farm(text), public.join_farm(text), public.new_join_code(uuid), public.set_member_role(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.create_farm(text), public.join_farm(text), public.new_join_code(uuid), public.set_member_role(uuid, uuid, text, boolean) to authenticated;

-- Versione dello schema (l'app la controlla per sapere se i conti sono protetti; 5 = permessi delle persone)
create or replace function public.ces_schema_version() returns int language sql immutable as $$ select 5 $$;
grant execute on function public.ces_schema_version() to authenticated;


drop policy if exists members_delete on public.farm_members;
create policy members_delete on public.farm_members for delete to authenticated
  using ((is_owner(farm_id) and role <> 'titolare') or (user_id = auth.uid() and (role = 'titolare' or (role = 'membro' and allegati))));
-- chi ha permessi ridotti non può togliersi da solo: rientrando con il codice tornerebbe collaboratore. Lo toglie il titolare.

drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated with check (can_write(farm_id) and (col not in ('fatture', 'bilanci', 'econfig', 'paghe', 'pagamenti') or is_owner(farm_id)));
drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated using (can_write(farm_id) and (col not in ('fatture', 'bilanci', 'econfig', 'paghe', 'pagamenti') or is_owner(farm_id))) with check (can_write(farm_id) and (col not in ('fatture', 'bilanci', 'econfig', 'paghe', 'pagamenti') or is_owner(farm_id)));

-- Allegati (dalla 1.26.0): il titolare sempre, i collaboratori se il titolare non li ha esclusi, chi è in sola lettura mai
create or replace function public.can_files_path(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from farm_members where farm_id::text = split_part(p, '/', 1) and user_id = auth.uid()
    and (role = 'titolare' or (role = 'membro' and allegati)));
$$;
revoke all on function public.can_files_path(text) from public, anon;
grant execute on function public.can_files_path(text) to authenticated;
drop policy if exists allegati_select on storage.objects;
create policy allegati_select on storage.objects for select to authenticated using (bucket_id = 'allegati' and public.can_files_path(name));
drop policy if exists allegati_insert on storage.objects;
create policy allegati_insert on storage.objects for insert to authenticated with check (bucket_id = 'allegati' and public.can_files_path(name));
drop policy if exists allegati_update on storage.objects;
create policy allegati_update on storage.objects for update to authenticated using (bucket_id = 'allegati' and public.can_files_path(name)) with check (bucket_id = 'allegati' and public.can_files_path(name));
drop policy if exists allegati_delete on storage.objects;
create policy allegati_delete on storage.objects for delete to authenticated using (bucket_id = 'allegati' and public.can_files_path(name));

-- Il codice di invito lo legge solo il titolare (dalla 1.26.0): gli altri vedono dell'azienda solo id e nome.
-- Senza questo, chi è in sola lettura potrebbe rientrare con un secondo account come collaboratore.
revoke select on public.farms from anon, authenticated;
grant select (id, name, created_by, created_at) on public.farms to authenticated;
revoke update on public.farms from anon, authenticated;
grant update (name) on public.farms to authenticated;   -- il titolare cambia solo il nome; il codice solo con new_join_code
create or replace function public.get_join_code(f uuid) returns text
language sql stable security definer set search_path = public as $$
  select join_code from farms where id = f and is_owner(f);
$$;
revoke all on function public.get_join_code(uuid) from public, anon;
grant execute on function public.get_join_code(uuid) to authenticated;
