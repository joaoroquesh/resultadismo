-- ============================================================================
-- Resultadismo · Catálogo de competições + personalização robusta
-- ----------------------------------------------------------------------------
-- (1) Troca a whitelist HARDCODED de provider_code em list_personalization_competitions
--     por uma coluna `competitions.in_personalization` — assim adicionar uma
--     competição nova passa a ser só um flag, sem editar função. De quebra,
--     conserta a Copa do Mundo que não aparecia (whitelist esperava 'fifa.world'
--     mas o seed tem code 'WC').
-- (2) Adiciona MAIS competições ao catálogo (estaduais, Champions/Europa/Conference,
--     Copa América, MLS, Liga MX) com provider_code ESPN VERIFICADOS (HTTP 200),
--     pra enriquecer a personalização e o catálogo. Times populam via sync.
--
-- 100% ADITIVO e idempotente: novas linhas só entram se ainda não existirem
-- (anti-join por provider+provider_code); nenhuma competição/jogo é alterado ou
-- removido. is_published=false → admin publica quando o calendário estiver curado.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (1) Coluna de flag da personalização
-- ---------------------------------------------------------------------------
alter table public.competitions
  add column if not exists in_personalization boolean not null default false;

-- Liga o flag pro conjunto curado que JÁ existe (por provider_code).
update public.competitions
  set in_personalization = true
  where provider_code in (
    'bra.1','bra.2','bra.3','bra.copa_do_brazil',
    'conmebol.libertadores','conmebol.sudamericana',
    'eng.1','esp.1','ita.1','ger.1','fra.1'
  );

-- A Copa do Mundo (seedada como manual/code 'WC') também entra na personalização.
update public.competitions
  set in_personalization = true
  where provider_code = 'WC' or upper(coalesce(provider_code,'')) = 'WC';

-- ---------------------------------------------------------------------------
-- (2) Novas competições (ESPN, slugs verificados). Idempotente via anti-join.
-- ---------------------------------------------------------------------------
insert into public.competitions
  (name, display_name, slug, provider, provider_code, type, area, status,
   is_published, sync_enabled, in_personalization)
select v.name, v.display_name, v.slug, 'espn'::data_provider, v.provider_code,
       v.type, v.area, 'active', false, true, v.in_perso
from (values
  -- Estaduais brasileiros
  ('Campeonato Paulista',     'Paulistão',            'campeonato-paulista',  'bra.camp.paulista', 'LEAGUE', 'Brasil',         true),
  ('Campeonato Carioca',      'Carioca',              'campeonato-carioca',   'bra.camp.carioca',  'LEAGUE', 'Brasil',         true),
  ('Campeonato Mineiro',      'Mineiro',              'campeonato-mineiro',   'bra.camp.mineiro',  'LEAGUE', 'Brasil',         true),
  ('Campeonato Gaúcho',       'Gauchão',              'campeonato-gaucho',    'bra.camp.gaucho',   'LEAGUE', 'Brasil',         true),
  -- Continentais / europeias
  ('UEFA Champions League',   'Champions League',     'champions-league',     'uefa.champions',    'CUP',    'Europa',         true),
  ('UEFA Europa League',      'Europa League',        'europa-league',        'uefa.europa',       'CUP',    'Europa',         true),
  ('UEFA Conference League',  'Conference League',    'conference-league',    'uefa.europa.conf',  'CUP',    'Europa',         false),
  ('Copa América',            'Copa América',         'copa-america',         'conmebol.america',  'CUP',    'América do Sul', true),
  ('MLS',                     'MLS',                  'mls',                  'usa.1',             'LEAGUE', 'Estados Unidos', false),
  ('Liga MX',                 'Liga MX',              'liga-mx',              'mex.1',             'LEAGUE', 'México',         false)
) as v(name, display_name, slug, provider_code, type, area, in_perso)
where not exists (
  -- pula se já existe por provider_code OU por slug (slug tem unique global —
  -- sem este OR, um slug pré-existente abortaria a migration no deploy)
  select 1 from public.competitions c
  where (c.provider = 'espn'::data_provider and c.provider_code = v.provider_code)
     or c.slug = v.slug
);

-- ---------------------------------------------------------------------------
-- (3) list_personalization_competitions agora lê o flag (sem whitelist frágil)
-- ---------------------------------------------------------------------------
create or replace function public.list_personalization_competitions()
returns table (id uuid, name text, display_name text, provider_code text, type text, area text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.display_name, c.provider_code, c.type, c.area
  from public.competitions c
  where c.status = 'active'
    and c.in_personalization = true
  order by
    case c.area when 'Brasil' then 0 when 'América do Sul' then 1 when 'Mundo' then 2 else 3 end,
    c.name;
$$;
