-- ============================================================================
-- Resultadismo · Data de início do bolão (starts_on) EDITÁVEL pelo dono
-- ----------------------------------------------------------------------------
-- Pedido do João (2026-06-15, evolução do ADR 0010): hoje a criação grava
-- league_competitions.starts_on só como "hoje" × "tudo" (toggle binário). O dono
-- passa a ESCOLHER o dia em que a pontuação do bolão começa a valer — qualquer
-- data DENTRO do período da Copa (do 1º ao último jogo), pra trás (incluir quem
-- já jogava) ou pra frente (começar mais tarde) — e pode MUDAR depois.
--
-- Decisões do PO:
--  · Janela: editável enquanto a Copa NÃO terminou; trava quando acaba (resultado
--    final). (Espelha o recorte de seleções, mas o gatilho é o FIM, não o começo.)
--  · Limites: [1º jogo … último jogo] da competição, em horário de Brasília.
--  · Escopo: só o ranking de pontos do bolão (Confronto e ranking geral não usam).
--  · Mudar recalcula a classificação (o front avisa antes).
--
-- A RLS de league_competitions já restringe o UPDATE ao admin do grupo; o trigger
-- abaixo adiciona a janela + os limites. O front edita via UPDATE direto (igual
-- ao recorte de seleções) e espelha a janela via starts_on_window().
-- ============================================================================

-- 1) Ajuste de FUSO no corte do ranking (correção): o "dia" do bolão é em
--    America/Sao_Paulo (igual ao dobro, à semana e à tela de Jogos), não UTC.
--    Sem isso, um jogo no fim da noite (BRT) cairia no dia seguinte (UTC) e
--    contaria/descontaria errado na virada. Recria a função vigente
--    (20260610160000) trocando SÓ a linha do corte por data; o resto é idêntico.
--    get_my_league_positions e get_group_rank_window delegam a esta função e
--    herdam o ajuste.
create or replace function public.get_league_standings(p_lc_id uuid)
returns table (
  user_id uuid, display_name text, avatar_url text,
  jogos int, pontos int, cravadas int, saldos int, acertos int, erros int,
  aproveitamento numeric, acertividade numeric, rank int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
  v_competition_id uuid;
  v_starts_on date;
  v_visibility public.league_visibility;
  v_p_cravada int; v_p_saldo int; v_p_acerto int;
  v_scope text[];
begin
  select lc.league_id, lc.competition_id, lc.starts_on,
         coalesce((lc.settings -> 'points' ->> 'cravada')::int, 3),
         coalesce((lc.settings -> 'points' ->> 'saldo')::int, 2),
         coalesce((lc.settings -> 'points' ->> 'acerto')::int, 1),
         lc.followed_team_slugs
    into v_league_id, v_competition_id, v_starts_on, v_p_cravada, v_p_saldo, v_p_acerto, v_scope
  from public.league_competitions lc
  where lc.id = p_lc_id;

  if v_league_id is null then return; end if;
  if coalesce(v_p_cravada, 0) <= 0 then v_p_cravada := 3; end if;

  select l.visibility into v_visibility from public.leagues l where l.id = v_league_id;
  if not (public.is_app_admin() or public.is_league_member(v_league_id) or v_visibility = 'public') then
    return;
  end if;

  return query
  with members as (
    select lm.user_id, p.display_name, p.avatar_url, p.created_at
    from public.league_members lm
    join public.profiles p on p.id = lm.user_id
    where lm.league_id = v_league_id and lm.status = 'active'
  ),
  scored as (
    select pr.user_id, pr.score_type, pr.is_joker
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    where m.competition_id = v_competition_id
      and m.status = 'finished'
      and pr.score_type is not null
      and (v_starts_on is null
           or (m.kickoff_at at time zone 'America/Sao_Paulo')::date >= v_starts_on)
      and (v_scope is null
           or public.team_slug(m.home_team_name) = any(v_scope)
           or public.team_slug(m.away_team_name) = any(v_scope))
  ),
  agg as (
    select s.user_id,
      count(*)::int as jogos,
      sum((case s.score_type when 'cravada' then v_p_cravada when 'saldo' then v_p_saldo when 'acerto' then v_p_acerto else 0 end)
          * (case when s.is_joker then 2 else 1 end))::int as pontos,
      count(*) filter (where s.score_type = 'cravada')::int as cravadas,
      count(*) filter (where s.score_type = 'saldo')::int as saldos,
      count(*) filter (where s.score_type = 'acerto')::int as acertos,
      count(*) filter (where s.score_type = 'erro')::int as erros
    from scored s group by s.user_id
  )
  select
    mem.user_id, mem.display_name, mem.avatar_url,
    coalesce(a.jogos, 0), coalesce(a.pontos, 0), coalesce(a.cravadas, 0),
    coalesce(a.saldos, 0), coalesce(a.acertos, 0), coalesce(a.erros, 0),
    case when coalesce(a.jogos, 0) = 0 then 0
         else round(coalesce(a.pontos, 0)::numeric / (v_p_cravada * a.jogos) * 100, 1) end,
    case when coalesce(a.jogos, 0) = 0 then 0
         else round((a.cravadas + a.saldos + a.acertos)::numeric / a.jogos * 100, 1) end,
    (row_number() over (
      order by coalesce(a.pontos, 0) desc, coalesce(a.cravadas, 0) desc, coalesce(a.saldos, 0) desc,
        (case when coalesce(a.jogos, 0) = 0 then 0 else coalesce(a.pontos, 0)::numeric / (v_p_cravada * a.jogos) end) desc,
        (case when coalesce(a.jogos, 0) = 0 then 0 else (a.cravadas + a.saldos + a.acertos)::numeric / a.jogos end) desc,
        mem.created_at asc))::int as rank
  from members mem
  left join agg a on a.user_id = mem.user_id
  order by rank;
end;
$$;

-- 2) Período da competição [1º jogo … último jogo] em horário de Brasília.
--    Usado na CRIAÇÃO (limites do seletor de data) e pela janela de edição.
--    Ignora jogos ocultos. Sem jogos → (null, null).
create or replace function public.competition_period(p_competition_id uuid)
returns table (data_min date, data_max date)
language sql stable security definer set search_path = '' as $$
  select min((m.kickoff_at at time zone 'America/Sao_Paulo')::date),
         max((m.kickoff_at at time zone 'America/Sao_Paulo')::date)
  from public.matches m
  where m.competition_id = p_competition_id and m.hidden = false;
$$;
revoke all on function public.competition_period(uuid) from public, anon;
grant execute on function public.competition_period(uuid) to authenticated;

-- 3) Janela de edição da data de início do bolão (espelho pro front; quem manda
--    é o trigger). editable = a Copa ainda NÃO terminou. Devolve também a data
--    atual e os limites [data_min, data_max] pra montar o seletor.
create or replace function public.starts_on_window(p_lc_id uuid)
returns table (editable boolean, reason text, starts_on date, data_min date, data_max date)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_league_id uuid; v_competition_id uuid; v_starts_on date;
  v_has boolean; v_all_done boolean; v_ended boolean;
  v_min date; v_max date;
begin
  select lc.league_id, lc.competition_id, lc.starts_on
    into v_league_id, v_competition_id, v_starts_on
  from public.league_competitions lc where lc.id = p_lc_id;
  if v_league_id is null then return; end if;
  if not (public.is_app_admin() or public.is_league_member(v_league_id)) then return; end if;

  select exists (select 1 from public.matches m
                 where m.competition_id = v_competition_id and m.hidden = false),
         not exists (select 1 from public.matches m
                     where m.competition_id = v_competition_id and m.hidden = false
                       and m.status not in ('finished', 'cancelled'))
    into v_has, v_all_done;
  v_ended := v_has and v_all_done;  -- terminou só quando há jogos e todos acabaram

  select p.data_min, p.data_max into v_min, v_max
  from public.competition_period(v_competition_id) p;

  return query select
    (not v_ended),
    case when v_ended then 'A Copa terminou: a data de início está travada.' else null end,
    v_starts_on, v_min, v_max;
end; $$;
revoke all on function public.starts_on_window(uuid) from public, anon;
grant execute on function public.starts_on_window(uuid) to authenticated;

-- 4) Guarda: starts_on só muda enquanto a Copa não acabou e dentro do período.
create or replace function public.guard_starts_on_window()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_has boolean; v_all_done boolean; v_min date; v_max date;
begin
  if new.starts_on is distinct from old.starts_on then
    select exists (select 1 from public.matches m
                   where m.competition_id = new.competition_id and m.hidden = false),
           not exists (select 1 from public.matches m
                       where m.competition_id = new.competition_id and m.hidden = false
                         and m.status not in ('finished', 'cancelled'))
      into v_has, v_all_done;
    if v_has and v_all_done then
      raise exception 'A Copa terminou: a data de início do bolão está travada.'
        using errcode = 'check_violation';
    end if;

    if new.starts_on is not null then
      select p.data_min, p.data_max into v_min, v_max
      from public.competition_period(new.competition_id) p;
      if v_min is not null and (new.starts_on < v_min or new.starts_on > v_max) then
        raise exception 'A data de início precisa estar dentro do período da competição (% a %).', v_min, v_max
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.guard_starts_on_window() from public, anon;

drop trigger if exists trg_lc_starts_on_window on public.league_competitions;
create trigger trg_lc_starts_on_window
  before update of starts_on on public.league_competitions
  for each row execute function public.guard_starts_on_window();
