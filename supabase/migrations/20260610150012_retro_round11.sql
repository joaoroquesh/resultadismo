-- Retrô — rodada 11 (decisões do PO, 10/06):
-- 1) Sem dificuldade no ranking: o Treino deixa de ordenar por nível (acabou a queixa
--    "professor no Difícil na frente de quem foi campeão no Fácil"). Ranking = só
--    fase→pontos→tempo (Copa) / pontos→tempo (Pontos). A UI deixa de oferecer nível.
-- 2) Tempo de tela SÓ do Retrô: retro_touch agrega o tempo de QUALQUER jogador (anon
--    ou logado) numa coluna própria — separado do tempo do app-mãe.
-- 3) Feedback admin: admin_list_feedback passa a devolver `product` (filtrar Retrô).

-- tempo de tela do Retrô (todos os jogadores)
alter table public.retro_usage_daily add column if not exists screen_seconds bigint not null default 0;

create or replace function public.retro_touch(p_seconds int) returns void
language sql security definer set search_path = '' as $$
  insert into public.retro_usage_daily as u (day, screen_seconds)
  values ((now() at time zone 'America/Sao_Paulo')::date, greatest(0, least(coalesce(p_seconds, 0), 60)))
  on conflict (day) do update set screen_seconds = u.screen_seconds + excluded.screen_seconds
$$;
revoke execute on function public.retro_touch(int) from public;
grant execute on function public.retro_touch(int) to anon, authenticated;

-- ranking sem dimensão de dificuldade
create or replace function public.retro_leaderboard(
  p_daily_date date default null, p_format text default 'copa',
  p_limit int default 50, p_board text default 'daily'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_date date := coalesce(p_daily_date, (now() at time zone 'America/Sao_Paulo')::date);
  v_rows jsonb; v_me jsonb; v_pontos boolean := (p_format = 'pontos');
begin
  if p_board = 'treino' then
    with best as (
      select distinct on (r.user_id) r.*
        from public.retro_runs r
       where not r.is_daily and r.pace = 'resultadista' and r.user_id is not null
         and r.status <> 'playing' and r.format = p_format
       order by r.user_id,
                case when v_pontos then 0 else coalesce(r.stage_rank,0) end desc, r.points desc, r.total_ms asc
    ), ranked as (
      select b.*, row_number() over (
               order by case when v_pontos then 0 else coalesce(b.stage_rank,0) end desc,
                        b.points desc, b.total_ms asc) as pos
        from best b
    )
    select jsonb_agg(jsonb_build_object(
             'pos', rk.pos, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
             'stage_reached', rk.stage_reached, 'points', rk.points, 'total_ms', rk.total_ms,
             'is_me', rk.user_id = auth.uid()) order by rk.pos)
      into v_rows from ranked rk join public.profiles p on p.id = rk.user_id
     where p.show_in_global_ranking and rk.pos <= least(coalesce(p_limit, 50), 100);
    return jsonb_build_object('board', 'treino', 'format', p_format,
                              'rows', coalesce(v_rows, '[]'::jsonb), 'me', null);
  end if;

  select jsonb_agg(row_data) into v_rows from (
    select jsonb_build_object(
      'pos', row_number() over (
        order by case when v_pontos then 0 else coalesce(r.stage_rank,0) end desc, r.points desc, r.total_ms asc),
      'display_name', p.display_name, 'avatar_url', p.avatar_url,
      'stage_reached', r.stage_reached, 'points', r.points, 'total_ms', r.total_ms,
      'is_me', r.user_id = auth.uid()) as row_data
    from public.retro_runs r join public.profiles p on p.id = r.user_id
    where r.ranked and r.status <> 'playing' and r.daily_date = v_date and r.format = p_format
      and p.show_in_global_ranking
    order by case when v_pontos then 0 else coalesce(r.stage_rank,0) end desc, r.points desc, r.total_ms asc
    limit least(coalesce(p_limit, 50), 100)
  ) t;

  if auth.uid() is not null then
    select jsonb_build_object('pos', pos, 'stage_reached', stage_reached, 'points', points, 'total_ms', total_ms) into v_me
    from (select r.user_id, r.stage_reached, r.points, r.total_ms,
                 row_number() over (
                   order by case when v_pontos then 0 else coalesce(r.stage_rank,0) end desc, r.points desc, r.total_ms asc) as pos
            from public.retro_runs r
           where r.ranked and r.status <> 'playing' and r.daily_date = v_date and r.format = p_format) t
    where t.user_id = auth.uid();
  end if;
  return jsonb_build_object('board', 'daily', 'format', p_format, 'daily_date', v_date,
                            'rows', coalesce(v_rows, '[]'::jsonb), 'me', v_me);
end $$;
revoke execute on function public.retro_leaderboard(date, text, int, text) from public;
grant execute on function public.retro_leaderboard(date, text, int, text) to anon, authenticated;

-- admin_list_feedback ganha o produto (Retrô vs Clássico)
drop function if exists public.admin_list_feedback();
create or replace function public.admin_list_feedback()
returns table (
  id uuid, kind text, title text, body text, page text, app_version text, user_agent text,
  status text, admin_reply text, created_at timestamptz, resolved_at timestamptz,
  user_id uuid, author_name text, author_email text, product text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'Apenas administradores.'; end if;
  return query
  select f.id, f.kind, f.title, f.body, f.page, f.app_version, f.user_agent,
         f.status, f.admin_reply, f.created_at, f.resolved_at,
         f.user_id, p.display_name, u.email::text, f.product
  from public.feedback f
  left join public.profiles p on p.id = f.user_id
  left join auth.users u on u.id = f.user_id
  order by (f.status = 'novo') desc, f.created_at desc;
end;
$$;
revoke all on function public.admin_list_feedback() from public, anon;
grant execute on function public.admin_list_feedback() to authenticated;
