-- Cada função pertence a um time; o escritório organiza a Sala de Marketing em filas por time.
alter table funcoes add column time text
  check (time in ('copy', 'design', 'trafego', 'bi', 'video', 'dev', 'comercial'));

update funcoes set time = 'copy' where id in ('ofertas', 'copy-pagina', 'copy-estatico', 'copy-video');
update funcoes set time = 'design' where id in ('design');
update funcoes set time = 'trafego' where id in ('trafego', 'otimizador');
update funcoes set time = 'bi' where id in ('analista');
update funcoes set time = 'video' where id in ('video');
update funcoes set time = 'dev' where id in ('paginas');
update funcoes set time = 'comercial' where id in ('comercial-popup', 'comercial-carrinho', 'comercial-pos');

alter table funcoes alter column time set not null;
