-- Sala de Marketing com 1 agente por time. Os demais ficam desativados (não apagados).
update agentes set ativo = false
 where funcao_id in ('copy-pagina', 'copy-estatico', 'copy-video', 'otimizador');

-- Evento endereçado a um agente desativado vai para o agente ativo do mesmo time
-- no mesmo projeto (ex.: briefing para "copy-video" vai para o agente de copy).
create function encaminhar_para_agente_ativo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  substituto text;
begin
  if new.agente_id is null or exists (select 1 from agentes where id = new.agente_id and ativo) then
    return new;
  end if;

  select a2.id into substituto
    from agentes a1
    join funcoes f1 on f1.id = a1.funcao_id
    join agentes a2 on a2.projeto_id = a1.projeto_id and a2.ativo
    join funcoes f2 on f2.id = a2.funcao_id and f2.time = f1.time
   where a1.id = new.agente_id
   order by f2.ordem
   limit 1;

  if substituto is not null then
    new.agente_id := substituto;
  end if;
  return new;
end $$;

create trigger agente_eventos_encaminhar
before insert on agente_eventos
for each row execute function encaminhar_para_agente_ativo();

revoke execute on function encaminhar_para_agente_ativo() from public, anon, authenticated;

-- Para reativar: update agentes set ativo = true where funcao_id in (...);
