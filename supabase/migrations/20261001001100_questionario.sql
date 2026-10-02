-- Briefing sem página de vendas: as respostas do questionário ficam guardadas no funil
-- e vão junto com o briefing para o time (a frase literal do cliente, o vilão etc.).
alter table funis add column questionario jsonb;
