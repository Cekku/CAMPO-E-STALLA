-- Campo e Stalla 1.74.0 — controllo della sicurezza ogni lunedì
-- Da eseguire UNA volta: Supabase → SQL Editor → New query → incolla → Run. Si può rieseguire senza danni.
-- PRIMA metti i segreti SICUREZZA_SEGRETO e SICUREZZA_FARM nella funzione (Edge Functions → Secrets), poi scrivi
-- lo stesso SICUREZZA_SEGRETO qui sotto al posto di METTI-QUI-IL-SEGRETO SOLO nello SQL Editor di Supabase:
-- non salvarlo in questo file (il repository è pubblico). Vedi strumenti/sicurezza/LEGGIMI.md.
-- Fa quattro cose:
--  0. mette il segreto nel Vault del database (se c'è già lo cambia; si ferma se è rimasto METTI-QUI-IL-SEGRETO);
--  1. rende la raccolta "sicurezza" riservata al titolare (come Conti e Personale);
--  2. crea ces_controllo_sicurezza(): la usa solo la funzione (chiave di servizio) per guardare le regole del database;
--  3. pianifica il controllo ogni lunedì alle 6:30 UTC (7:30 d'inverno, 8:30 d'estate in Italia).

-- 0. il segreto resta nel Vault del database, non nel testo del comando pianificato
do $$
declare s text := 'METTI-QUI-IL-SEGRETO';
begin
  if s = 'METTI-QUI-' || 'IL-SEGRETO' or length(s) < 20 then
    raise exception 'Scrivi il segreto (almeno 20 caratteri) al posto di METTI-QUI-IL-SEGRETO, poi Run di nuovo';
  end if;
  if exists (select 1 from vault.secrets where name = 'sicurezza_segreto') then
    perform vault.update_secret((select id from vault.secrets where name = 'sicurezza_segreto'), s);
  else
    perform vault.create_secret(s, 'sicurezza_segreto', 'Segreto della funzione sicurezza');
  end if;
end $$;

-- 1. raccolta riservata
drop policy if exists records_select on public.records;
create policy records_select on public.records for select to authenticated using (is_member(farm_id) and (col not in ('fatture', 'bilanci', 'econfig', 'paghe', 'pagamenti', 'sicurezza') or is_owner(farm_id)));
drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated with check (can_write(farm_id) and (col not in ('fatture', 'bilanci', 'econfig', 'paghe', 'pagamenti', 'sicurezza') or is_owner(farm_id)));
drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated using (can_write(farm_id) and (col not in ('fatture', 'bilanci', 'econfig', 'paghe', 'pagamenti', 'sicurezza') or is_owner(farm_id))) with check (can_write(farm_id) and (col not in ('fatture', 'bilanci', 'econfig', 'paghe', 'pagamenti', 'sicurezza') or is_owner(farm_id)));

-- Versione dello schema (7 = raccolta della sicurezza riservata al titolare)
create or replace function public.ces_schema_version() returns int language sql immutable as $$ select 7 $$;
grant execute on function public.ces_schema_version() to authenticated;

-- 2. controllo del database (solo lettura: nomi e regole, mai i dati)
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.ces_controllo_sicurezza() returns jsonb
language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    'postgres', current_setting('server_version'),
    'schema', public.ces_schema_version(),
    'senza_rls', (select coalesce(jsonb_agg(c.relname order by c.relname), '[]') from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
    'politiche', (select coalesce(jsonb_agg(jsonb_build_object('schema', schemaname, 'tabella', tablename, 'nome', policyname, 'ruoli', roles, 'comando', cmd, 'usa', qual, 'controlla', with_check)), '[]')
                  from pg_policies where schemaname in ('public', 'storage')),
    'definer_senza_path', (select coalesce(jsonb_agg(p.proname order by p.proname), '[]') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) x where x like 'search_path=%')),
    'definer_anon', (select coalesce(jsonb_agg(p.proname order by p.proname), '[]') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')),
    'viste', (select coalesce(jsonb_agg(c.relname order by c.relname), '[]') from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relkind = 'v' and not coalesce(c.reloptions @> array['security_invoker=true'], false)),
    'estensioni', (select coalesce(jsonb_object_agg(extname, extversion), '{}') from pg_extension),
    'estensioni_in_public', (select coalesce(jsonb_agg(e.extname), '[]') from pg_extension e join pg_namespace n on n.oid = e.extnamespace
                  where n.nspname = 'public' and e.extname <> 'plpgsql'),
    'secchi', (select coalesce(jsonb_agg(jsonb_build_object('nome', id, 'pubblico', public)), '[]') from storage.buckets),
    'pianificati', (select coalesce(jsonb_agg(jsonb_build_object('nome', jobname, 'quando', schedule, 'attivo', active)), '[]') from cron.job)
  )
$$;
revoke all on function public.ces_controllo_sicurezza() from public, anon, authenticated;
grant execute on function public.ces_controllo_sicurezza() to service_role;

-- 3. controllo del lunedì
select cron.unschedule('sicurezza-lunedi') where exists (select 1 from cron.job where jobname = 'sicurezza-lunedi');
select cron.schedule('sicurezza-lunedi', '30 6 * * 1', $$
  select net.http_post(
    url := 'https://vamcoyvunyjqgzxujsal.supabase.co/functions/v1/sicurezza',
    headers := jsonb_build_object('content-type', 'application/json',
      'x-sicurezza-segreto', (select decrypted_secret from vault.decrypted_secrets where name = 'sicurezza_segreto')),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000)
$$);

-- Per controllare: select * from cron.job_run_details order by start_time desc limit 5;
-- Per cambiare il segreto: rieseguire questo file con il valore nuovo (e cambiarlo anche nella funzione e sul PC).
