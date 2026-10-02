-- Escritório oculto: some da recepção, do escritório geral e do próprio endereço público
-- (as regras de leitura pública filtram). Painel, agentes e rotinas continuam funcionando.
alter table projetos add column oculto boolean not null default false;

create or replace function projeto_visivel(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from projetos where id = p_id and ativo and not oculto)
$$;
grant execute on function projeto_visivel(uuid) to anon, authenticated;

alter policy "escritorio le projetos" on projetos using (ativo and not oculto);
alter policy "escritorio le agentes" on agentes using (projeto_visivel(projeto_id));
alter policy "escritorio le eventos" on agente_eventos using (projeto_id is null or projeto_visivel(projeto_id));
alter policy "escritorio le tarefas" on tarefas using (projeto_visivel(projeto_id));
