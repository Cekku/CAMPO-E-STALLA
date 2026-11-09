-- Campo e Stalla 1.12 — archivio delle fatture e delle foto degli interventi sui mezzi (libretto dei trattori)
-- Da eseguire UNA volta: Supabase → SQL Editor → New query → incolla → Run.
-- Crea lo spazio file privato "allegati": ogni azienda ha la sua cartella (il nome è l'id dell'azienda)
-- e solo chi fa parte dell'azienda può leggere, caricare ed eliminare i suoi file. Limite 15 MB per file.
-- Dalla 1.26 chi è in sola lettura, o il collaboratore a cui il titolare li ha tolti, non vede gli allegati.

insert into storage.buckets (id, name, public, file_size_limit)
values ('allegati', 'allegati', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = 15728640;

-- La prima parte del percorso ("<id azienda>/<id file>") deve essere un'azienda di cui si fa parte
create or replace function public.is_member_path(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from farm_members where farm_id::text = split_part(p, '/', 1) and user_id = auth.uid());
$$;
revoke all on function public.is_member_path(text) from public, anon;
grant execute on function public.is_member_path(text) to authenticated;

alter table public.farm_members add column if not exists allegati boolean not null default true;
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

