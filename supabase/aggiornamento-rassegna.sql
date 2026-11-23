-- Campo e Stalla — rassegna del giorno e prezzi di mercato (1.71.0)
-- Da eseguire una volta nello SQL Editor di Supabase, DOPO aver messo il segreto RASSEGNA_SEGRETO
-- nella funzione (Edge Functions → Secrets). Al posto di METTI-QUI-IL-SEGRETO scrivi lo stesso valore.
-- Il giro parte ogni mattina alle 5:00 UTC (le 6 d'inverno, le 7 d'estate in Italia).
-- Le raccolte nuove (fonti, rassegna, mercati) non sono riservate: le vedono tutti i membri dell'azienda.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- il segreto resta nel Vault del database, non nel testo del comando pianificato
select vault.create_secret('METTI-QUI-IL-SEGRETO', 'rassegna_segreto', 'Segreto della funzione rassegna');

select cron.unschedule('rassegna-mattino') where exists (select 1 from cron.job where jobname = 'rassegna-mattino');
select cron.schedule('rassegna-mattino', '0 5 * * *', $$
  select net.http_post(
    url := 'https://vamcoyvunyjqgzxujsal.supabase.co/functions/v1/rassegna',
    headers := jsonb_build_object('content-type', 'application/json',
      'x-rassegna-segreto', (select decrypted_secret from vault.decrypted_secrets where name = 'rassegna_segreto')),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000)
$$);

-- Per controllare: select * from cron.job_run_details order by start_time desc limit 5;
