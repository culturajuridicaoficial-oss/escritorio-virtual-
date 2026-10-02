-- Administradores: só eles criam projetos novos pelo painel.
alter table equipe add column admin boolean not null default false;
update equipe set admin = true where email = 'douglasnakazawa@hotmail.com';

-- Projeto novo com o squad completo: um agente por função, com nomes sorteados, as mesmas
-- funções desativadas dos outros squads (1 por time na Sala de Marketing) e os analistas
-- Veredito e Lupa. O escritório virtual, a recepção e o painel leem tudo do banco.
create or replace function criar_projeto(p_nome text, p_slug text, p_sigla text, p_meta numeric)
returns projetos language plpgsql security definer set search_path = public as $$
declare
  v projetos;
  nomes text[];
  cores text[] := array['#e5484d','#8e4ec6','#3e63dd','#12a594','#f76b15','#d6409f','#ffc53d',
                        '#0090ff','#30a46c','#6e56cf','#e54666','#ad7f58','#46a758'];
begin
  insert into projetos (slug, nome, sigla, meta_diaria)
  values (p_slug, p_nome, p_sigla, p_meta)
  returning * into v;

  select array_agg(n order by random()) into nomes
    from unnest(array['Arthur','Beatriz','Caio','Diana','Eduardo','Fernanda','Gabriel','Heloísa','Isaque','Júlia',
                      'Kauã','Laura','Mateus','Nicole','Otávio','Priscila','Rafael','Sabrina','Tiago','Valentina',
                      'Wagner','Yasmin','Bento','Cauã','Elisa','Fábio','Giovana','Henrique','Lívia','Marcos']) as n;

  insert into agentes (id, projeto_id, funcao_id, nome, cor, ativo)
  select v.slug || ':' || f.id, v.id, f.id,
         case f.id when 'analista-ofertas' then 'Veredito' when 'analista-meta' then 'Lupa' else nomes[f.ordem] end,
         case f.id when 'analista-ofertas' then '#f5f5f3' when 'analista-meta' then '#5ef0a8'
                   else cores[1 + (f.ordem - 1) % array_length(cores, 1)] end,
         f.id not in ('copy-pagina', 'copy-estatico', 'copy-video', 'otimizador')
    from funcoes f;
  return v;
end $$;
revoke execute on function criar_projeto(text, text, text, numeric) from public, anon, authenticated;
