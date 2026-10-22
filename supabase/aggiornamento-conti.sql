-- Campo e Stalla 1.5 — aggiornamento del database per il modulo Conti
-- Da eseguire UNA volta (anche se avevi già eseguito la versione precedente di questo file):
-- Supabase → SQL Editor → New query → incolla → Run.
-- Effetto: fatture, bilanci, cedolini, pagamenti dei dipendenti e impostazioni dei conti sono visibili e modificabili solo dal titolare dell'azienda.

create or replace function public.ces_schema_version() returns int language sql immutable as $$ select 3 $$;
grant execute on function public.ces_schema_version() to authenticated;

drop policy if exists records_select on public.records;
create policy records_select on public.records for select to authenticated using (is_member(farm_id) and (col not in ('fatture', 'bilanci', 'econfig', 'paghe', 'pagamenti') or is_owner(farm_id)));
drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated with check (is_member(farm_id) and (col not in ('fatture', 'bilanci', 'econfig', 'paghe', 'pagamenti') or is_owner(farm_id)));
drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated using (is_member(farm_id) and (col not in ('fatture', 'bilanci', 'econfig', 'paghe', 'pagamenti') or is_owner(farm_id))) with check (is_member(farm_id) and (col not in ('fatture', 'bilanci', 'econfig', 'paghe', 'pagamenti') or is_owner(farm_id)));
