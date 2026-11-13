-- Campo e Stalla 1.35 — originali dei documenti dei Conti (fatture, bilancini, dichiarazioni IVA, cedolini, estratti conto)
-- Da eseguire UNA volta: Supabase → SQL Editor → New query → incolla → Run. Si può rieseguire senza danni.
-- Gli originali stanno nello spazio file "allegati" in una cartella a parte, "<id azienda>/conti/…":
-- la vede SOLO il titolare (nemmeno i collaboratori con gli allegati). Finché non lo esegui gli originali restano
-- soltanto sul dispositivo dove li hai caricati e l'app non li manda online.

create or replace function public.can_files_path(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from farm_members where farm_id::text = split_part(p, '/', 1) and user_id = auth.uid()
    and (role = 'titolare' or (role = 'membro' and allegati and split_part(p, '/', 2) <> 'conti')));
$$;
revoke all on function public.can_files_path(text) from public, anon;
grant execute on function public.can_files_path(text) to authenticated;

-- Versione dello schema (6 = cartella dei Conti riservata al titolare)
create or replace function public.ces_schema_version() returns int language sql immutable as $$ select 6 $$;
grant execute on function public.ces_schema_version() to authenticated;
