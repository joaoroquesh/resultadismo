-- Retrô — rodada 21.1 (refino do PO sobre as dicas):
-- A dica NÃO é curiosidade aleatória — é uma PISTA curta que ajuda a reconhecer o jogo
-- e puxar a memória do placar (apelido/lance marcante), tipo "Gol de mão do Maradona"
-- ou "Maracanazzo". Continua sem entregar o placar LITERAL (sem dígitos de placar, sem
-- "venceu/goleou/campeão"). Aqui: encurta o limite p/ uma linha (90) e reescreve os
-- exemplos como apelidos.

create or replace function public.admin_set_match_fact(
  p_match_id uuid, p_fact text, p_reviewed boolean default true, p_source text default 'manual'
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_clean text := nullif(btrim(coalesce(p_fact, '')), '');
begin
  if not public.is_app_admin() then raise exception 'Apenas administradores.'; end if;
  if p_source is not null and p_source not in ('manual', 'ia') then raise exception 'fonte inválida'; end if;
  if v_clean is not null then
    if length(v_clean) > 90 then raise exception 'Dica muito longa — uma pista curta de uma linha (máx. 90 caracteres).'; end if;
    -- a pista pode evocar o jogo (apelido/lance), mas não pode dar o placar LITERAL
    if p_reviewed and public.retro_fact_is_spoiler(v_clean) then
      raise exception 'A dica está entregando o placar de forma literal — use o apelido/lance que ajuda a LEMBRAR (ex.: "Gol de mão do Maradona"), sem dígitos de placar nem "venceu/goleou".';
    end if;
  end if;
  update public.retro_matches
     set fact_pt = v_clean,
         fact_source = case when v_clean is null then null else p_source end,
         fact_reviewed = (v_clean is not null and p_reviewed)
   where id = p_match_id;
  if not found then raise exception 'jogo não encontrado'; end if;
end $$;
revoke execute on function public.admin_set_match_fact(uuid, text, boolean, text) from public, anon;
grant execute on function public.admin_set_match_fact(uuid, text, boolean, text) to authenticated;

-- reescreve os exemplos como PISTAS curtas (apelido/lance marcante)
update public.retro_matches set fact_pt = 'O Maracanazzo', fact_source = 'manual', fact_reviewed = true
 where wc_year = 1950 and home_slug = 'uruguai' and away_slug = 'brasil';

update public.retro_matches set fact_pt = 'O golaço de Carlos Alberto', fact_source = 'manual', fact_reviewed = true
 where wc_year = 1970 and home_slug = 'brasil' and away_slug = 'italia';

update public.retro_matches set fact_pt = 'O gol de mão do Maradona', fact_source = 'manual', fact_reviewed = true
 where wc_year = 1986 and ((home_slug = 'argentina' and away_slug = 'inglaterra') or (home_slug = 'inglaterra' and away_slug = 'argentina'));

update public.retro_matches set fact_pt = 'O Mineiraço', fact_source = 'manual', fact_reviewed = true
 where wc_year = 2014 and home_slug = 'brasil' and away_slug = 'alemanha';

update public.retro_matches set fact_pt = 'O Pelé de 17 anos', fact_source = 'manual', fact_reviewed = true
 where wc_year = 1958 and home_slug = 'suecia' and away_slug = 'brasil';
