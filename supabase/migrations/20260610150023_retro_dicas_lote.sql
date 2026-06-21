-- Retrô — rodada 22 (Onda 4: lote de pistas via IA, modelo híbrido):
-- Rascunhos (fact_reviewed = FALSE) de pista/apelido pros jogos mais icônicos —
-- finais de Copa + clássicos eternos. Não descem pro jogador até o João aprovar no
-- /admin/retro (revisar veracidade + spoiler). Só preenche jogo SEM dica (não mexe
-- nos 5 exemplos já publicados). Pistas = apelido/lance que ajuda a LEMBRAR o jogo,
-- sem dígitos de placar nem verbos de resultado.

-- helper local: grava rascunho de IA só se o jogo ainda não tem dica
create or replace function pg_temp.draft_fact(p_year int, p_home text, p_away text, p_stage text, p_fact text)
returns void language sql as $$
  update public.retro_matches
     set fact_pt = p_fact, fact_source = 'ia', fact_reviewed = false
   where wc_year = p_year and home_slug = p_home and away_slug = p_away
     and (p_stage is null or stage_code = p_stage) and fact_pt is null;
$$;

-- finais
select pg_temp.draft_fact(1930, 'uruguai', 'argentina', 'final', 'A primeira final da história, no Uruguai');
select pg_temp.draft_fact(1934, 'italia', 'tchecoslovaquia', 'final', 'A final da Itália jogando em casa, em 1934');
select pg_temp.draft_fact(1938, 'hungria', 'italia', 'final', 'O bicampeonato italiano de 1938, na França');
select pg_temp.draft_fact(1954, 'hungria', 'alemanhaocidental', 'final', 'O Milagre de Berna');
select pg_temp.draft_fact(1962, 'brasil', 'tchecoslovaquia', 'final', 'O bi brasileiro de Garrincha, no Chile');
select pg_temp.draft_fact(1966, 'inglaterra', 'alemanhaocidental', 'final', 'O gol fantasma de Wembley');
select pg_temp.draft_fact(1974, 'holanda', 'alemanhaocidental', 'final', 'A final da Laranja Mecânica');
select pg_temp.draft_fact(1978, 'holanda', 'argentina', 'final', 'A final argentina de 1978, em Buenos Aires');
select pg_temp.draft_fact(1982, 'italia', 'alemanhaocidental', 'final', 'A final do Paolo Rossi, em Madri');
select pg_temp.draft_fact(1986, 'argentina', 'alemanhaocidental', 'final', 'A final de Maradona no Azteca');
select pg_temp.draft_fact(1990, 'alemanhaocidental', 'argentina', 'final', 'A revanche de Roma, em 1990');
select pg_temp.draft_fact(1994, 'brasil', 'italia', 'final', 'Os pênaltis de Pasadena e o chute de Baggio');
select pg_temp.draft_fact(1998, 'brasil', 'franca', 'final', 'O Zidane de cabeça e o mistério do Ronaldo');
select pg_temp.draft_fact(2002, 'alemanha', 'brasil', 'final', 'O Ronaldo do corte de cabelo, em 2002');
select pg_temp.draft_fact(2006, 'italia', 'franca', 'final', 'A cabeçada de Zidane em Materazzi');
select pg_temp.draft_fact(2010, 'holanda', 'espanha', 'final', 'O gol de Iniesta na prorrogação');
select pg_temp.draft_fact(2014, 'alemanha', 'argentina', 'final', 'O gol de Götze na prorrogação');
select pg_temp.draft_fact(2018, 'franca', 'croacia', 'final', 'A final na chuva de Moscou');
select pg_temp.draft_fact(2022, 'argentina', 'franca', 'final', 'Messi x Mbappé na final do Catar');

-- clássicos eternos (não-finais)
select pg_temp.draft_fact(1954, 'brasil', 'hungria', 'qf', 'A Batalha de Berna');
select pg_temp.draft_fact(1970, 'italia', 'alemanhaocidental', 'sf', 'O Jogo do Século');
select pg_temp.draft_fact(1982, 'italia', 'brasil', 'group2', 'A Tragédia do Sarriá');
select pg_temp.draft_fact(1990, 'brasil', 'argentina', 'r16', 'O lance de Maradona e o gol de Caniggia');
