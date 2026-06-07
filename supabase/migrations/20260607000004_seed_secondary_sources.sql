-- ============================================================================
-- Resultadismo · Fontes SECUNDÁRIAS para as competições principais
-- ----------------------------------------------------------------------------
-- Liga uma 2ª fonte (football-data.org, free) às competições onde ela tem
-- cobertura, para habilitar a CONFIRMAÇÃO POR >=2 FONTES (freeze/decisão #3) e o
-- voto de placar (golden). Para a Copa do Mundo (primary football_data em prod),
-- a 2ª fonte é a ESPN (fifa.world).
--
-- Aditivo/idempotente (on conflict do nothing). As secundárias só VALIDAM placar
-- de jogos existentes (casados por dia+nomes); nunca inserem. Precisa do
-- FOOTBALL_DATA_TOKEN no ambiente da função (já configurado em prod) — sem ele,
-- a secundária falha graciosamente e a primária segue normal.
-- ============================================================================
insert into public.competition_sources
  (competition_id, provider, provider_code, role, priority, enabled)
select c.id, v.sec_provider::public.data_provider, v.sec_code, 'secondary', 50, true
from (values
  ('bra.1',          'football_data', 'BSA'),  -- Brasileirão Série A
  ('eng.1',          'football_data', 'PL'),   -- Premier League
  ('esp.1',          'football_data', 'PD'),   -- La Liga
  ('ita.1',          'football_data', 'SA'),   -- Serie A (Itália)
  ('ger.1',          'football_data', 'BL1'),  -- Bundesliga
  ('fra.1',          'football_data', 'FL1'),  -- Ligue 1
  ('uefa.champions', 'football_data', 'CL'),   -- Champions League
  ('WC',             'espn',          'fifa.world') -- Copa do Mundo (primary é football_data)
) as v(comp_code, sec_provider, sec_code)
join public.competitions c on c.provider_code = v.comp_code
on conflict (competition_id, provider) do nothing;
