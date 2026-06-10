-- Retrô — rodada 8 (decisões do PO, 10/06):
-- 1) FINAL deixa de exigir cravada: semi E final = saldo OU cravada (≥2). Antes a
--    final só com cravada (rodada 5) — o PO reverteu.
-- 2) Ranking de Treino passa a considerar a DIFICULDADE: quem jogou mais difícil
--    fica à frente, mesmo com desempenho pior (dificuldade é o 1º critério).
-- 3) Feedback do Retrô: a tabela feedback ganha `product` (classico|retro) e o
--    submit_feedback aceita p_product — mesma infra, separando os dois jogos.

-- 1. barra de avanço: final volta a aceitar saldo (≥2)
create or replace function public.retro_pass_need(p_mode text, p_slot int) returns int
language sql immutable as $$
  select case
    when p_mode = 'cravada' then 2          -- Vale Saldo: ≥2 sempre
    when p_slot >= 6 then 2                  -- Vale Ponto: semi e FINAL = saldo/cravada
    else 1                                   -- Vale Ponto: ≥1 até as quartas
  end
$$;

-- 2. ranking de Treino ordenado por dificuldade primeiro (facil<padrao<dificil)
create or replace function public.retro_leaderboard(
  p_daily_date date default null,
  p_mode text default 'acerto',
  p_limit int default 50,
  p_board text default 'daily'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_date date := coalesce(p_daily_date, (now() at time zone 'America/Sao_Paulo')::date);
  v_rows jsonb; v_me jsonb;
begin
  if p_board = 'treino' then
    -- nível como número p/ ordenar: difícil 3 > padrão 2 > fácil 1
    with scored as (
      select r.*, case r.level when 'dificil' then 3 when 'padrao' then 2 else 1 end as lvl_rank
        from public.retro_runs r
       where not r.is_daily and r.pace = 'resultadista' and r.user_id is not null
         and r.status <> 'playing' and r.mode = p_mode
    ), best as (  -- melhor run de cada um: dificuldade manda, depois fase/pontos/tempo
      select distinct on (user_id) *
        from scored
       order by user_id, lvl_rank desc, stage_rank desc, points desc, total_ms asc
    ), ranked as (
      select b.*, row_number() over (
               order by b.lvl_rank desc, b.stage_rank desc, b.points desc, b.total_ms asc) as pos
        from best b
    )
    select jsonb_agg(jsonb_build_object(
             'pos', rk.pos, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
             'stage_reached', rk.stage_reached, 'points', rk.points, 'total_ms', rk.total_ms,
             'level', rk.level, 'is_me', rk.user_id = auth.uid()) order by rk.pos)
      into v_rows
      from ranked rk join public.profiles p on p.id = rk.user_id
     where p.show_in_global_ranking and rk.pos <= least(coalesce(p_limit, 50), 100);

    if auth.uid() is not null then
      with scored as (
        select r.*, case r.level when 'dificil' then 3 when 'padrao' then 2 else 1 end as lvl_rank
          from public.retro_runs r
         where not r.is_daily and r.pace = 'resultadista' and r.user_id is not null
           and r.status <> 'playing' and r.mode = p_mode
      ), best as (
        select distinct on (user_id) *
          from scored
         order by user_id, lvl_rank desc, stage_rank desc, points desc, total_ms asc
      ), ranked as (
        select b.user_id, b.stage_reached, b.points, b.total_ms, b.level,
               row_number() over (
                 order by b.lvl_rank desc, b.stage_rank desc, b.points desc, b.total_ms asc) as pos
          from best b
      )
      select jsonb_build_object('pos', pos, 'stage_reached', stage_reached,
                                'points', points, 'total_ms', total_ms, 'level', level) into v_me
        from ranked where user_id = auth.uid();
    end if;

    return jsonb_build_object('board', 'treino', 'mode', p_mode,
                              'rows', coalesce(v_rows, '[]'::jsonb), 'me', v_me);
  end if;

  select jsonb_agg(row_data) into v_rows from (
    select jsonb_build_object(
      'pos', row_number() over (order by r.stage_rank desc, r.points desc, r.total_ms asc),
      'display_name', p.display_name, 'avatar_url', p.avatar_url,
      'stage_reached', r.stage_reached, 'points', r.points, 'total_ms', r.total_ms,
      'is_me', r.user_id = auth.uid()) as row_data
    from public.retro_runs r
    join public.profiles p on p.id = r.user_id
    where r.ranked and r.status <> 'playing' and r.daily_date = v_date and r.mode = p_mode
      and p.show_in_global_ranking
    order by r.stage_rank desc, r.points desc, r.total_ms asc
    limit least(coalesce(p_limit, 50), 100)
  ) t;

  if auth.uid() is not null then
    select jsonb_build_object('pos', pos, 'stage_reached', stage_reached,
                              'points', points, 'total_ms', total_ms) into v_me
    from (select r.user_id, r.stage_reached, r.points, r.total_ms,
                 row_number() over (order by r.stage_rank desc, r.points desc, r.total_ms asc) as pos
            from public.retro_runs r
           where r.ranked and r.status <> 'playing' and r.daily_date = v_date and r.mode = p_mode) t
    where t.user_id = auth.uid();
  end if;

  return jsonb_build_object('board', 'daily', 'daily_date', v_date, 'mode', p_mode,
                            'rows', coalesce(v_rows, '[]'::jsonb), 'me', v_me);
end $$;

-- 3. feedback ganha o produto (classico|retro)
alter table public.feedback
  add column if not exists product text not null default 'classico'
    check (product in ('classico', 'retro'));

create or replace function public.submit_feedback(
  p_kind text,
  p_title text,
  p_body text,
  p_page text default null,
  p_app_version text default null,
  p_user_agent text default null,
  p_product text default 'classico'
)
returns public.feedback
language plpgsql security definer set search_path = ''
as $$
declare r public.feedback;
begin
  if auth.uid() is null then
    raise exception 'Você precisa estar logado para enviar feedback.';
  end if;
  if p_kind not in ('bug', 'idea') then raise exception 'Tipo de feedback inválido.'; end if;
  if p_product not in ('classico', 'retro') then raise exception 'Produto inválido.'; end if;
  if btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_body, '')) = '' then
    raise exception 'Preencha o título e a descrição.';
  end if;

  insert into public.feedback (user_id, kind, title, body, page, app_version, user_agent, product)
  values (
    auth.uid(), p_kind, left(btrim(p_title), 120), left(btrim(p_body), 500),
    case when p_kind = 'bug' then nullif(btrim(coalesce(p_page, '')), '') end,
    case when p_kind = 'bug' then nullif(btrim(coalesce(p_app_version, '')), '') end,
    case when p_kind = 'bug' then left(p_user_agent, 400) end,
    p_product
  )
  returning * into r;
  return r;
end;
$$;
revoke all on function public.submit_feedback(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_feedback(text, text, text, text, text, text, text) to authenticated;
