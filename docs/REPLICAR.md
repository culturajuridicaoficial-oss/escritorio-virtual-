# Prompt para replicar o sistema num negócio novo (do zero)

Use quando for montar o mesmo sistema para **outro negócio**, com GitHub, Supabase e Vercel
novos. Cole o bloco abaixo numa sessão nova do Claude Code (claude.ai/code) e troque o que
está entre `<...>`.

Antes de colar:
1. Crie um **repositório vazio** no GitHub para o negócio novo (ex.: `<sua-conta>/<negocio>`).
2. Abra a sessão do Claude Code com **os dois repositórios**: este (`douglasnakazawa/grupo-nkz`,
   só para leitura do código) e o novo (onde o código vai morar).
3. Tenha conectados na sessão os conectores do **Supabase** e da **Vercel** (o Claude cria os
   projetos por eles). Sem os conectores, ele te passa o passo a passo para fazer no painel.
4. Tenha à mão (não cole no chat, você vai colar direto na Vercel): chave da API da Anthropic,
   dados da Evolution API, token do webhook da Kiwify e token do Meta (estes três podem vir depois).

---

```text
Quero replicar, para um negócio novo e do zero, o sistema de marketing com agentes de IA do
Grupo NKZ. O código de referência está no repositório douglasnakazawa/grupo-nkz, branch
claude/beautiful-brown-b0fl5x. NÃO reescreva o sistema: copie o código para o repositório
novo <conta/repositorio-novo>, adapte a marca e os dados do negócio, crie Supabase e Vercel
novos e publique. Fale comigo em português do Brasil, sem jargão.

## O negócio novo
- Nome do negócio (marca do prédio virtual): <Nome do Negócio>
- Cores da marca: <ex.: preto #0a0a0a, branco #f5f5f3, destaque #00c26e> (se eu não souber, proponha)
- Domínio/URL desejada na Vercel: <nome-do-projeto>.vercel.app
- E-mail do administrador: <meu e-mail>
- Projetos (cada um vira um escritório com 15 agentes): <Nome 1 (SIGLA1)>, <Nome 2 (SIGLA2)>...
- Primeiro projeto que terá atendimento no WhatsApp: <slug do projeto>

## O que o sistema faz (para você conferir que tudo veio junto)
Next.js 16 (App Router) + Supabase (Postgres, Auth, Realtime, Storage, Vault, pg_cron) + Vercel
+ API do Claude. Cada projeto (infoproduto) tem um escritório virtual em pixel art:
- Recepção (/), hall, Sala de Marketing e Sala Comercial (/escritorio/<slug>), visão geral
  para TV (/escritorio). Animações vêm de agente_eventos e tarefas (Realtime).
- Painel do projeto (/escritorio/<slug>/painel, login por e-mail na tabela equipe):
  funis com código único (ex.: ABC-PRD-01, peças herdam: ABC-PRD-01-EST-001, refação -R1);
  briefing pela página de vendas ou pelo questionário de 21 perguntas; pedidos ao time
  (ofertas, páginas, estáticos, vídeos em HTML/CSS) num kanban com Aprovar/Refazer/Reprovar;
  aba Análises com Veredito (oferta e copy, ordens OM-xx) e Lupa (Meta Ads, CSV/XLSX/prints).
- Admin (/admin, só equipe.admin): criar projeto, ocultar escritório, consumo da IA em US$.
- Economia de tokens: cache de prompt, rodada diária em lote (Batch API, metade do preço,
  tabela lotes_ia) e esforço "medium" por padrão.
- CRM na Sala Comercial (só logado): 01 Para atender, 02 Em atendimento, 03 Follow-ups,
  04 Aguardando pagamento, 05 Compra feita, 06 Perdido. Formulário (POST /api/leads),
  WhatsApp e Kiwify se juntam pelo telefone. Follow-up a cada 2 h, até 4, e Perdido em 3 dias.
- Atendimento no WhatsApp pela Evolution API: uma instância por projeto, agentes Lia/Rui/Bia
  (Sonnet 5.5) respondendo com o briefing, passagem para humano, opt-out e rodada a cada
  15 min pelo pg_cron do Supabase (follow-ups e primeiro contato, das 8h às 21h).
- Integrações: Kiwify (webhook), Evolution (webhook), Meta Ads (sync diário), crons da Vercel
  (meta-sync, relatório, fábrica) em vercel.json.

## Passo a passo
1. Código: copie todo o conteúdo do grupo-nkz (branch acima) para o repositório novo, sem o
   histórico de git e sem node_modules/.next. Rode `npm install`, `npm run typecheck` e
   `npm run build`. Leia README.md e .env.example.
2. Marca: troque "Grupo NKZ"/"GRUPO NKZ"/"NKZ" pelo nome do negócio novo em todo o código
   (layout, Marca.tsx, recepção, pixel.ts, títulos das páginas, globals.css, e as personas
   de Veredito e Lupa em src/lib/agentes). Ajuste as cores em globals.css (:root). Faça
   `grep -rni "nkz" src supabase` no fim e não deixe sobrar nada.
3. Endereços e e-mail fixos:
   - supabase/migrations/20261001001400_novo_projeto.sql: troque douglasnakazawa@hotmail.com
     pelo e-mail do administrador novo;
   - supabase/migrations/20261001002000_agendador_comercial.sql: troque
     https://grupo-nkz.vercel.app pela URL nova;
   - supabase/migrations/20261001001900_atendimento_whatsapp.sql: troque 'doido-por-leilao'
     pelo slug do primeiro projeto com WhatsApp;
   - supabase/seed.sql: troque os 3 projetos de exemplo pelos projetos do negócio novo
     (slug, nome, sigla). Mantenha o resto do seed (funções e agentes).
4. Supabase: crie um projeto novo (região São Paulo). Aplique TODAS as migrações de
   supabase/migrations/ na ordem do nome e depois o seed.sql. A migração do agendador usa
   pg_cron e pg_net; ela só funciona depois do passo 7 (segredo no Vault). Se ela falhar
   por isso, aplique-a de novo no passo 7. Cadastre a equipe:
   insert into equipe (email, nome, admin) values ('<meu e-mail>', '<meu nome>', true);
5. Vercel: crie o projeto ligado ao repositório novo (branch de produção = a principal do
   repositório). Cadastre as variáveis do .env.example. As que você mesmo pode gerar e
   cadastrar (aleatórias, fortes): CRON_SECRET, EVOLUTION_WEBHOOK_SECRET e
   COMERCIAL_CRON_SECRET. As do Supabase (URL, anon key, service role) você pega pelo
   conector. As que são minhas (ANTHROPIC_API_KEY, EVOLUTION_URL, EVOLUTION_API_KEY,
   KIWIFY_WEBHOOK_TOKEN, META_ACCESS_TOKEN) eu mesmo colo na Vercel: me avise quais faltam e
   NUNCA me peça para colar segredo no chat.
6. Supabase Auth: Site URL = https://<url-nova> e Redirect URLs = https://<url-nova>/painel.
7. Vault: guarde no Vault o mesmo valor de COMERCIAL_CRON_SECRET com o nome
   comercial_cron_secret (select vault.create_secret('<valor>', 'comercial_cron_secret');)
   e confira que o job "rodada-comercial" existe em cron.job.
8. Publique e teste: recepção abre; login no painel com meu e-mail; /admin mostra os
   projetos; criar um funil e pedir 1 estático (confirma a chave da Anthropic e aparece o
   consumo no Admin); a Sala Comercial mostra o CRM vazio quando logado.
9. Integrações (quando eu tiver os dados):
   - Evolution: uma instância por projeto, com o nome igual ao slug (ou grave em
     projetos.whatsapp_instancia). Webhook de cada instância:
     https://<url-nova>/api/webhooks/evolution?secret=<EVOLUTION_WEBHOOK_SECRET>, evento
     MESSAGES_UPSERT. Ligue o atendimento por projeto com projetos.atendimento_ia = true.
   - Kiwify: webhook https://<url-nova>/api/webhooks/kiwify (compra aprovada, Pix/boleto
     gerado, reembolso, chargeback, carrinho abandonado) e os IDs dos produtos em
     projetos.kiwify_produto_ids.
   - Meta: usuário do sistema no Business Manager com ads_read; projetos.meta_ad_account_id
     sem o "act_".
   - Formulários das páginas de vendas: POST https://<url-nova>/api/leads com
     { projeto, nome, telefone, email, funil, utm } (o campo "site" é armadilha para robôs).
10. Me entregue no fim: a URL publicada, o que ficou configurado, o que depende de mim, e o
    endereço do webhook da Evolution pronto para colar.

## Regras
- Commits pequenos e em português; não crie pull request sem eu pedir.
- Mudança no banco sempre como migração nova em supabase/migrations/.
- Sem créditos na API do Claude, os agentes falham com uma mensagem explicando. Nesse caso,
  produza criativos e análises aqui no chat e grave direto no Supabase (criativos, analises,
  tarefas e agente_eventos) para aparecerem no painel e no escritório.
```

---

## O que não vai junto

O prompt recria o **sistema**, vazio. Funis, criativos, análises, leads e vendas do Grupo NKZ
ficam no Supabase atual e não são copiados (é outro negócio). Se algum dia precisar levar
dados, exporte as tabelas pelo Supabase e importe no projeto novo depois do passo 4.
