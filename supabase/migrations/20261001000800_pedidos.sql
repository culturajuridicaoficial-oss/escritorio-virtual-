-- Pedidos feitos pelo painel do projeto: o que entregar, em que quantidade e com quais referências.
create table pedidos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id),
  autor text not null,
  texto text not null,
  -- { oferta, pagina, estaticos, formato_estatico, videos, duracao_video }
  entregas jsonb not null,
  -- [{ nome, tipo, caminho }] (arquivos no bucket "referencias") e links no texto
  referencias jsonb not null default '[]',
  links text[] not null default '{}',
  status text not null default 'escrevendo' check (status in ('escrevendo', 'produzindo', 'entregue', 'erro')),
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on pedidos (projeto_id, created_at desc);
alter table pedidos enable row level security; -- só o servidor lê e grava

alter table ofertas add column pedido_id uuid references pedidos(id);
create index on ofertas (pedido_id);

-- Anexos de referência (privado; o painel envia com URL assinada e só o servidor lê)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('referencias', 'referencias', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;
