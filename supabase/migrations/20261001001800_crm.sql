-- CRM da Sala Comercial: cada lead é um card que anda pelas etapas.
-- Um telefone = um lead (formulário, WhatsApp e Kiwify se juntam pelo telefone, ou pelo e-mail).
alter table leads alter column etapa set default 'para_atender';
update leads set etapa = 'para_atender' where etapa = 'novo';
alter table leads add constraint leads_etapa_valida check (etapa in
  ('para_atender', 'em_atendimento', 'follow_up', 'aguardando_pagamento', 'compra_feita', 'perdido'));

alter table leads
  add column origens text[] not null default '{}',     -- formulario, whatsapp, carrinho, compra
  add column funil_codigo text,                        -- funil da página onde o lead se cadastrou
  add column utm jsonb,
  add column agente_id text references agentes(id),    -- agente de IA que está atendendo
  add column valor numeric(12,2),                      -- valor do pedido (Kiwify)
  add column pagamento text,                           -- link_enviado, pix_gerado, boleto_gerado, vai_comprar, pago, reembolsado
  add column checkout_url text,
  add column etapa_desde timestamptz not null default now(),
  add column ultima_mensagem text,
  add column ultima_mensagem_em timestamptz,
  add column ultima_entrada_em timestamptz,            -- última mensagem do lead
  add column ultima_saida_em timestamptz,              -- última mensagem nossa
  add column followup_tentativas int not null default 0,
  add column perdido_motivo text;

create index leads_crm on leads (projeto_id, etapa, updated_at desc);
create index leads_email on leads (lower(email));

-- Regras de tempo do follow-up (o painel chama ao carregar o CRM; a Fase 3 chama no cron):
-- * em atendimento, nossa última mensagem sem resposta há mais de p_intervalo -> follow-up;
-- * em follow-up, p_tentativas mensagens sem resposta (a última há mais de p_intervalo)
--   ou mais de p_prazo na etapa -> perdido.
create or replace function crm_aplicar_regras(p_intervalo interval, p_tentativas int, p_prazo interval)
returns void language sql security definer set search_path = public as $$
  update leads set etapa = 'follow_up', etapa_desde = now(), followup_tentativas = 0, updated_at = now()
  where etapa = 'em_atendimento'
    and ultima_saida_em is not null
    and ultima_saida_em < now() - p_intervalo
    and (ultima_entrada_em is null or ultima_entrada_em < ultima_saida_em);

  update leads set etapa = 'perdido', etapa_desde = now(), updated_at = now(),
    perdido_motivo = case when followup_tentativas >= p_tentativas
      then 'Sem resposta depois de ' || p_tentativas || ' follow-ups'
      else 'Sem resposta no prazo do follow-up' end
  where etapa = 'follow_up'
    and ((followup_tentativas >= p_tentativas and ultima_saida_em < now() - p_intervalo)
      or etapa_desde < now() - p_prazo);
$$;
revoke execute on function crm_aplicar_regras(interval, int, interval) from public, anon, authenticated;
