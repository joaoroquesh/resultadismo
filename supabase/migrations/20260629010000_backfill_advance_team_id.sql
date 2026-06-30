-- ============================================================================
-- Resultadismo · Correção "quem passa" vazio em palpites antigos de mata-mata
-- ----------------------------------------------------------------------------
-- Alguns palpites empatados foram criados antes do seletor "Quem passa?" subir
-- para produção. Pela regra do produto, empate em mata-mata NUNCA fica sem
-- classificado: se o usuário não escolheu, o mandante é o default.
--
-- Esta migration:
--   1) reforça a trigger para preencher o mandante quando advance_team_id vier
--      vazio em empate de mata-mata;
--   2) faz backfill apenas dos registros vazios, preservando quem já escolheu.
-- ============================================================================

create or replace function public.predictions_score_on_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare m public.matches;
begin
  select * into m from public.matches where id = new.match_id;

  -- normaliza "quem passa": só vale em mata-mata + palpite de empate.
  -- Empate sem escolha herda o mandante, inclusive para palpites antigos
  -- regravados depois da correção.
  if not coalesce(m.is_knockout, false) or new.home_pred <> new.away_pred then
    new.advance_team_id := null;
  elsif new.advance_team_id is null then
    new.advance_team_id := m.home_team_id;
  elsif m.home_team_id is not null
        and m.away_team_id is not null
        and new.advance_team_id <> m.home_team_id
        and new.advance_team_id <> m.away_team_id then
    raise exception 'advance_team_id deve ser um dos times do jogo';
  end if;

  if m.status = 'finished' and m.home_score is not null and m.away_score is not null then
    new.score_type := public.compute_score_type(new.home_pred, new.away_pred, m.home_score, m.away_score);
    new.points := public.score_points(new.score_type);
    new.scored_at := now();
    new.advance_bonus := case when coalesce(m.is_knockout, false) then public.advance_bonus(
      new.home_pred, new.away_pred, new.advance_team_id, m.home_team_id, m.away_team_id, public.resolved_advancer(m))
      * public.knockout_phase_points(m.stage)
      else null end;
  else
    new.score_type := null;
    new.points := null;
    new.scored_at := null;
    new.advance_bonus := null;
  end if;
  return new;
end;
$$;

update public.predictions p
set advance_team_id = m.home_team_id
from public.matches m
where p.match_id = m.id
  and coalesce(m.is_knockout, false)
  and p.home_pred = p.away_pred
  and p.advance_team_id is null
  and m.home_team_id is not null;
