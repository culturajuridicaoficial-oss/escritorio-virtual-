-- O que cada agente está fazendo agora. Alimenta a coluna "Tarefas agora" do escritório.
create table tarefas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid references projetos(id),
  agente_id text references agentes(id),
  titulo text not null,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'concluida', 'erro')),
  erro text,
  iniciada_em timestamptz not null default now(),
  concluida_em timestamptz
);
create index on tarefas (projeto_id, iniciada_em desc);
create index on tarefas (agente_id);

alter table tarefas enable row level security;
create policy "escritorio le tarefas" on tarefas for select to anon, authenticated using (true);
alter publication supabase_realtime add table tarefas;

-- Tarefa de função desativada vai para o agente ativo do mesmo time (mesma regra dos eventos).
create trigger tarefas_encaminhar
before insert on tarefas
for each row execute function encaminhar_para_agente_ativo();
