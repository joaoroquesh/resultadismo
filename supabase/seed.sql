-- ============================================================================
-- Resultadismo · seed local (apenas desenvolvimento/testes)
-- ============================================================================

-- Helper para criar usuários de teste com login email/senha
create or replace function public.seed_user(p_email text, p_name text, p_password text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_name),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id,
    jsonb_build_object('sub', v_id::text, 'email', p_email),
    'email', v_id::text, now(), now(), now()
  );

  return v_id;
end;
$$;

do $$
declare
  u_joao uuid;
  u_bruno uuid;
  u_luan uuid;
  c_wc uuid := gen_random_uuid();
  t_bra uuid := gen_random_uuid();
  t_arg uuid := gen_random_uuid();
  t_fra uuid := gen_random_uuid();
  t_ale uuid := gen_random_uuid();
  t_esp uuid := gen_random_uuid();
  t_por uuid := gen_random_uuid();
  t_ing uuid := gen_random_uuid();
  t_cro uuid := gen_random_uuid();
  m_a uuid := gen_random_uuid();   -- finalizado
  m_b uuid := gen_random_uuid();   -- finalizado
  m_c uuid := gen_random_uuid();   -- finalizado
  m_d uuid := gen_random_uuid();   -- futuro
  m_e uuid := gen_random_uuid();   -- futuro
  m_f uuid := gen_random_uuid();   -- futuro
  m_g uuid := gen_random_uuid();   -- ao vivo
  lg uuid := gen_random_uuid();
  lc uuid := gen_random_uuid();
begin
  -- Usuários (o primeiro vira app_admin via trigger handle_new_user)
  u_joao := public.seed_user('joao.crf93@gmail.com', 'João Roque', 'resultadismo123');
  u_bruno := public.seed_user('bruno@teste.com', 'João Bruno', 'resultadismo123');
  u_luan := public.seed_user('luan@teste.com', 'Luan Hatsuo', 'resultadismo123');

  -- Competição: Copa do Mundo 2026
  insert into public.competitions (id, name, slug, short_name, area, type, provider, provider_code, provider_season, season_start, season_end, status, is_featured)
  values (c_wc, 'Copa do Mundo FIFA 2026', 'copa-do-mundo-2026', 'Copa 2026', 'Mundo', 'CUP', 'manual', 'WC', '2026', '2026-06-11', '2026-07-19', 'active', true);

  -- Seleções
  insert into public.teams (id, name, short_name, tla, local_crest, country) values
    (t_bra, 'Brasil', 'Brasil', 'BRA', '/teams/brasil.png', 'Brasil'),
    (t_arg, 'Argentina', 'Argentina', 'ARG', '/teams/argentina.png', 'Argentina'),
    (t_fra, 'França', 'França', 'FRA', '/teams/franca.png', 'França'),
    (t_ale, 'Alemanha', 'Alemanha', 'GER', '/teams/alemanha.png', 'Alemanha'),
    (t_esp, 'Espanha', 'Espanha', 'ESP', '/teams/espanha.png', 'Espanha'),
    (t_por, 'Portugal', 'Portugal', 'POR', '/teams/portugal.png', 'Portugal'),
    (t_ing, 'Inglaterra', 'Inglaterra', 'ENG', '/teams/inglaterra.png', 'Inglaterra'),
    (t_cro, 'Croácia', 'Croácia', 'CRO', '/teams/croacia.png', 'Croácia');

  -- Jogos FINALIZADOS (exercitam a pontuação)
  insert into public.matches (id, competition_id, provider, stage, group_name, round, matchday, home_team_id, away_team_id, home_team_name, away_team_name, kickoff_at, status, home_score, away_score) values
    (m_a, c_wc, 'manual', 'GROUP_STAGE', 'Grupo A', 'Rodada 1', 1, t_bra, t_arg, 'Brasil', 'Argentina', now() - interval '3 days', 'finished', 2, 1),
    (m_b, c_wc, 'manual', 'GROUP_STAGE', 'Grupo B', 'Rodada 1', 1, t_fra, t_ale, 'França', 'Alemanha', now() - interval '3 days', 'finished', 0, 0),
    (m_c, c_wc, 'manual', 'GROUP_STAGE', 'Grupo C', 'Rodada 1', 1, t_esp, t_por, 'Espanha', 'Portugal', now() - interval '2 days', 'finished', 3, 0);

  -- Jogos FUTUROS (palpites abertos)
  insert into public.matches (id, competition_id, provider, stage, group_name, round, matchday, home_team_id, away_team_id, home_team_name, away_team_name, kickoff_at, status) values
    (m_f, c_wc, 'manual', 'GROUP_STAGE', 'Grupo D', 'Rodada 2', 2, t_por, t_ale, 'Portugal', 'Alemanha', now() + interval '1 day', 'scheduled'),
    (m_d, c_wc, 'manual', 'GROUP_STAGE', 'Grupo A', 'Rodada 2', 2, t_bra, t_fra, 'Brasil', 'França', now() + interval '2 days', 'scheduled'),
    (m_e, c_wc, 'manual', 'GROUP_STAGE', 'Grupo B', 'Rodada 2', 2, t_arg, t_esp, 'Argentina', 'Espanha', now() + interval '3 days', 'scheduled');

  -- Jogo AO VIVO
  insert into public.matches (id, competition_id, provider, stage, group_name, round, matchday, home_team_id, away_team_id, home_team_name, away_team_name, kickoff_at, status, home_score, away_score) values
    (m_g, c_wc, 'manual', 'GROUP_STAGE', 'Grupo E', 'Rodada 1', 1, t_ing, t_cro, 'Inglaterra', 'Croácia', now() - interval '40 minutes', 'live', 1, 0);

  -- Liga aprovada e ativa
  insert into public.leagues (id, name, slug, description, owner_id, visibility, join_policy, join_code, status, approved_at, approved_by)
  values (lg, 'Resultadismo Original', 'resultadismo-original', 'A liga clássica entre amigos.', u_joao, 'private', 'invite', 'CRAQUE', 'active', now(), u_joao);

  -- membros adicionais (o dono já entra via trigger)
  insert into public.league_members (league_id, user_id, role, status) values
    (lg, u_bruno, 'member', 'active'),
    (lg, u_luan, 'member', 'active');

  -- liga-competição (modo tabela) para a Copa
  insert into public.league_competitions (id, league_id, competition_id, name, mode)
  values (lc, lg, c_wc, 'Bolão da Copa 2026', 'table');

  -- Palpites nos jogos finalizados (cobrem cravada/saldo/acerto/erro)
  insert into public.predictions (user_id, match_id, home_pred, away_pred) values
    -- João Roque: cravada, saldo, acerto
    (u_joao, m_a, 2, 1),
    (u_joao, m_b, 1, 1),
    (u_joao, m_c, 2, 0),
    -- João Bruno: saldo, cravada, erro
    (u_bruno, m_a, 1, 0),
    (u_bruno, m_b, 0, 0),
    (u_bruno, m_c, 0, 1),
    -- Luan: erro, saldo, acerto
    (u_luan, m_a, 0, 2),
    (u_luan, m_b, 2, 2),
    (u_luan, m_c, 1, 0);
end;
$$;
