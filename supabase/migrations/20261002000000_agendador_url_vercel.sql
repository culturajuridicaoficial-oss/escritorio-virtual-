-- O projeto na Vercel ficou em escritorio-virtual-murex.vercel.app: o agendador passa a
-- chamar esse endereço (cron.schedule com o mesmo nome substitui o job existente).
select cron.schedule(
  'rodada-comercial',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://escritorio-virtual-murex.vercel.app/api/cron/comercial',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'comercial_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 290000
  );
  $$
);
