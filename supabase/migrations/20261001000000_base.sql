-- Cultura Jurídica — Fase 1: base de dados da operação de IA
-- Tudo que os agentes fazem passa por estas tabelas. O escritório virtual
-- lê apenas `agentes` e `agente_eventos` (via Realtime).

-- Projetos (infoprodutos) --------------------------------------------------
create table projetos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  -- IDs dos produtos na Kiwify que pertencem a este projeto
  kiwify_produto_ids text[] not null default '{}',
  -- Conta de anúncios do Meta, sem o prefixo "act_"
  meta_ad_account_id text,
  -- Trava de segurança: a IA nunca pode passar disso por dia (em reais)
  limite_gasto_diario numeric(12,2) not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Squads: cada projeto tem o seu time completo de agentes ------------------
-- Catálogo das funções (os pontos 01–12). Um squad = uma linha de agente por função.
create table funcoes (
  id text primary key,                 -- ex.: 'copy-pagina'
  nome text not null,                  -- ex.: 'Copywriter de página'
  descricao text not null,
  setor text not null check (setor in ('ofertas','copy','criacao','trafego','analise','comercial')),
  ordem int not null
);

create table agentes (
  id text primary key,                 -- '<slug do projeto>:<função>', ex.: 'cultura-juridica:copy-pagina'
  projeto_id uuid not null references projetos(id) on delete cascade,
  funcao_id text not null references funcoes(id),
  nome text not null,                  -- nome do avatar no escritório
  cor text not null,                   -- cor da roupa do avatar
  ativo boolean not null default true,
  status text not null default 'ocioso' check (status in ('ocioso','trabalhando','reuniao','comemorando')),
  ultima_fala text,
  tarefas_hoje int not null default 0,
  updated_at timestamptz not null default now(),
  unique (projeto_id, funcao_id)
);

-- Tudo que acontece vira um evento. O escritório anima a partir daqui.
create table agente_eventos (
  id bigint generated always as identity primary key,
  agente_id text references agentes(id),
  projeto_id uuid references projetos(id),
  tipo text not null,                  -- 'venda', 'relatorio', 'sync_meta', 'mensagem_lead', ...
  mensagem text not null,              -- texto curto mostrado no balão (sem dado sensível)
  valor numeric(12,2),
  created_at timestamptz not null default now()
);
create index on agente_eventos (created_at desc);

-- Vendas e carrinhos (Kiwify) -------------------------------------------------
create table vendas (
  id uuid primary key default gen_random_uuid(),
  kiwify_order_id text not null unique,
  projeto_id uuid references projetos(id),
  produto_id text,
  produto_nome text,
  status text not null,                -- paid, refunded, chargedback, waiting_payment, abandoned...
  evento text,                         -- webhook_event_type da Kiwify
  valor numeric(12,2),
  cliente_nome text,
  cliente_email text,
  cliente_telefone text,
  utm jsonb,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on vendas (projeto_id, created_at desc);

-- Leads e conversas de WhatsApp (Z-API) --------------------------------------
create table leads (
  id uuid primary key default gen_random_uuid(),
  telefone text not null unique,
  nome text,
  email text,
  projeto_id uuid references projetos(id),
  origem text,                         -- popup, abandono, comprador, organico
  etapa text not null default 'novo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table mensagens_whatsapp (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  zapi_message_id text unique,
  direcao text not null check (direcao in ('entrada','saida')),
  texto text,
  agente_id text references agentes(id),
  payload jsonb,
  created_at timestamptz not null default now()
);
create index on mensagens_whatsapp (lead_id, created_at);

-- Produção criativa (Fases 2 e 3) --------------------------------------------
-- Status com aprovação humana opcional: a trava sai quando o sistema provar que acerta.
create table ofertas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id),
  titulo text not null,
  promessa text,
  preco numeric(12,2),
  bonus jsonb,
  garantia text,
  racional text,                       -- por que a IA acha que essa oferta vai vender
  status text not null default 'rascunho'
    check (status in ('rascunho','aguardando_aprovacao','aprovada','publicada','arquivada')),
  criado_por text references agentes(id),
  relatorio_origem_id uuid,
  created_at timestamptz not null default now()
);

create table criativos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id),
  oferta_id uuid references ofertas(id),
  tipo text not null check (tipo in ('pagina','estatico','video')),
  copy jsonb not null,                 -- headline, texto, roteiro, CTA...
  arquivo_url text,                    -- imagem, vídeo ou URL da página publicada
  meta_ad_id text,
  status text not null default 'rascunho'
    check (status in ('rascunho','aguardando_aprovacao','aprovado','publicado','pausado','reprovado')),
  criado_por text references agentes(id),
  created_at timestamptz not null default now()
);

-- Métricas do Meta Ads, uma linha por anúncio por dia
create table metricas_anuncios (
  ad_id text not null,
  data date not null,
  projeto_id uuid references projetos(id),
  ad_name text,
  adset_id text,
  campaign_id text,
  campaign_name text,
  gasto numeric(12,2) not null default 0,
  impressoes bigint not null default 0,
  cliques bigint not null default 0,
  ctr numeric(8,4),
  cpc numeric(12,4),
  cpm numeric(12,4),
  compras int not null default 0,
  receita numeric(12,2) not null default 0,
  payload jsonb,
  updated_at timestamptz not null default now(),
  primary key (ad_id, data)
);
create index on metricas_anuncios (projeto_id, data desc);

-- Relatórios do agente analista (entrada do time de copy)
create table relatorios (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid references projetos(id),
  periodo_inicio date not null,
  periodo_fim date not null,
  conteudo jsonb not null,
  resumo text not null,
  created_at timestamptz not null default now()
);

-- Segurança ------------------------------------------------------------------
-- Todas as tabelas fechadas por padrão. O servidor usa a service role.
-- O escritório (público, na TV) só lê agentes e eventos.
alter table projetos enable row level security;
alter table funcoes enable row level security;
alter table agentes enable row level security;
alter table agente_eventos enable row level security;
alter table vendas enable row level security;
alter table leads enable row level security;
alter table mensagens_whatsapp enable row level security;
alter table ofertas enable row level security;
alter table criativos enable row level security;
alter table metricas_anuncios enable row level security;
alter table relatorios enable row level security;

create policy "escritorio le funcoes" on funcoes for select to anon, authenticated using (true);
create policy "escritorio le projetos" on projetos for select to anon, authenticated using (ativo);
-- O escritório só enxerga nome e slug; contas de anúncio e produtos ficam ocultos.
revoke select on projetos from anon, authenticated;
grant select (id, slug, nome, ativo) on projetos to anon, authenticated;
create policy "escritorio le agentes" on agentes for select to anon, authenticated using (true);
create policy "escritorio le eventos" on agente_eventos for select to anon, authenticated using (true);

alter publication supabase_realtime add table agentes, agente_eventos;

-- Ao registrar um evento, atualiza o "estado" do agente para o escritório.
create function aplicar_evento_no_agente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.agente_id is not null then
    update agentes
       set ultima_fala = new.mensagem,
           status = case new.tipo
                      when 'venda' then 'comemorando'
                      when 'relatorio' then 'reuniao'
                      else 'trabalhando'
                    end,
           tarefas_hoje = case when updated_at::date = now()::date then tarefas_hoje + 1 else 1 end,
           updated_at = now()
     where id = new.agente_id;
  end if;
  return new;
end $$;

create trigger agente_eventos_aplicar
after insert on agente_eventos
for each row execute function aplicar_evento_no_agente();
