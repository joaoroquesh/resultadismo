-- ============================================================================
-- Resultadismo · Unifica a "semana" no fuso de Brasília (America/Sao_Paulo)
-- ----------------------------------------------------------------------------
-- Antes coexistiam 3 definições de semana: joker (BRT, já correto), confronto
-- (UTC, ISO week) e a tela de Jogos (fuso do navegador). Isso fazia a virada de
-- semana divergir entre a regra do dobro, o confronto e o que o usuário vê.
-- Agora a semana do confronto também ancora em BRT (igual ao joker e à tela).
--
-- Observação: disputas de confronto em modo "semana" já sorteadas guardam o
-- period_value calculado em UTC; para jogos na virada (dom à noite BRT = seg UTC)
-- a semana pode mudar de rótulo após esta migração. Modo "fase" (padrão da Copa)
-- não é afetado (usa matchday/stage, não semana).
-- ============================================================================

create or replace function public.match_in_period(
  p_kind text,
  p_value text,
  p_fallback_matchday int,
  m_matchday int,
  m_stage text,
  m_kickoff timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when p_value is null and p_kind is null then m_matchday = p_fallback_matchday
    when p_kind = 'week' then m_kickoff is not null
      and to_char(date_trunc('week', (m_kickoff at time zone 'America/Sao_Paulo')), 'IYYY-IW') = p_value
    when p_kind = 'stage' then m_stage = p_value
      or (p_value = 'FINAL' and m_stage = 'THIRD_PLACE')
    when p_kind = 'matchday' then m_matchday = p_value::int
    else m_matchday = p_fallback_matchday
  end;
$$;

create or replace function public.get_competition_periods(
  p_competition_id uuid,
  p_kind text
)
returns table (
  period_index int,
  kind text,
  value text,
  label text,
  games int,
  starts_on date,
  ends_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select
      matchday,
      kickoff_at,
      case when stage = 'THIRD_PLACE' then 'FINAL' else stage end as stage
    from public.matches
    where competition_id = p_competition_id and kickoff_at is not null
  ),
  tagged as (
    select
      kickoff_at,
      case
        when p_kind = 'week' then 'week'
        when matchday is not null then 'matchday'
        else 'stage'
      end as p_kind_out,
      case
        when p_kind = 'week' then to_char(date_trunc('week', (kickoff_at at time zone 'America/Sao_Paulo')), 'IYYY-IW')
        when matchday is not null then matchday::text
        else stage
      end as p_value
    from base
  ),
  grp as (
    select p_kind_out, p_value,
           count(*)::int as games,
           min(kickoff_at) as mn,
           max(kickoff_at) as mx
    from tagged
    group by p_kind_out, p_value
  )
  select
    (row_number() over (order by mn))::int as period_index,
    p_kind_out as kind,
    p_value as value,
    case
      when p_kind_out = 'week' then 'Semana ' || (row_number() over (order by mn))::text
      when p_kind_out = 'matchday' then 'Rodada ' || p_value || ' (grupos)'
      when p_value = 'LAST_32' then '32-avos de final'
      when p_value = 'LAST_16' then 'Oitavas de final'
      when p_value = 'QUARTER_FINALS' then 'Quartas de final'
      when p_value = 'SEMI_FINALS' then 'Semifinais'
      when p_value = 'FINAL' then 'Final'
      when p_value = 'GROUP_STAGE' then 'Fase de grupos'
      else coalesce(p_value, 'Período')
    end as label,
    games,
    mn::date as starts_on,
    mx::date as ends_on
  from grp
  order by mn;
$$;
grant execute on function public.get_competition_periods(uuid, text) to anon, authenticated;
