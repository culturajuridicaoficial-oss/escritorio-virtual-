-- Rodada diária em lote (Batch API da Anthropic, metade do preço). Cada lote enviado fica
-- aqui até a coleta; as peças em produção num lote ficam marcadas com o id dele.
create table lotes_ia (
  id text primary key,                 -- id do lote na Anthropic (msgbatch_...)
  tipo text not null check (tipo in ('rodada', 'producao')),
  itens jsonb not null default '{}',   -- custom_id -> o que é cada pedido (funil, criativo, tarefa)
  status text not null default 'enviado' check (status in ('enviado', 'coletando', 'concluido', 'erro')),
  erro text,
  created_at timestamptz not null default now(),
  concluido_em timestamptz
);
create index lotes_ia_abertos on lotes_ia (status) where status = 'enviado';

-- Só o servidor (service role) lê e escreve.
alter table lotes_ia enable row level security;

alter table criativos add column lote_id text;
