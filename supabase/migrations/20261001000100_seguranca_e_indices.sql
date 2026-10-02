-- A função só deve rodar pelo gatilho, nunca pela API.
revoke execute on function aplicar_evento_no_agente() from public, anon, authenticated;

-- Índices nas chaves estrangeiras
create index on agente_eventos (agente_id);
create index on agente_eventos (projeto_id);
create index on agentes (funcao_id);
create index on criativos (projeto_id);
create index on criativos (oferta_id);
create index on criativos (criado_por);
create index on leads (projeto_id);
create index on mensagens_whatsapp (agente_id);
create index on ofertas (projeto_id);
create index on ofertas (criado_por);
create index on relatorios (projeto_id);
