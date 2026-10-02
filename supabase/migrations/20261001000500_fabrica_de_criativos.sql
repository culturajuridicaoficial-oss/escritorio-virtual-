-- Fase 2: fábrica de criativos com aprovação humana no /painel.

-- Quem pode entrar no painel e aprovar (e-mail do login do Supabase Auth).
create table equipe (
  email text primary key,
  nome text,
  created_at timestamptz not null default now()
);
alter table equipe enable row level security; -- só o servidor lê

-- Briefing do produto: a base de tudo que os agentes escrevem.
alter table projetos
  add column pagina_vendas_url text,
  add column briefing jsonb,
  add column briefing_atualizado_em timestamptz;

-- Ofertas: revisão humana
alter table ofertas drop constraint ofertas_status_check;
alter table ofertas add constraint ofertas_status_check
  check (status in ('rascunho', 'aguardando_aprovacao', 'aprovada', 'reprovada', 'publicada', 'arquivada'));
alter table ofertas
  add column motivo_reprovacao text,
  add column revisado_por text,
  add column revisado_em timestamptz;

-- Criativos: design em HTML feito pelo Claude, produção assíncrona e revisão humana
alter table criativos drop constraint criativos_status_check;
alter table criativos add constraint criativos_status_check
  check (status in ('em_producao', 'erro', 'rascunho', 'aguardando_aprovacao', 'aprovado', 'publicado', 'pausado', 'reprovado'));
alter table criativos
  add column html text,
  add column formato text,
  add column erro text,
  add column motivo_reprovacao text,
  add column revisado_por text,
  add column revisado_em timestamptz,
  add column updated_at timestamptz not null default now();

create index on criativos (oferta_id, tipo);
create index on criativos (status) where status = 'em_producao';
