-- ============================================================================
-- Resultadismo · seed local (apenas desenvolvimento/testes)
-- ============================================================================

-- Rede de segurança LOCAL: garante que os papéis anon/authenticated consigam ler/
-- escrever (a RLS continua sendo o portão real). Em alguns resets o stack local
-- nasce sem os GRANTs padrão do Supabase e o app não enxerga NENHUMA tabela (403).
-- Idempotente; no Supabase cloud isto já existe, então é no-op. NÃO roda em prod
-- (seed só executa em `supabase db reset` local).
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

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
  u_novato uuid;  -- 1º acesso (sem federação)
  u_dona uuid;    -- dona de federação (não app-admin)
  -- galera extra (deixa a lista de "palpites da galera" cheia, com dobros variados)
  u_gab uuid;
  u_thi uuid;
  u_cad uuid;
  u_rafa uuid;
  u_wel uuid;
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
  -- mata-mata (testa "quem passa", pênaltis, bônus por fase, override admin)
  mk_s1 uuid := gen_random_uuid();  -- oitavas agendado (seletor quem passa + joker)
  mk_s2 uuid := gen_random_uuid();  -- oitavas agendado (João sem palpite → pendente)
  mk_lv uuid := gen_random_uuid();  -- oitavas ao vivo, fase 2º tempo
  mk_lvp uuid := gen_random_uuid(); -- quartas ao vivo nos pênaltis
  mk_fp uuid := gen_random_uuid();  -- quartas encerrado nos pênaltis (1-1, pên 4-2)
  mk_fw uuid := gen_random_uuid();  -- semifinal encerrada por vitória (2-0)
  lg uuid := gen_random_uuid();
  lc uuid := gen_random_uuid();
  lg2 uuid := gen_random_uuid();  -- federação da dona
  lc2 uuid := gen_random_uuid();
begin
  -- Usuários (o primeiro vira app_admin via trigger handle_new_user)
  u_joao := public.seed_user('joao.crf93@gmail.com', 'João Roque', 'resultadismo123');
  u_bruno := public.seed_user('bruno@teste.com', 'João Bruno', 'resultadismo123');
  u_luan := public.seed_user('luan@teste.com', 'Luan Hatsuo', 'resultadismo123');
  u_novato := public.seed_user('novato@teste.com', 'Novato da Silva', 'resultadismo123');
  u_dona := public.seed_user('dona@teste.com', 'Dona Federação', 'resultadismo123');
  u_gab := public.seed_user('gabriel@teste.com', 'Gabriel Teixeira', 'resultadismo123');
  u_thi := public.seed_user('thiago@teste.com', 'Thiago Carvalho', 'resultadismo123');
  u_cad := public.seed_user('cadu@teste.com', 'Cadu Barros', 'resultadismo123');
  u_rafa := public.seed_user('rafael@teste.com', 'Rafael Miranda', 'resultadismo123');
  u_wel := public.seed_user('wellington@teste.com', 'Wellington Dias', 'resultadismo123');

  -- Competição: Copa do Mundo 2026
  -- created_at no passado: o feed (useAllMatches) só mostra jogo com kickoff >= created_at
  -- da competição; sem isso, os jogos finalizados/ao vivo do seed somem da tela.
  insert into public.competitions (id, name, slug, short_name, area, type, provider, provider_code, provider_season, season_start, season_end, status, is_featured, in_personalization, is_published, group_eligible, created_at)
  values (c_wc, 'Copa do Mundo FIFA 2026', 'copa-do-mundo-2026', 'Copa 2026', 'Mundo', 'CUP', 'manual', 'WC', '2026', '2026-06-11', '2026-07-19', 'active', true, true, true, true, now() - interval '30 days');

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
    (lg, u_luan, 'member', 'active'),
    (lg, u_gab, 'member', 'active'),
    (lg, u_thi, 'member', 'active'),
    (lg, u_cad, 'member', 'active'),
    (lg, u_rafa, 'member', 'active'),
    (lg, u_wel, 'member', 'active');

  -- liga-competição (modo tabela) para a Copa
  insert into public.league_competitions (id, league_id, competition_id, name, mode)
  values (lc, lg, c_wc, 'Bolão da Copa 2026', 'table');

  -- Federação 2: a DONA é dona (não app-admin) — exercita o perfil "Dono" do DevPanel.
  insert into public.leagues (id, name, slug, description, owner_id, visibility, join_policy, join_code, status, approved_at, approved_by)
  values (lg2, 'Galera do Trampo', 'galera-do-trampo', 'Federação criada pela dona (não-admin).', u_dona, 'private', 'invite', 'TRAMPO', 'active', now(), u_joao);
  insert into public.league_members (league_id, user_id, role, status) values (lg2, u_bruno, 'member', 'active');
  insert into public.league_competitions (id, league_id, competition_id, name, mode)
  values (lc2, lg2, c_wc, 'Bolão do Trampo', 'table');
  -- (novato@teste.com fica SEM federação de propósito → testa o 1º acesso/onboarding)

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

  -- João usou o Joker (2x) na cravada de Brasil x Argentina → +6 em vez de +3
  update public.predictions set is_joker = true where user_id = u_joao and match_id = m_a;

  -- ===== MATA-MATA: cobre "quem passa", pênaltis, bônus por fase e override admin =====
  -- (is_knockout é derivado da stage pelo trigger matches_set_knockout)
  -- Oitavas AGENDADAS (palpite aberto): seletor "Quem passa de fase?" + topo do card
  insert into public.matches (id, competition_id, provider, stage, round, matchday, home_team_id, away_team_id, home_team_name, away_team_name, kickoff_at, status) values
    (mk_s1, c_wc, 'manual', 'LAST_16', 'Oitavas', 10, t_fra, t_cro, 'França', 'Croácia', now() + interval '1 day', 'scheduled'),
    (mk_s2, c_wc, 'manual', 'LAST_16', 'Oitavas', 10, t_esp, t_ing, 'Espanha', 'Inglaterra', now() + interval '1 day' + interval '4 hours', 'scheduled');
  -- Oitavas AO VIVO com fase (live_phase='2t'): rótulo "2º tempo" + bônus provisório
  insert into public.matches (id, competition_id, provider, stage, round, matchday, home_team_id, away_team_id, home_team_name, away_team_name, kickoff_at, status, home_score, away_score, live_phase) values
    (mk_lv, c_wc, 'manual', 'LAST_16', 'Oitavas', 10, t_por, t_ale, 'Portugal', 'Alemanha', now() - interval '65 minutes', 'live', 1, 1, '2t');
  -- Quartas AO VIVO nos PÊNALTIS (live_phase='penaltis' + placar de pênaltis ao vivo)
  insert into public.matches (id, competition_id, provider, stage, round, matchday, home_team_id, away_team_id, home_team_name, away_team_name, kickoff_at, status, home_score, away_score, home_pen, away_pen, live_phase) values
    (mk_lvp, c_wc, 'manual', 'QUARTER_FINALS', 'Quartas', 20, t_bra, t_arg, 'Brasil', 'Argentina', now() - interval '125 minutes', 'live', 2, 2, 3, 1, 'penaltis');
  -- Quartas ENCERRADA nos PÊNALTIS (1-1, pên 4-2 → mandante passa)
  insert into public.matches (id, competition_id, provider, stage, round, matchday, home_team_id, away_team_id, home_team_name, away_team_name, kickoff_at, status, home_score, away_score, home_pen, away_pen) values
    (mk_fp, c_wc, 'manual', 'QUARTER_FINALS', 'Quartas', 20, t_ing, t_cro, 'Inglaterra', 'Croácia', now() - interval '1 day', 'finished', 1, 1, 4, 2);
  -- Semifinal ENCERRADA por vitória (2-0): bônus pelo vencedor
  insert into public.matches (id, competition_id, provider, stage, round, matchday, home_team_id, away_team_id, home_team_name, away_team_name, kickoff_at, status, home_score, away_score) values
    (mk_fw, c_wc, 'manual', 'SEMI_FINALS', 'Semifinal', 30, t_fra, t_esp, 'França', 'Espanha', now() - interval '2 days', 'finished', 2, 0);

  -- Palpites mata-mata (empate → advance_team_id; o trigger normaliza/pontua)
  insert into public.predictions (user_id, match_id, home_pred, away_pred, advance_team_id) values
    -- Agendado mk_s1: João empata e escolhe França; Bruno crava França; Luan empata Croácia
    (u_joao, mk_s1, 2, 2, t_fra), (u_bruno, mk_s1, 1, 0, null), (u_luan, mk_s1, 2, 2, t_cro),
    -- mk_s2 sem palpite do João (estado pendente); Bruno e Luan palpitam
    (u_bruno, mk_s2, 1, 1, t_esp), (u_luan, mk_s2, 0, 1, null),
    -- Ao vivo mk_lv (1-1): João 2-1, Bruno empate POR, Luan empate ALE
    (u_joao, mk_lv, 2, 1, null), (u_bruno, mk_lv, 1, 1, t_por), (u_luan, mk_lv, 1, 1, t_ale),
    -- Ao vivo pênaltis mk_lvp (2-2, pên 3-1 → BRA): João empate BRA, Bruno empate ARG, Luan 2-1
    (u_joao, mk_lvp, 2, 2, t_bra), (u_bruno, mk_lvp, 2, 2, t_arg), (u_luan, mk_lvp, 2, 1, null),
    -- Encerrado pênaltis mk_fp (1-1 pên 4-2 → ING): João crava 1-1+ING (cravada+bônus),
    -- Bruno 2-1 (erro, mas acerta ING → bônus), Luan empate CRO (saldo, sem bônus)
    (u_joao, mk_fp, 1, 1, t_ing), (u_bruno, mk_fp, 2, 1, null), (u_luan, mk_fp, 1, 1, t_cro),
    -- Encerrado vitória mk_fw (2-0 FRA): João crava 2-0 (cravada+bônus), Bruno 1-0 (saldo+bônus),
    -- Luan 0-1 (erro, sem bônus)
    (u_joao, mk_fw, 2, 0, null), (u_bruno, mk_fw, 1, 0, null), (u_luan, mk_fw, 0, 1, null);

  -- Jokers no mata-mata (≤2/usuário/semana): testa borda primary (agendado) + raio na
  -- coluna direita da galera + "não dobra" (placar dobra, bônus soma por cima)
  update public.predictions set is_joker = true where user_id = u_joao and match_id = mk_s1;  -- agendado: borda primary
  update public.predictions set is_joker = true where user_id = u_bruno and match_id = mk_fw; -- saldo dobrado + bônus
  update public.predictions set is_joker = true where user_id = u_bruno and match_id = mk_lv; -- ao vivo dobrado
  update public.predictions set is_joker = true where user_id = u_luan and match_id = mk_fp;  -- saldo dobrado (pênaltis)

  -- ===== Galera estendida: lista cheia de "palpites da galera" em todos os cards =====
  insert into public.predictions (user_id, match_id, home_pred, away_pred, advance_team_id) values
    -- FINALIZADOS de grupo (m_a BRA 2-1 · m_c ESP 3-0) — variando cravada/saldo/acerto/erro
    (u_gab, m_a, 2, 1, null), (u_thi, m_a, 1, 0, null), (u_cad, m_a, 0, 2, null), (u_rafa, m_a, 3, 1, null), (u_wel, m_a, 2, 0, null),
    (u_gab, m_c, 3, 0, null), (u_thi, m_c, 2, 0, null), (u_cad, m_c, 1, 1, null), (u_rafa, m_c, 2, 1, null), (u_wel, m_c, 3, 0, null),
    -- AO VIVO de grupo (m_g ING 1-0)
    (u_gab, m_g, 1, 0, null), (u_thi, m_g, 2, 1, null), (u_cad, m_g, 0, 0, null), (u_rafa, m_g, 1, 1, null), (u_wel, m_g, 2, 0, null),
    -- UPCOMING (m_f POR×ALE) — popula "quem já palpitou"
    (u_gab, m_f, 2, 1, null), (u_thi, m_f, 1, 1, null), (u_cad, m_f, 0, 2, null), (u_rafa, m_f, 1, 0, null), (u_wel, m_f, 2, 2, null),
    -- KNOCKOUT AO VIVO (mk_lv POR×ALE 1-1, mk_lvp BRA×ARG 2-2 pên 3-1→BRA)
    (u_gab, mk_lv, 1, 1, t_por), (u_thi, mk_lv, 2, 1, null), (u_cad, mk_lv, 1, 1, t_ale), (u_rafa, mk_lv, 0, 1, null), (u_wel, mk_lv, 1, 1, t_por),
    (u_gab, mk_lvp, 2, 2, t_bra), (u_thi, mk_lvp, 1, 0, null), (u_cad, mk_lvp, 2, 2, t_arg), (u_rafa, mk_lvp, 3, 2, null), (u_wel, mk_lvp, 2, 2, t_bra),
    -- KNOCKOUT ENCERRADO (mk_fp ING×CRO 1-1 pên 4-2→ING, mk_fw FRA×ESP 2-0)
    (u_gab, mk_fp, 1, 1, t_ing), (u_thi, mk_fp, 2, 1, null), (u_cad, mk_fp, 1, 1, t_cro), (u_rafa, mk_fp, 0, 0, t_ing), (u_wel, mk_fp, 1, 1, t_ing),
    (u_gab, mk_fw, 2, 0, null), (u_thi, mk_fw, 1, 0, null), (u_cad, mk_fw, 0, 1, null), (u_rafa, mk_fw, 2, 1, null), (u_wel, mk_fw, 3, 0, null),
    -- KNOCKOUT AGENDADO (mk_s1 FRA×CRO, mk_s2 ESP×ING) — seletor "quem passa"
    (u_gab, mk_s1, 1, 1, t_fra), (u_thi, mk_s1, 2, 0, null), (u_cad, mk_s1, 1, 1, t_cro), (u_rafa, mk_s1, 0, 1, null), (u_wel, mk_s1, 2, 1, null),
    (u_gab, mk_s2, 1, 0, null), (u_thi, mk_s2, 1, 1, t_esp), (u_cad, mk_s2, 2, 1, null), (u_rafa, mk_s2, 1, 1, t_ing), (u_wel, mk_s2, 0, 0, t_esp);

  -- Dobros da galera (≤2/usuário/semana): vários cards com gente dobrando
  update public.predictions set is_joker = true where user_id = u_gab  and match_id in (mk_fw, mk_lv);
  update public.predictions set is_joker = true where user_id = u_thi  and match_id in (mk_fp, m_a);
  update public.predictions set is_joker = true where user_id = u_cad  and match_id in (mk_lvp, m_c);
  update public.predictions set is_joker = true where user_id = u_rafa and match_id in (mk_fw, m_g);
  update public.predictions set is_joker = true where user_id = u_wel  and match_id in (mk_fp, mk_lvp);
end;
$$;
