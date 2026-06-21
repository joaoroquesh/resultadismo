-- Retrô — rodada 21 (pedido do PO: DICAS por partida):
-- Curiosidade histórica curta aparecendo em cada jogo, ANTES do palpite. A coluna
-- retro_matches.fact_pt já existia (provisionada no seed, vazia). Aqui:
-- 1) curadoria: fact_source ('manual'|'ia') + fact_reviewed (só dica REVISADA desce).
-- 2) anti-spoiler: a dica fala do CONTEXTO (sede, público, clima, história), NUNCA do
--    placar/vencedor. retro_fact_is_spoiler() barra padrões de placar (4x1, 4 a 1) e
--    verbos de resultado; é a defesa em profundidade (a curadoria humana é o backstop).
-- 3) entrega: retro_match_payload passa a incluir `fact` SÓ quando fact_reviewed — herda
--    o gate anti-cheat (é a única função que desce dados pro cliente; placar só sai
--    DEPOIS do palpite). fact null → a UI não mostra nada (degradação graciosa).
-- 4) admin: admin_set_match_fact (escreve, valida) + admin_list_match_facts (curadoria,
--    pode ver o placar pra conferir). Modelo híbrido: IA rascunha (reviewed=false) → o
--    João aprova no admin (reviewed=true).

-- ---------- colunas de curadoria ----------
alter table public.retro_matches
  add column if not exists fact_source text check (fact_source in ('manual', 'ia')),
  add column if not exists fact_reviewed boolean not null default false;

-- ---------- guarda anti-spoiler (texto -> é spoiler provável?) ----------
create or replace function public.retro_fact_is_spoiler(p_fact text) returns boolean
language sql immutable as $$
  -- placar (4x1, 4 × 1, 4 a 1, 4-1) ou verbos que entregam o resultado
  select p_fact ~* '[0-9]+\s*([x×]|a|por|-)\s*[0-9]+'
      or p_fact ~* '\m(venceu|venceram|venc(e|i)|goleou|goleada|derrotou|derrota|elimin(ou|ado)|campe[ãa]o|campe[õo]es|conquistou|vice-?campe|levantou a ta[çc]a|perdeu de)\M'
$$;

-- ---------- payload com a dica (só revisada) ----------
create or replace function public.retro_match_payload(p_run public.retro_runs, p_slot int)
returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'slot', p_slot,
    'slot_label', public.retro_slot_label(p_slot),
    'timer_seconds', public.retro_timer_seconds(p_run.pace, p_slot),
    'deadline_at', rm.deadline_at,
    'served_at', rm.served_at,
    'match', jsonb_build_object(
      'wc_year', m.wc_year, 'wc_host', m.wc_host,
      'stage_label_pt', m.stage_label_pt, 'is_knockout', m.is_knockout,
      'difficulty', m.difficulty,
      'fact', case when m.fact_reviewed then m.fact_pt end,  -- só dica revisada desce
      'home_name_pt', m.home_name_pt, 'away_name_pt', m.away_name_pt,
      'home_slug', m.home_slug, 'away_slug', m.away_slug
    ))
  from public.retro_run_matches rm
  join public.retro_matches m on m.id = rm.match_id
  where rm.run_id = p_run.id and rm.slot = p_slot
$$;
revoke execute on function public.retro_match_payload(public.retro_runs, int) from public, anon, authenticated;

-- ---------- admin: gravar/curar uma dica ----------
create or replace function public.admin_set_match_fact(
  p_match_id uuid, p_fact text, p_reviewed boolean default true, p_source text default 'manual'
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_clean text := nullif(btrim(coalesce(p_fact, '')), '');
begin
  if not public.is_app_admin() then raise exception 'Apenas administradores.'; end if;
  if p_source is not null and p_source not in ('manual', 'ia') then raise exception 'fonte inválida'; end if;
  if v_clean is not null then
    if length(v_clean) > 160 then raise exception 'Dica muito longa (máx. 160 caracteres).'; end if;
    -- só barra spoiler quando vai PUBLICAR (reviewed); rascunho de IA pode entrar pra revisão
    if p_reviewed and public.retro_fact_is_spoiler(v_clean) then
      raise exception 'A dica parece entregar o placar/resultado — reescreva sobre o CONTEXTO do jogo (sede, público, história).';
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

-- ---------- admin: listar jogos p/ curadoria (mostra o placar — só admin) ----------
create or replace function public.admin_list_match_facts(
  p_filter text default 'todos', p_search text default null, p_limit int default 60
) returns table (
  id uuid, wc_year int, stage_label_pt text, home_name_pt text, away_name_pt text,
  home_slug text, away_slug text, score text, difficulty int,
  fact_pt text, fact_source text, fact_reviewed boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'Apenas administradores.'; end if;
  return query
  select m.id, m.wc_year, m.stage_label_pt, m.home_name_pt, m.away_name_pt,
         m.home_slug, m.away_slug,
         (m.home_score || '×' || m.away_score
            || case when m.pens_home is not null then ' ('||m.pens_home||'×'||m.pens_away||' pen)' else '' end) as score,
         m.difficulty, m.fact_pt, m.fact_source, m.fact_reviewed
  from public.retro_matches m
  where (p_filter = 'todos'
         or (p_filter = 'sem_dica' and m.fact_pt is null)
         or (p_filter = 'rascunho' and m.fact_pt is not null and not m.fact_reviewed)
         or (p_filter = 'publicada' and m.fact_reviewed))
    and (p_search is null or btrim(p_search) = ''
         or m.home_name_pt ilike '%'||p_search||'%' or m.away_name_pt ilike '%'||p_search||'%'
         or m.wc_year::text = btrim(p_search))
  order by m.wc_year, m.stage_code, m.home_name_pt
  limit least(coalesce(p_limit, 60), 200);
end $$;
revoke execute on function public.admin_list_match_facts(text, text, int) from public, anon;
grant execute on function public.admin_list_match_facts(text, text, int) to authenticated;

-- contadores de cobertura pro painel admin
create or replace function public.admin_fact_coverage() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'Apenas administradores.'; end if;
  return (select jsonb_build_object(
    'total', count(*),
    'publicadas', count(*) filter (where fact_reviewed),
    'rascunhos', count(*) filter (where fact_pt is not null and not fact_reviewed))
    from public.retro_matches);
end $$;
revoke execute on function public.admin_fact_coverage() from public, anon;
grant execute on function public.admin_fact_coverage() to authenticated;

-- ---------- set inicial de dicas (só CONTEXTO, sem placar/vencedor — revisar no admin) ----------
-- Casadas por atributos estáveis (ano + slugs), idempotentes no db reset.
update public.retro_matches set fact_pt =
  'No Maracanã recém-inaugurado, diante de um público estimado em quase 200 mil pessoas — a maior plateia da história das Copas.',
  fact_source = 'manual', fact_reviewed = true
 where wc_year = 1950 and home_slug = 'uruguai' and away_slug = 'brasil';

update public.retro_matches set fact_pt =
  'A primeira final de Copa do Mundo transmitida ao vivo em cores para o mundo todo, no Estádio Azteca.',
  fact_source = 'manual', fact_reviewed = true
 where wc_year = 1970 and home_slug = 'brasil' and away_slug = 'italia';

update public.retro_matches set fact_pt =
  'O primeiro Argentina x Inglaterra após a Guerra das Malvinas, sob o calor de 40 graus da Cidade do México.',
  fact_source = 'manual', fact_reviewed = true
 where wc_year = 1986 and ((home_slug = 'argentina' and away_slug = 'inglaterra') or (home_slug = 'inglaterra' and away_slug = 'argentina'));

update public.retro_matches set fact_pt =
  'No Mineirão, o Brasil entrou em campo sem o lesionado Neymar e sem o capitão suspenso Thiago Silva.',
  fact_source = 'manual', fact_reviewed = true
 where wc_year = 2014 and home_slug = 'brasil' and away_slug = 'alemanha';

update public.retro_matches set fact_pt =
  'A decisão em que um jovem Pelé, de apenas 17 anos, virou o atleta mais novo a atuar numa final de Copa do Mundo.',
  fact_source = 'manual', fact_reviewed = true
 where wc_year = 1958 and home_slug = 'suecia' and away_slug = 'brasil';
