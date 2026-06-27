-- Dev/local: TODOS os casos do "quem passa" no mata-mata, na competição do grupo do
-- João (copa-do-mundo-2026 — a única que um grupo pode jogar). Cobre: antes do jogo
-- (sem/com palpite), ao vivo (acertando / errando / empate indefinido), encerrado
-- (acerto e erro, por placar e por pênaltis), sempre com palpites da galera variados.
--   docker exec -i supabase_db_resultadismo psql -U postgres -d postgres < scripts/seed-mata-mata-casos.sql

-- helper: cria 1 jogo, grava o palpite do João (se jh/ja não nulos) e os da galera.
create or replace function pg_temp.caso(
  p_comp uuid, p_stage text, p_kick timestamptz, p_status text,
  p_home uuid, p_away uuid, p_hs int, p_as int, p_hpen int, p_apen int,
  p_joao uuid, p_jh int, p_ja int, p_jadv uuid,         -- palpite do João (jadv só no empate)
  p_members uuid[]                                       -- galera (todos menos João já filtrado fora)
) returns void language plpgsql as $fn$
declare
  v_m uuid; v_i int; v_k int; v_hp int; v_ap int; v_choice uuid; v_n int := coalesce(array_length(p_members,1),0);
  v_gh int[] := array[1,0,2,1,0];     -- placar home da galera (cíclico)
  v_ga int[] := array[0,1,2,0,1];     -- placar away da galera
  v_gadv int[] := array[1,2,1,2,1];   -- empate: 1=mandante, 2=visitante (sempre escolhe)
begin
  insert into public.matches(competition_id, stage, kickoff_at, status, home_team_id, away_team_id,
    home_team_name, away_team_name, home_score, away_score, home_pen, away_pen)
  values(p_comp, p_stage, p_kick, p_status::public.match_status, p_home, p_away,
    (select name from public.teams where id=p_home), (select name from public.teams where id=p_away),
    p_hs, p_as, p_hpen, p_apen)
  returning id into v_m;

  -- palpite do João (o "ator" dos casos)
  if p_jh is not null and p_ja is not null then
    insert into public.predictions(user_id, match_id, home_pred, away_pred, advance_team_id)
    values(p_joao, v_m, p_jh, p_ja, case when p_jh = p_ja then p_jadv else null end)
    on conflict (user_id, match_id) do update set home_pred=excluded.home_pred, away_pred=excluded.away_pred, advance_team_id=excluded.advance_team_id;
  end if;

  -- galera: palpites variados (em encerrado/ao vivo dá pra ver o escudo de quem passa)
  if p_status in ('finished','live') then
    for v_i in 1 .. v_n loop
      v_k := ((v_i - 1) % 5) + 1; v_hp := v_gh[v_k]; v_ap := v_ga[v_k];
      v_choice := case when v_hp = v_ap then (case v_gadv[v_k] when 1 then p_home else p_away end) else null end;
      insert into public.predictions(user_id, match_id, home_pred, away_pred, advance_team_id)
      values(p_members[v_i], v_m, v_hp, v_ap, v_choice)
      on conflict (user_id, match_id) do nothing;
    end loop;
  end if;
end $fn$;

do $$
declare
  v_joao uuid; v_comp uuid; v_league uuid; v_members uuid[];
  v_t uuid[]; v_n int; v_d timestamptz := date_trunc('day', now());
begin
  select id into v_joao from public.profiles where is_app_admin order by created_at limit 1;
  select array_agg(id) into v_members from public.profiles where id <> v_joao;   -- galera = todos menos João
  select id into v_comp from public.competitions where slug='copa-do-mundo-2026';

  -- o feed corta jogos com kickoff < created_at da competição; recua p/ os de hoje aparecerem
  update public.competitions set created_at = now() - interval '40 days'
   where id = v_comp and created_at > now() - interval '1 day';

  -- garante seleções suficientes (o seed base tem só 8) — nomes reais p/ ficar bonito
  insert into public.teams(name)
  select n from unnest(array['Holanda','Bélgica','Itália','Uruguai','México','Japão',
                             'Marrocos','Senegal','Estados Unidos','Canadá','Suíça','Colômbia']) as n
  where n not in (select name from public.teams);

  -- pool de times (os 8 com escudo primeiro)
  select array_agg(id) into v_t from (select id from public.teams order by (local_crest is not null) desc, name limit 24) s;
  v_n := coalesce(array_length(v_t,1),0);
  if v_comp is null or v_n < 18 then raise exception 'faltou competição ou times (comp=% times=%)', v_comp, v_n; end if;

  -- zera os jogos da competição (predictions é RESTRICT → apaga antes)
  delete from public.predictions pr using public.matches m
    where pr.match_id = m.id and m.competition_id = v_comp;
  delete from public.matches where competition_id = v_comp;

  -- garante a galera como membro do grupo do João
  select l.id into v_league from public.leagues l
    join public.league_members lm on lm.league_id=l.id
    where lm.user_id=v_joao and lm.status='active' order by lm.joined_at limit 1;
  if v_league is not null then
    insert into public.league_members(league_id, user_id, role, status)
    select v_league, p.id, 'member', 'active' from public.profiles p
    where not exists (select 1 from public.league_members lm where lm.league_id=v_league and lm.user_id=p.id);
  end if;

  -- ============ ANTES DO JOGO (oitavas, agendado, mais tarde hoje) ============
  -- 1) sem palpite do João → ele vê o seletor "Quem passa?" do zero (mandante já marcado)
  perform pg_temp.caso(v_comp,'LAST_16', v_d+interval '21 hours', 'scheduled', v_t[1],v_t[2], null,null,null,null, v_joao, null,null,null, v_members);
  -- 2) com palpite de empate do João (mandante escolhido) → seletor salvo
  perform pg_temp.caso(v_comp,'LAST_16', v_d+interval '22 hours', 'scheduled', v_t[3],v_t[4], null,null,null,null, v_joao, 1,1,v_t[3], v_members);

  -- ============ AO VIVO (oitavas) ============
  -- 3) ACERTANDO: live 1x0, João palpitou vitória do mandante → "passa +2" (verde)
  perform pg_temp.caso(v_comp,'LAST_16', v_d+interval '14 hours', 'live', v_t[5],v_t[6], 1,0,null,null, v_joao, 1,0,null, v_members);
  -- 4) ERRANDO: live 0x1, João palpitou vitória do mandante → "não passa" (mudo)
  perform pg_temp.caso(v_comp,'LAST_16', v_d+interval '15 hours', 'live', v_t[7],v_t[8], 0,1,null,null, v_joao, 2,1,null, v_members);
  -- 5) EMPATE ao vivo (1x1) → ninguém definido ainda (sem pílula de quem passa)
  perform pg_temp.caso(v_comp,'LAST_16', v_d+interval '16 hours', 'live', v_t[9],v_t[10], 1,1,null,null, v_joao, 1,1,v_t[9], v_members);

  -- ============ ENCERRADO ============
  -- 6) ACERTANDO por placar (oitavas): 2x1, João cravou 2x1 → "Passou +2" + cravada
  perform pg_temp.caso(v_comp,'LAST_16', v_d+interval '9 hours', 'finished', v_t[11],v_t[12], 2,1,null,null, v_joao, 2,1,null, v_members);
  -- 7) ERRANDO por placar (oitavas): 0x2, João palpitou 1x0 (mandante) → sem "Passou", erro
  perform pg_temp.caso(v_comp,'LAST_16', v_d+interval '10 hours', 'finished', v_t[13],v_t[14], 0,2,null,null, v_joao, 1,0,null, v_members);
  -- 8) ACERTANDO por PÊNALTIS (quartas +3): 1x1 (pên 5x4 mandante), João empate+mandante → "Passou +3" + (pên.)
  perform pg_temp.caso(v_comp,'QUARTER_FINALS', v_d+interval '11 hours', 'finished', v_t[15],v_t[16], 1,1,5,4, v_joao, 1,1,v_t[15], v_members);
  -- 9) ERRANDO por PÊNALTIS (final +5): 1x1 (pên 3x5 visitante), João empate+mandante → sem "Passou" + (pên.)
  perform pg_temp.caso(v_comp,'FINAL', v_d+interval '12 hours', 'finished', v_t[17],v_t[18], 1,1,3,5, v_joao, 1,1,v_t[17], v_members);

  raise notice 'CASOS mata-mata prontos em copa-do-mundo-2026 (comp=%)', v_comp;
end $$;

-- resumo dos casos pro João conferir
select m.stage, m.status, m.home_team_name||' '||coalesce(m.home_score::text,'-')||'x'||coalesce(m.away_score::text,'-')||' '||m.away_team_name as jogo,
       case when m.home_pen is not null then 'pên '||m.home_pen||'x'||m.away_pen else '' end as penaltis,
       (select home_pred||'x'||away_pred from public.predictions p join public.profiles pr on pr.id=p.user_id where p.match_id=m.id and pr.is_app_admin) as palpite_joao,
       (select count(*) from public.predictions p where p.match_id=m.id) as palpites
from public.matches m join public.competitions c on c.id=m.competition_id
where c.slug='copa-do-mundo-2026' order by m.kickoff_at;
