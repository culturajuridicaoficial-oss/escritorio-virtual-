-- Veredito, o analista de ofertas: audita produto, oferta e copy e entrega um relatório
-- com notas, pontos fortes/negativos e ordens de mudança para o time executar.
insert into funcoes (id, nome, descricao, setor, ordem, time) values
  ('analista-ofertas', 'Analista de ofertas', 'Audita produto, oferta e copy e entrega ordens de mudança', 'analise', 14, 'copy')
on conflict (id) do nothing;

insert into agentes (id, projeto_id, funcao_id, nome, cor)
select p.slug || ':analista-ofertas', p.id, 'analista-ofertas', 'Veredito', '#f5f5f3'
  from projetos p
on conflict (id) do nothing;

create table analises (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id),
  funil_id uuid not null references funis(id),
  codigo text unique,                      -- DPL-WKS-01-AN-001
  autor text not null,
  -- o que foi analisado: { briefing, pagina_url, ofertas: [id], criativos: [id], links: [], texto }
  alvo jsonb not null,
  -- mesma "chave" = mesma peça/conjunto: a análise nova compara com a anterior
  chave text not null,
  instrucoes text not null default '',
  status text not null default 'analisando' check (status in ('analisando', 'pronta', 'erro')),
  relatorio jsonb,
  nota_geral numeric(3,1),
  anterior_id uuid references analises(id),
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on analises (projeto_id, created_at desc);
create index on analises (funil_id, chave, created_at desc);
alter table analises enable row level security; -- só o servidor lê e grava

create or replace function codificar_analise() returns trigger language plpgsql as $$
begin
  if new.codigo is null then new.codigo := proximo_codigo(new.funil_id, 'AN'); end if;
  return new;
end $$;
create trigger codificar_analise before insert on analises for each row execute function codificar_analise();
