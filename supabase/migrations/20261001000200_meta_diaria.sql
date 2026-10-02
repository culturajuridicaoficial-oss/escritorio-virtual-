-- Meta diária por projeto. Quando as vendas do dia passam da meta, o escritório inteiro comemora.
alter table projetos add column meta_diaria numeric(12,2);
grant select (meta_diaria) on projetos to anon, authenticated;

-- "Hoje" é sempre no horário de Brasília.
create function hoje_brasilia() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- Estado do agente: conta tarefas pelo dia de Brasília e comemora também na meta.
create or replace function aplicar_evento_no_agente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.agente_id is not null then
    update agentes
       set ultima_fala = new.mensagem,
           status = case new.tipo
                      when 'venda' then 'comemorando'
                      when 'meta_batida' then 'comemorando'
                      when 'relatorio' then 'reuniao'
                      else 'trabalhando'
                    end,
           tarefas_hoje = case
                            when (updated_at at time zone 'America/Sao_Paulo')::date = hoje_brasilia()
                            then tarefas_hoje + 1 else 1
                          end,
           updated_at = now()
     where id = new.agente_id;
  end if;
  return new;
end $$;

-- A cada venda, vê se o projeto acabou de cruzar a meta do dia.
create function verificar_meta_diaria() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta numeric;
  nome_projeto text;
  total numeric;
begin
  select p.meta_diaria, p.nome into meta, nome_projeto from projetos p where p.id = new.projeto_id;
  if meta is null or meta <= 0 then
    return new;
  end if;

  select coalesce(sum(e.valor), 0) into total
    from agente_eventos e
   where e.projeto_id = new.projeto_id
     and e.tipo = 'venda'
     and (e.created_at at time zone 'America/Sao_Paulo')::date = hoje_brasilia();

  if total >= meta and total - coalesce(new.valor, 0) < meta then
    insert into agente_eventos (agente_id, projeto_id, tipo, mensagem, valor)
    values (new.agente_id, new.projeto_id, 'meta_batida',
            nome_projeto || ' bateu a meta do dia! 🏆', total);
  end if;
  return new;
end $$;

create trigger agente_eventos_meta
after insert on agente_eventos
for each row when (new.tipo = 'venda' and new.projeto_id is not null)
execute function verificar_meta_diaria();

revoke execute on function verificar_meta_diaria() from public, anon, authenticated;
revoke execute on function aplicar_evento_no_agente() from public, anon, authenticated;
