-- Analista de métricas do Meta Ads: mesma estrutura de análises do Veredito, com outro agente.
insert into funcoes (id, nome, descricao, setor, ordem, time) values
  ('analista-meta', 'Analista de Meta Ads', 'Analisa métricas do Meta Ads e decide o que escalar, pausar ou testar', 'trafego', 15, 'trafego')
on conflict (id) do nothing;

insert into agentes (id, projeto_id, funcao_id, nome, cor)
select p.slug || ':analista-meta', p.id, 'analista-meta', 'Lupa', '#5ef0a8'
  from projetos p
on conflict (id) do nothing;

alter table analises
  add column agente text not null default 'analista-ofertas' check (agente in ('analista-ofertas', 'analista-meta')),
  -- análise de Meta Ads: objetivo, meta de CPA/ROAS, ticket, período e contexto
  add column contexto jsonb not null default '{}',
  -- prints, CSV/XLSX e PDFs enviados (bucket "referencias")
  add column arquivos jsonb not null default '[]',
  alter column funil_id drop not null;

-- Com funil: DPL-WKS-01-AN-001 (oferta) ou DPL-WKS-01-MT-001 (Meta Ads). Conta toda: sem código de funil.
create or replace function codificar_analise() returns trigger language plpgsql as $$
begin
  if new.codigo is null and new.funil_id is not null then
    new.codigo := proximo_codigo(new.funil_id, case new.agente when 'analista-meta' then 'MT' else 'AN' end);
  end if;
  return new;
end $$;

-- Planilhas exportadas do Gerenciador também podem ser enviadas como anexo.
update storage.buckets
   set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf',
     'text/csv', 'text/plain', 'application/vnd.ms-excel',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
 where id = 'referencias';
