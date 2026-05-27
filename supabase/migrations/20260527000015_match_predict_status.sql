-- ============================================================================
-- Resultadismo · 15 · "Quem já palpitou" antes do jogo (sem revelar o placar)
-- Retorna os membros das ligas do próprio usuário (que disputam a competição
-- daquele jogo) com um booleano `predicted`. NUNCA retorna o placar — seguro
-- de exibir antes do kickoff. Para revelar os placares, segue valendo a RLS de
-- predictions (só após o kickoff), usada pelo "Palpites da galera".
-- ============================================================================

create or replace function public.get_match_predict_status(p_match_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  predicted boolean,
  league_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_comp uuid;
begin
  if auth.uid() is null then
    return;
  end if;

  select m.competition_id into v_comp from public.matches m where m.id = p_match_id;
  if v_comp is null then
    return;
  end if;

  return query
  with my_leagues as (
    -- ligas em que o usuário é membro ativo e que disputam esta competição
    select distinct lm.league_id
    from public.league_members lm
    join public.league_competitions lc on lc.league_id = lm.league_id
    where lm.user_id = auth.uid()
      and lm.status = 'active'
      and lc.competition_id = v_comp
  ),
  circle as (
    -- união dos membros ativos dessas ligas (1 linha por pessoa)
    select lm.user_id, min(lm.league_id) as league_id
    from public.league_members lm
    where lm.league_id in (select league_id from my_leagues)
      and lm.status = 'active'
    group by lm.user_id
  )
  select
    c.user_id,
    p.display_name,
    p.avatar_url,
    exists (
      select 1 from public.predictions pr
      where pr.user_id = c.user_id and pr.match_id = p_match_id
    ) as predicted,
    c.league_id
  from circle c
  join public.profiles p on p.id = c.user_id
  order by predicted asc, p.display_name asc; -- quem falta primeiro
end;
$$;

revoke execute on function public.get_match_predict_status(uuid) from public;
grant execute on function public.get_match_predict_status(uuid) to authenticated;
