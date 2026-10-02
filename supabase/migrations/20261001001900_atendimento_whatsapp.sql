-- Atendimento pelo WhatsApp (Evolution API): uma instância por projeto e os agentes
-- comerciais respondendo. Liga projeto a projeto (começa pela Cultura Jurídica).
alter table projetos
  add column whatsapp_instancia text unique,          -- nome da instância na Evolution
  add column atendimento_ia boolean not null default false;

alter table leads
  add column humano boolean not null default false,  -- uma pessoa assumiu: a IA não responde
  add column humano_motivo text,
  add column optout boolean not null default false,  -- pediu para não receber mensagens
  add column respondendo_ate timestamptz;            -- trava para dois agentes não responderem juntos

-- Id da mensagem no WhatsApp (Evolution) para não gravar duas vezes.
alter table mensagens_whatsapp add column externo_id text unique;

update projetos set atendimento_ia = true, whatsapp_instancia = coalesce(whatsapp_instancia, slug)
where slug = 'cultura-juridica';
