-- Projetos iniciais. Depois preencha: kiwify_produto_ids, meta_ad_account_id e limite_gasto_diario.
insert into projetos (slug, nome, sigla) values
  ('doido-por-leilao', 'Doido Por Leilão', 'DPL'),
  ('sf-educacao', 'SF Educação', 'SFE'),
  ('vanessa-espansione', 'Vanessa Espansione', 'VES')
on conflict (slug) do nothing;

-- As funções de um squad (pontos 01 a 12; o 11 é o ciclo entre analista e copy).
insert into funcoes (id, nome, descricao, setor, ordem, time) values
  ('ofertas',            'Estrategista de ofertas',  'Cria novas ofertas para o infoproduto (01)',               'ofertas',   1, 'copy'),
  ('copy-pagina',        'Copywriter de página',     'Escreve a copy da página de vendas (02)',                  'copy',      2, 'copy'),
  ('copy-estatico',      'Copywriter de estáticos',  'Escreve a copy dos anúncios estáticos (03)',               'copy',      3, 'copy'),
  ('copy-video',         'Roteirista de vídeo',      'Escreve os roteiros dos anúncios em vídeo (04)',           'copy',      4, 'copy'),
  ('paginas',            'Construtor de páginas',    'Monta e publica a página de vendas (05)',                  'criacao',   5, 'dev'),
  ('design',             'Designer',                 'Cria os anúncios estáticos (06)',                          'criacao',   6, 'design'),
  ('video',              'Editor de vídeo',          'Cria os anúncios em vídeo (07)',                           'criacao',   7, 'video'),
  ('trafego',            'Gestor de tráfego',        'Cria as campanhas no Meta Ads (08)',                       'trafego',   8, 'trafego'),
  ('otimizador',         'Otimizador',               'Otimiza as campanhas no Meta Ads (09)',                    'trafego',   9, 'trafego'),
  ('analista',           'Analista',                 'Analisa resultados e envia relatório ao time de copy (10)','analise',  10, 'bi'),
  ('comercial-popup',    'SDR do pop-up',            'Atende os leads do pop-up (12)',                           'comercial', 11, 'comercial'),
  ('comercial-carrinho', 'Recuperador de carrinho',  'Recupera carrinhos abandonados (12)',                      'comercial', 12, 'comercial'),
  ('comercial-pos',      'Pós-venda',                'Atende compradores (12)',                                  'comercial', 13, 'comercial'),
  ('analista-ofertas',   'Analista de ofertas',      'Audita produto, oferta e copy e entrega ordens de mudança', 'analise',  14, 'copy'),
  ('analista-meta',      'Analista de Meta Ads',     'Analisa métricas do Meta Ads e decide o que escalar, pausar ou testar', 'trafego', 15, 'trafego')
on conflict (id) do nothing;

-- Um squad por projeto. Nomes diferentes em cada squad para identificar no escritório.
with nomes(slug, ordem, nome) as (
  select 'doido-por-leilao', ordinality::int, n
    from unnest(array['Otto','Clara','Caio','Vitor','Paula','Dani','Eva','Teo','Olga','Ana','Lia','Rui','Bia']) with ordinality as n
  union all
  select 'sf-educacao', ordinality::int, n
    from unnest(array['Sofia','Bruno','Lara','Igor','Nina','Hugo','Alice','Davi','Rita','Enzo','Maya','Leo','Iris']) with ordinality as n
  union all
  select 'vanessa-espansione', ordinality::int, n
    from unnest(array['Vera','Murilo','Tais','Gael','Luna','Saulo','Cecilia','Joel','Helena','Pietro','Yara','Raul','Zoe']) with ordinality as n
),
cores(ordem, cor) as (
  select ordinality::int, c
    from unnest(array['#e5484d','#8e4ec6','#3e63dd','#12a594','#f76b15','#d6409f','#ffc53d',
                      '#0090ff','#30a46c','#6e56cf','#e54666','#ad7f58','#46a758']) with ordinality as c
)
insert into agentes (id, projeto_id, funcao_id, nome, cor)
select p.slug || ':' || f.id, p.id, f.id, n.nome, c.cor
  from funcoes f
  join nomes n on n.ordem = f.ordem
  join projetos p on p.slug = n.slug
  join cores c on c.ordem = f.ordem
on conflict (id) do nothing;

-- Os analistas (Veredito, de ofertas, e Lupa, de Meta Ads) são os mesmos em todos os squads.
insert into agentes (id, projeto_id, funcao_id, nome, cor)
select p.slug || ':' || a.funcao, p.id, a.funcao, a.nome, a.cor
  from projetos p
  cross join (values ('analista-ofertas', 'Veredito', '#f5f5f3'), ('analista-meta', 'Lupa', '#5ef0a8')) as a(funcao, nome, cor)
on conflict (id) do nothing;

-- Sala de Marketing com 1 agente por time (ver migração 20261001000400).
update agentes set ativo = false
 where funcao_id in ('copy-pagina', 'copy-estatico', 'copy-video', 'otimizador');
