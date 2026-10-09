-- Base de conhecimento: uma aba por produto (clube) com tudo que a IA precisa saber.
-- Os agentes (fábrica, analistas e atendimento no WhatsApp) recebem o conteúdo das abas
-- marcadas como "usar na IA" junto com o briefing.
create table conhecimento (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id) on delete cascade,
  slug text not null,
  nome text not null,
  ordem int not null default 0,
  usar_na_ia boolean not null default true,
  -- { o_que_e, publico, promessa, entregaveis, professores, preco, ... } (textos livres)
  campos jsonb not null default '{}',
  atualizado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (projeto_id, slug)
);
create index on conhecimento (projeto_id, ordem);
alter table conhecimento enable row level security; -- só o servidor lê e grava

-- Abas iniciais da Cultura Jurídica.
insert into conhecimento (projeto_id, slug, nome, ordem)
select p.id, c.slug, c.nome, c.ordem
  from projetos p
  cross join (values
    ('processualista', 'Clube Processualista', 1),
    ('penalista', 'Clube Penalista', 2),
    ('civilista', 'Clube Civilista', 3),
    ('agora', 'Ágora', 4),
    ('academia', 'Academia', 5)
  ) as c(slug, nome, ordem)
 where p.slug = 'cultura-juridica'
on conflict (projeto_id, slug) do nothing;
