-- Corrige times/jogos gravados errado pelo sync por colisão de TLA no mapa canônico
-- (sigla de clube casava abreviação ESPN de país sem cadastro): Camboja tinha virado
-- "Atlético-MG" (CAM) e Comores tinha virado "Como" (COM) nos amistosos pré-Copa 2026.
-- Guardas no WHERE tornam o script idempotente e inofensivo se o sync já tiver
-- autocorrigido (o mapa novo sobe junto deste push). Placar/status/hidden não mudam —
-- zero impacto em pontuação.

update public.teams set name = 'Camboja', short_name = 'Camboja', local_crest = null
  where provider = 'espn' and provider_ref = '5518' and name = 'Atlético-MG';

update public.teams set name = 'Comores', short_name = 'Comores', local_crest = null
  where provider = 'espn' and provider_ref = '8601' and name = 'Como';

-- Camboja 2×0 Hong Kong (ESPN 401873742, 2026-06-09)
update public.matches set home_team_name = 'Camboja'
  where id = 'dfdb06ea-25d0-4a89-ba78-4fb8507470c8' and home_team_name = 'Atlético-MG';

-- Guiné Equatorial 0×1 Comores (ESPN 401873676, 2026-06-09)
update public.matches set away_team_name = 'Comores'
  where id = '09ece3f7-ec1b-4179-a978-75777f0f10f1' and away_team_name = 'Como';

-- Comores × Ruanda cancelado (ESPN 401873739, 2026-06-06) — só coerência de nome
update public.matches set home_team_name = 'Comores'
  where id = '446da69e-6679-4982-959c-ab90d302ee2e' and home_team_name = 'Comoros';
