-- ============================================================================
-- Resultadismo · Personalização — mais campeonatos (seleções + alternativos)
-- ----------------------------------------------------------------------------
-- Amplia o catálogo de personalização (flag in_personalization, da v2.12.0).
-- Provider_codes ESPN VERIFICADOS (HTTP 200) em 2026-06-07.
--   • Seleções: Eurocopa, Nations League, Eliminatórias (5 confederações),
--     Copa Africana de Nações. (Copa América já existe; reclassificada no front.)
--   • Alternativos: Saudi, Portugal, Holanda, Turquia, Bélgica, Escócia, Grécia.
--     MLS / Liga MX / Conference já existiam → só ligamos o flag.
-- Estaduais além dos 4 grandes NÃO entram (ESPN devolve 400 — sem fonte).
-- 100% aditivo e idempotente (anti-join por provider_code OU slug).
-- ============================================================================

insert into public.competitions
  (name, display_name, slug, provider, provider_code, type, area,
   status, is_published, sync_enabled, in_personalization)
select v.name, v.display_name, v.slug, 'espn'::public.data_provider, v.provider_code,
       v.type, v.area, 'active', false, true, true
from (values
  -- Seleções
  ('Eurocopa',                  'Eurocopa',                'eurocopa',              'uefa.euro',            'CUP', 'Europa'),
  ('UEFA Nations League',       'Nations League',          'nations-league',        'uefa.nations',         'CUP', 'Europa'),
  ('Eliminatórias Sul-Americanas','Eliminatórias (Am. do Sul)','eliminatorias-conmebol','fifa.worldq.conmebol','CUP','América do Sul'),
  ('Eliminatórias Europeias',   'Eliminatórias (Europa)',  'eliminatorias-uefa',    'fifa.worldq.uefa',     'CUP', 'Europa'),
  ('Eliminatórias Concacaf',    'Eliminatórias (Concacaf)','eliminatorias-concacaf','fifa.worldq.concacaf', 'CUP', 'América do Norte'),
  ('Eliminatórias Asiáticas',   'Eliminatórias (Ásia)',    'eliminatorias-afc',     'fifa.worldq.afc',      'CUP', 'Ásia'),
  ('Eliminatórias Africanas',   'Eliminatórias (África)',  'eliminatorias-caf',     'fifa.worldq.caf',      'CUP', 'África'),
  ('Copa Africana de Nações',   'Copa Africana de Nações', 'copa-africana-nacoes',  'caf.nations',          'CUP', 'África'),
  -- Alternativos
  ('Saudi Pro League',          'Saudi Pro League',        'saudi-pro-league',      'ksa.1',                'LEAGUE', 'Arábia Saudita'),
  ('Primeira Liga (Portugal)',  'Primeira Liga',           'primeira-liga-pt',      'por.1',                'LEAGUE', 'Portugal'),
  ('Eredivisie (Holanda)',      'Eredivisie',              'eredivisie',            'ned.1',                'LEAGUE', 'Holanda'),
  ('Süper Lig (Turquia)',       'Süper Lig',               'super-lig-tr',          'tur.1',                'LEAGUE', 'Turquia'),
  ('Pro League (Bélgica)',      'Pro League',              'pro-league-be',         'bel.1',                'LEAGUE', 'Bélgica'),
  ('Premiership (Escócia)',     'Premiership',             'premiership-sco',       'sco.1',                'LEAGUE', 'Escócia'),
  ('Super League (Grécia)',     'Super League (GR)',       'super-league-gr',       'gre.1',                'LEAGUE', 'Grécia')
) as v(name, display_name, slug, provider_code, type, area)
where not exists (
  select 1 from public.competitions c
  where (c.provider = 'espn'::public.data_provider and c.provider_code = v.provider_code)
     or c.slug = v.slug
);

-- Liga existentes que viram "alternativos" / copa europeia → ligar o flag.
update public.competitions
   set in_personalization = true
 where provider_code in ('usa.1', 'mex.1', 'uefa.europa.conf')
   and in_personalization = false;
