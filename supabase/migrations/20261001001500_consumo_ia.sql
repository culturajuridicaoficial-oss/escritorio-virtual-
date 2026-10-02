-- Consumo da API da Anthropic por escritório: cada resposta do modelo vira uma linha com
-- os tokens e o custo em dólares (tabela de preços no código, por modelo).
create table consumo_ia (
  id bigint generated always as identity primary key,
  projeto_id uuid references projetos(id),
  agente_id text,
  tarefa text,
  modelo text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_escrita_tokens int not null default 0,
  cache_leitura_tokens int not null default 0,
  leituras_web int not null default 0,
  custo_usd numeric(12,6) not null,
  created_at timestamptz not null default now()
);
create index on consumo_ia (projeto_id, created_at desc);
alter table consumo_ia enable row level security; -- só o servidor lê e grava

-- Somas por projeto no fuso de Brasília: hoje, 7 dias, mês corrente e total.
create view consumo_por_projeto with (security_invoker = true) as
select projeto_id,
       coalesce(sum(custo_usd) filter (where (created_at at time zone 'America/Sao_Paulo')::date = hoje_brasilia()), 0) as hoje,
       coalesce(sum(custo_usd) filter (where (created_at at time zone 'America/Sao_Paulo')::date > hoje_brasilia() - 7), 0) as sete_dias,
       coalesce(sum(custo_usd) filter (where date_trunc('month', created_at at time zone 'America/Sao_Paulo') = date_trunc('month', now() at time zone 'America/Sao_Paulo')), 0) as mes,
       sum(custo_usd) as total,
       count(*) as chamadas
  from consumo_ia
 group by projeto_id;

-- Mês corrente por agente (quem gasta mais em cada escritório).
create view consumo_por_agente_mes with (security_invoker = true) as
select projeto_id, agente_id, sum(custo_usd) as custo, count(*) as chamadas
  from consumo_ia
 where date_trunc('month', created_at at time zone 'America/Sao_Paulo') = date_trunc('month', now() at time zone 'America/Sao_Paulo')
 group by projeto_id, agente_id;
