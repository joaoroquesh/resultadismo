-- Restaura competições apagadas POR ENGANO no admin em 2026-06-11 (delete é
-- HARD e sem lixeira; o João apagou rascunhos sem saber que sumiriam da
-- personalização). Fonte: admin_audit_log (action 'competition_delete' guarda
-- id + nome) — recriamos cada uma COM O MESMO id, então os "seguindo" dos
-- perfis (followed_competition_ids uuid[] e followed_teams jsonb, ambos sem FK)
-- religam sozinhos, sem tocar em nenhum perfil. Única perda irrecuperável:
-- favorite_competition_id (FK SET NULL no delete).
-- Metadados idênticos ao seed que as criou (20260607000006), com o nome do
-- registro novo como alias do casamento. Idempotente e só-INSERT: pula o que
-- já existir por id, provider_code ou slug.
with registro(name, display_name, slug, code, type, area, name_alias) as (
  values
    ('Copa América','Copa América','copa-america','conmebol.america','CUP','América do Sul','Copa América'),
    ('Eurocopa','Eurocopa','eurocopa','uefa.euro','CUP','Europa','Eurocopa'),
    ('UEFA Nations League','Nations League','nations-league','uefa.nations','CUP','Europa','Nations League'),
    ('Eliminatórias Sul-Americanas','Eliminatórias (Am. do Sul)','eliminatorias-conmebol','fifa.worldq.conmebol','CUP','América do Sul','Eliminatórias (Am. do Sul)'),
    ('Eliminatórias Europeias','Eliminatórias (Europa)','eliminatorias-uefa','fifa.worldq.uefa','CUP','Europa','Eliminatórias (Europa)'),
    ('Eliminatórias Concacaf','Eliminatórias (Concacaf)','eliminatorias-concacaf','fifa.worldq.concacaf','CUP','América do Norte','Eliminatórias (Concacaf)'),
    ('Eliminatórias Asiáticas','Eliminatórias (Ásia)','eliminatorias-afc','fifa.worldq.afc','CUP','Ásia','Eliminatórias (Ásia)'),
    ('Eliminatórias Africanas','Eliminatórias (África)','eliminatorias-caf','fifa.worldq.caf','CUP','África','Eliminatórias (África)'),
    ('Copa Africana de Nações','Copa Africana de Nações','copa-africana-nacoes','caf.nations','CUP','África','Copa Africana de Nações'),
    ('Saudi Pro League','Saudi Pro League','saudi-pro-league','ksa.1','LEAGUE','Arábia Saudita','Saudi Pro League'),
    ('Primeira Liga (Portugal)','Primeira Liga','primeira-liga-pt','por.1','LEAGUE','Portugal','Primeira Liga'),
    ('Eredivisie (Holanda)','Eredivisie','eredivisie','ned.1','LEAGUE','Holanda','Eredivisie'),
    ('Süper Lig (Turquia)','Süper Lig','super-lig-tr','tur.1','LEAGUE','Turquia','Süper Lig'),
    ('Pro League (Bélgica)','Pro League','pro-league-be','bel.1','LEAGUE','Bélgica','Pro League'),
    ('Premiership (Escócia)','Premiership','premiership-sco','sco.1','LEAGUE','Escócia','Premiership'),
    ('Super League (Grécia)','Super League (GR)','super-league-gr','gre.1','LEAGUE','Grécia','Super League (GR)')
),
apagadas as (
  -- última exclusão de cada nome na janela do incidente (2026-06-11, Brasília)
  select distinct on (a.detail->>'name')
         a.entity_id as id, a.detail->>'name' as name
  from public.admin_audit_log a
  where a.action = 'competition_delete'
    and a.created_at >= timestamptz '2026-06-11 00:00:00-03'
  order by a.detail->>'name', a.created_at desc
)
insert into public.competitions
  (id, name, display_name, slug, provider, provider_code, type, area,
   status, is_published, sync_enabled, in_personalization)
select ap.id, r.name, r.display_name, r.slug, 'espn'::public.data_provider, r.code,
       r.type, r.area, 'active', false, true, true
from apagadas ap
join registro r on ap.name in (r.name, r.display_name, r.name_alias)
where not exists (select 1 from public.competitions c where c.id = ap.id)
  and not exists (select 1 from public.competitions c where c.provider_code = r.code)
  and not exists (select 1 from public.competitions c where c.slug = r.slug);
