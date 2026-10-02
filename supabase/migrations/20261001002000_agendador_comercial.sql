-- Rodada comercial a cada 15 min (follow-ups e primeiro contato). A Vercel no plano gratuito
-- só roda cron uma vez por dia, então o Supabase chama a rota.
-- Antes, guarde no Vault o mesmo valor de COMERCIAL_CRON_SECRET da Vercel:
--   select vault.create_secret('<segredo>', 'comercial_cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'rodada-comercial',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://grupo-nkz.vercel.app/api/cron/comercial',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'comercial_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 290000
  );
  $$
);
