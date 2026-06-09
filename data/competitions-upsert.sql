-- GERADO por scripts/gen-competitions.mjs a partir de data/competitions-registry.json.
-- Ao editar o registro, cole este conteúdo numa MIGRATION nova (idempotente:
-- atualiza as existentes por provider_code e insere só as que faltam).
update public.competitions set display_name = 'Copa do Mundo FIFA 2026', type = 'CUP', area = 'Mundo', in_personalization = true where provider_code = 'WC';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Copa do Mundo FIFA 2026', 'Copa do Mundo FIFA 2026', 'copa-do-mundo-fifa-2026', 'WC', 'CUP', 'Mundo', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'WC');
update public.competitions set display_name = 'Amistosos', type = 'CUP', area = 'Mundo', in_personalization = true where provider_code = 'fifa.friendly';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Amistosos', 'Amistosos', 'amistosos', 'fifa.friendly', 'CUP', 'Mundo', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'fifa.friendly');
update public.competitions set display_name = 'Copa América', type = 'CUP', area = 'América do Sul', in_personalization = true where provider_code = 'conmebol.america';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Copa América', 'Copa América', 'copa-america', 'conmebol.america', 'CUP', 'América do Sul', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'conmebol.america');
update public.competitions set display_name = 'Eurocopa', type = 'CUP', area = 'Europa', in_personalization = true where provider_code = 'uefa.euro';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Eurocopa', 'Eurocopa', 'eurocopa', 'uefa.euro', 'CUP', 'Europa', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'uefa.euro');
update public.competitions set display_name = 'Nations League', type = 'CUP', area = 'Europa', in_personalization = true where provider_code = 'uefa.nations';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Nations League', 'Nations League', 'nations-league', 'uefa.nations', 'CUP', 'Europa', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'uefa.nations');
update public.competitions set display_name = 'Eliminatórias (Am. do Sul)', type = 'CUP', area = 'América do Sul', in_personalization = true where provider_code = 'fifa.worldq.conmebol';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Eliminatórias (Am. do Sul)', 'Eliminatórias (Am. do Sul)', 'eliminatorias-am-do-sul', 'fifa.worldq.conmebol', 'CUP', 'América do Sul', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'fifa.worldq.conmebol');
update public.competitions set display_name = 'Eliminatórias (Europa)', type = 'CUP', area = 'Europa', in_personalization = true where provider_code = 'fifa.worldq.uefa';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Eliminatórias (Europa)', 'Eliminatórias (Europa)', 'eliminatorias-europa', 'fifa.worldq.uefa', 'CUP', 'Europa', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'fifa.worldq.uefa');
update public.competitions set display_name = 'Eliminatórias (Concacaf)', type = 'CUP', area = 'América do Norte', in_personalization = true where provider_code = 'fifa.worldq.concacaf';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Eliminatórias (Concacaf)', 'Eliminatórias (Concacaf)', 'eliminatorias-concacaf', 'fifa.worldq.concacaf', 'CUP', 'América do Norte', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'fifa.worldq.concacaf');
update public.competitions set display_name = 'Eliminatórias (Ásia)', type = 'CUP', area = 'Ásia', in_personalization = true where provider_code = 'fifa.worldq.afc';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Eliminatórias (Ásia)', 'Eliminatórias (Ásia)', 'eliminatorias-asia', 'fifa.worldq.afc', 'CUP', 'Ásia', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'fifa.worldq.afc');
update public.competitions set display_name = 'Eliminatórias (África)', type = 'CUP', area = 'África', in_personalization = true where provider_code = 'fifa.worldq.caf';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Eliminatórias (África)', 'Eliminatórias (África)', 'eliminatorias-africa', 'fifa.worldq.caf', 'CUP', 'África', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'fifa.worldq.caf');
update public.competitions set display_name = 'Copa Africana de Nações', type = 'CUP', area = 'África', in_personalization = true where provider_code = 'caf.nations';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Copa Africana de Nações', 'Copa Africana de Nações', 'copa-africana-de-nacoes', 'caf.nations', 'CUP', 'África', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'caf.nations');
update public.competitions set display_name = 'Brasileirão Série A', type = 'LEAGUE', area = 'Brasil', in_personalization = true where provider_code = 'bra.1';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Brasileirão Série A', 'Brasileirão Série A', 'brasileirao-serie-a', 'bra.1', 'LEAGUE', 'Brasil', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'bra.1');
update public.competitions set display_name = 'Brasileirão Série B', type = 'LEAGUE', area = 'Brasil', in_personalization = true where provider_code = 'bra.2';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Brasileirão Série B', 'Brasileirão Série B', 'brasileirao-serie-b', 'bra.2', 'LEAGUE', 'Brasil', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'bra.2');
update public.competitions set display_name = 'Brasileirão Série C', type = 'LEAGUE', area = 'Brasil', in_personalization = true where provider_code = 'bra.3';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Brasileirão Série C', 'Brasileirão Série C', 'brasileirao-serie-c', 'bra.3', 'LEAGUE', 'Brasil', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'bra.3');
update public.competitions set display_name = 'Paulistão', type = 'LEAGUE', area = 'Brasil', in_personalization = true where provider_code = 'bra.camp.paulista';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Paulistão', 'Paulistão', 'paulistao', 'bra.camp.paulista', 'LEAGUE', 'Brasil', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'bra.camp.paulista');
update public.competitions set display_name = 'Carioca', type = 'LEAGUE', area = 'Brasil', in_personalization = true where provider_code = 'bra.camp.carioca';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Carioca', 'Carioca', 'carioca', 'bra.camp.carioca', 'LEAGUE', 'Brasil', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'bra.camp.carioca');
update public.competitions set display_name = 'Mineiro', type = 'LEAGUE', area = 'Brasil', in_personalization = true where provider_code = 'bra.camp.mineiro';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Mineiro', 'Mineiro', 'mineiro', 'bra.camp.mineiro', 'LEAGUE', 'Brasil', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'bra.camp.mineiro');
update public.competitions set display_name = 'Gauchão', type = 'LEAGUE', area = 'Brasil', in_personalization = true where provider_code = 'bra.camp.gaucho';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Gauchão', 'Gauchão', 'gauchao', 'bra.camp.gaucho', 'LEAGUE', 'Brasil', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'bra.camp.gaucho');
update public.competitions set display_name = 'Premier League', type = 'LEAGUE', area = 'Inglaterra', in_personalization = true where provider_code = 'eng.1';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Premier League', 'Premier League', 'premier-league', 'eng.1', 'LEAGUE', 'Inglaterra', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'eng.1');
update public.competitions set display_name = 'La Liga', type = 'LEAGUE', area = 'Espanha', in_personalization = true where provider_code = 'esp.1';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'La Liga', 'La Liga', 'la-liga', 'esp.1', 'LEAGUE', 'Espanha', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'esp.1');
update public.competitions set display_name = 'Serie A (Itália)', type = 'LEAGUE', area = 'Itália', in_personalization = true where provider_code = 'ita.1';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Serie A (Itália)', 'Serie A (Itália)', 'serie-a-italia', 'ita.1', 'LEAGUE', 'Itália', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'ita.1');
update public.competitions set display_name = 'Bundesliga', type = 'LEAGUE', area = 'Alemanha', in_personalization = true where provider_code = 'ger.1';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Bundesliga', 'Bundesliga', 'bundesliga', 'ger.1', 'LEAGUE', 'Alemanha', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'ger.1');
update public.competitions set display_name = 'Ligue 1', type = 'LEAGUE', area = 'França', in_personalization = true where provider_code = 'fra.1';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Ligue 1', 'Ligue 1', 'ligue-1', 'fra.1', 'LEAGUE', 'França', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'fra.1');
update public.competitions set display_name = 'Copa do Brasil', type = 'CUP', area = 'Brasil', in_personalization = true where provider_code = 'bra.copa_do_brazil';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Copa do Brasil', 'Copa do Brasil', 'copa-do-brasil', 'bra.copa_do_brazil', 'CUP', 'Brasil', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'bra.copa_do_brazil');
update public.competitions set display_name = 'Libertadores', type = 'CUP', area = 'América do Sul', in_personalization = true where provider_code = 'conmebol.libertadores';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Libertadores', 'Libertadores', 'libertadores', 'conmebol.libertadores', 'CUP', 'América do Sul', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'conmebol.libertadores');
update public.competitions set display_name = 'Sul-Americana', type = 'CUP', area = 'América do Sul', in_personalization = true where provider_code = 'conmebol.sudamericana';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Sul-Americana', 'Sul-Americana', 'sul-americana', 'conmebol.sudamericana', 'CUP', 'América do Sul', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'conmebol.sudamericana');
update public.competitions set display_name = 'Champions League', type = 'CUP', area = 'Europa', in_personalization = true where provider_code = 'uefa.champions';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Champions League', 'Champions League', 'champions-league', 'uefa.champions', 'CUP', 'Europa', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'uefa.champions');
update public.competitions set display_name = 'Europa League', type = 'CUP', area = 'Europa', in_personalization = true where provider_code = 'uefa.europa';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Europa League', 'Europa League', 'europa-league', 'uefa.europa', 'CUP', 'Europa', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'uefa.europa');
update public.competitions set display_name = 'Conference League', type = 'CUP', area = 'Europa', in_personalization = true where provider_code = 'uefa.europa.conf';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Conference League', 'Conference League', 'conference-league', 'uefa.europa.conf', 'CUP', 'Europa', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'uefa.europa.conf');
update public.competitions set display_name = 'MLS', type = 'LEAGUE', area = 'Estados Unidos', in_personalization = true where provider_code = 'usa.1';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'MLS', 'MLS', 'mls', 'usa.1', 'LEAGUE', 'Estados Unidos', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'usa.1');
update public.competitions set display_name = 'Liga MX', type = 'LEAGUE', area = 'México', in_personalization = true where provider_code = 'mex.1';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Liga MX', 'Liga MX', 'liga-mx', 'mex.1', 'LEAGUE', 'México', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'mex.1');
update public.competitions set display_name = 'Saudi Pro League', type = 'LEAGUE', area = 'Arábia Saudita', in_personalization = true where provider_code = 'ksa.1';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Saudi Pro League', 'Saudi Pro League', 'saudi-pro-league', 'ksa.1', 'LEAGUE', 'Arábia Saudita', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'ksa.1');
update public.competitions set display_name = 'Primeira Liga', type = 'LEAGUE', area = 'Portugal', in_personalization = true where provider_code = 'por.1';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Primeira Liga', 'Primeira Liga', 'primeira-liga', 'por.1', 'LEAGUE', 'Portugal', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'por.1');
update public.competitions set display_name = 'Eredivisie', type = 'LEAGUE', area = 'Holanda', in_personalization = true where provider_code = 'ned.1';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Eredivisie', 'Eredivisie', 'eredivisie', 'ned.1', 'LEAGUE', 'Holanda', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'ned.1');
update public.competitions set display_name = 'Süper Lig', type = 'LEAGUE', area = 'Turquia', in_personalization = true where provider_code = 'tur.1';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Süper Lig', 'Süper Lig', 'super-lig', 'tur.1', 'LEAGUE', 'Turquia', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'tur.1');
update public.competitions set display_name = 'Pro League', type = 'LEAGUE', area = 'Bélgica', in_personalization = true where provider_code = 'bel.1';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Pro League', 'Pro League', 'pro-league', 'bel.1', 'LEAGUE', 'Bélgica', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'bel.1');
update public.competitions set display_name = 'Premiership', type = 'LEAGUE', area = 'Escócia', in_personalization = true where provider_code = 'sco.1';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Premiership', 'Premiership', 'premiership', 'sco.1', 'LEAGUE', 'Escócia', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'sco.1');
update public.competitions set display_name = 'Super League (GR)', type = 'LEAGUE', area = 'Grécia', in_personalization = true where provider_code = 'gre.1';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select 'Super League (GR)', 'Super League (GR)', 'super-league-gr', 'gre.1', 'LEAGUE', 'Grécia', 'active', true
 where not exists (select 1 from public.competitions where provider_code = 'gre.1');
