-- Refação pelo quadro do painel: a peça nova aponta para a anterior e leva o motivo.
alter table criativos
  add column refaz_de uuid references criativos(id),
  add column feedback text;
create index on criativos (refaz_de);

alter table ofertas add column feedback text;
