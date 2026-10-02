-- Funis: cada projeto passa a ter vários briefings (um por produto/funil), cada um com
-- um código único (ex.: DPL-WKS-01). Tudo que o time produz para o funil leva o código
-- dele + tipo + número da peça (ex.: DPL-WKS-01-EST-003; refeita: DPL-WKS-01-EST-003-R1).

alter table projetos add column sigla text unique check (sigla ~ '^[A-Z0-9]{2,5}$');
update projetos set sigla = case slug
  when 'doido-por-leilao' then 'DPL'
  when 'sf-educacao' then 'SFE'
  when 'vanessa-espansione' then 'VES'
  else upper(left(regexp_replace(slug, '[^a-z0-9]', '', 'g'), 3))
end where sigla is null;

create table funis (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id),
  codigo text not null unique,             -- PROJETO-PRODUTO-NN, ex.: DPL-WKS-01
  sigla_produto text not null check (sigla_produto ~ '^[A-Z0-9]{2,5}$'),
  numero int not null,
  nome text not null,
  pagina_vendas_url text,
  briefing jsonb,
  briefing_atualizado_em timestamptz,
  criado_por text,
  created_at timestamptz not null default now(),
  unique (projeto_id, sigla_produto, numero)
);
create index on funis (projeto_id, created_at desc);
alter table funis enable row level security; -- só o servidor lê e grava

/** Cria o funil com o próximo número livre para aquele projeto + produto. */
create or replace function criar_funil(
  p_projeto_id uuid, p_sigla_produto text, p_nome text, p_url text, p_autor text
) returns funis language plpgsql as $$
declare
  v_sigla text;
  v_numero int;
  v_funil funis;
begin
  select sigla into strict v_sigla from projetos where id = p_projeto_id for update;
  select coalesce(max(numero), 0) + 1 into v_numero
    from funis where projeto_id = p_projeto_id and sigla_produto = p_sigla_produto;
  insert into funis (projeto_id, codigo, sigla_produto, numero, nome, pagina_vendas_url, criado_por)
  values (p_projeto_id, v_sigla || '-' || p_sigla_produto || '-' || lpad(v_numero::text, 2, '0'),
          p_sigla_produto, v_numero, p_nome, p_url, p_autor)
  returning * into v_funil;
  return v_funil;
end $$;

-- Numeração das peças dentro do funil, por tipo.
create table funil_contadores (
  funil_id uuid not null references funis(id) on delete cascade,
  tipo text not null,                       -- OF, PV, EST, VID
  ultimo int not null default 0,
  primary key (funil_id, tipo)
);
alter table funil_contadores enable row level security;

create or replace function proximo_codigo(p_funil_id uuid, p_tipo text) returns text language plpgsql as $$
declare
  v_n int;
  v_codigo text;
begin
  insert into funil_contadores (funil_id, tipo, ultimo) values (p_funil_id, p_tipo, 1)
  on conflict (funil_id, tipo) do update set ultimo = funil_contadores.ultimo + 1
  returning ultimo into v_n;
  select codigo into strict v_codigo from funis where id = p_funil_id;
  return v_codigo || '-' || p_tipo || '-' || lpad(v_n::text, 3, '0');
end $$;

/** Versão refeita de uma peça: ...-EST-003 -> ...-EST-003-R1 -> ...-EST-003-R2 */
create or replace function codigo_refeito(p_codigo text) returns text language sql immutable as $$
  select case
    when p_codigo is null then null
    when p_codigo ~ '-R[0-9]+$'
      then regexp_replace(p_codigo, '-R([0-9]+)$', '') || '-R' || ((substring(p_codigo from '-R([0-9]+)$'))::int + 1)
    else p_codigo || '-R1'
  end
$$;

alter table pedidos add column funil_id uuid references funis(id);
alter table ofertas add column funil_id uuid references funis(id), add column codigo text unique;
alter table criativos add column funil_id uuid references funis(id), add column codigo text unique;
create index on ofertas (funil_id);
create index on criativos (funil_id);
create index on pedidos (funil_id);

-- Código automático na criação. A oferta "base" (rascunho, só serve de apoio às peças)
-- não ganha número: só oferta pedida conta.
create or replace function codificar_peca() returns trigger language plpgsql as $$
begin
  if new.codigo is not null or new.funil_id is null then return new; end if;
  if tg_table_name = 'ofertas' then
    if new.status <> 'rascunho' then new.codigo := proximo_codigo(new.funil_id, 'OF'); end if;
  elsif new.refaz_de is not null then
    select codigo_refeito(codigo) into new.codigo from criativos where id = new.refaz_de;
  else
    new.codigo := proximo_codigo(new.funil_id,
      case new.tipo when 'pagina' then 'PV' when 'estatico' then 'EST' else 'VID' end);
  end if;
  return new;
end $$;
create trigger codificar_oferta before insert on ofertas for each row execute function codificar_peca();
create trigger codificar_criativo before insert on criativos for each row execute function codificar_peca();

-- O briefing atual de cada projeto vira o funil 01, e o que já foi produzido ganha código.
do $$
declare
  p record;
  f funis;
  r record;
begin
  for p in select * from projetos where briefing is not null loop
    f := criar_funil(p.id,
      case p.slug when 'doido-por-leilao' then 'WKS' when 'sf-educacao' then 'EDU' else 'PRD' end,
      case p.slug when 'doido-por-leilao' then 'Workshop Lucrando com Veículos de Leilão'
        when 'sf-educacao' then 'SF Educar · Plataforma de Educação Automotiva' else p.nome end,
      p.pagina_vendas_url, null);
    update funis set briefing = p.briefing, briefing_atualizado_em = p.briefing_atualizado_em,
      created_at = coalesce(p.briefing_atualizado_em, now()) where id = f.id;
    update pedidos set funil_id = f.id where projeto_id = p.id;
    update ofertas set funil_id = f.id where projeto_id = p.id;
    update criativos set funil_id = f.id where projeto_id = p.id;
    for r in select id from ofertas where funil_id = f.id and status <> 'rascunho' order by created_at loop
      update ofertas set codigo = proximo_codigo(f.id, 'OF') where id = r.id;
    end loop;
    for r in select id, tipo, refaz_de from criativos where funil_id = f.id order by created_at loop
      if r.refaz_de is not null then
        update criativos set codigo = (select codigo_refeito(codigo) from criativos where id = r.refaz_de) where id = r.id;
      else
        update criativos set codigo = proximo_codigo(f.id,
          case r.tipo when 'pagina' then 'PV' when 'estatico' then 'EST' else 'VID' end) where id = r.id;
      end if;
    end loop;
  end loop;
end $$;
