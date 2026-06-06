-- ============================================================================
-- Resultadismo · Personalização do Resultadista
-- ----------------------------------------------------------------------------
-- Logo após o login (1ª vez), abre um modal pra personalizar:
--   • time do coração (clube)        — escolha de teams existentes
--   • seleção que torce              — escolha de teams (default Brasil)
--   • campeonato favorito            — competitions
--   • grupo favorito                 — leagues (escolhido depois)
--   • código de convite (opcional)   — entra direto num grupo se vier
--
-- A pessoa pode pular tudo (personalization_done vira true mesmo assim) e
-- editar depois no perfil. Quem já existe (já logou) cai uma vez no modal
-- também (personalization_done=false default), mas dá pra pular.
-- ============================================================================

alter table public.profiles
  add column if not exists favorite_team_id uuid references public.teams(id) on delete set null,
  add column if not exists national_team_id uuid references public.teams(id) on delete set null,
  add column if not exists favorite_competition_id uuid references public.competitions(id) on delete set null,
  add column if not exists favorite_group_id uuid references public.leagues(id) on delete set null,
  add column if not exists personalization_done boolean not null default false;

-- Set atomico (cliente passa o que quer; null mantém o atual quando passa explicito null)
-- COALESCE: se p_xxx is null, mantém o que estava. Pra LIMPAR um campo, usar string vazia
-- não funciona pra uuid — então vamos com a regra "null = não mexer". Um update separado
-- via .from('profiles').update se quiser limpar.
create or replace function public.set_personalization(
  p_favorite_team_id uuid default null,
  p_national_team_id uuid default null,
  p_favorite_competition_id uuid default null,
  p_favorite_group_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;
  update public.profiles
     set favorite_team_id = coalesce(p_favorite_team_id, favorite_team_id),
         national_team_id = coalesce(p_national_team_id, national_team_id),
         favorite_competition_id = coalesce(p_favorite_competition_id, favorite_competition_id),
         favorite_group_id = coalesce(p_favorite_group_id, favorite_group_id),
         personalization_done = true
   where id = auth.uid();
end;
$$;

grant execute on function public.set_personalization(uuid, uuid, uuid, uuid) to authenticated;

-- Skip — pessoa optou por pular o onboarding. Só marca a flag.
create or replace function public.skip_personalization()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return; end if;
  update public.profiles set personalization_done = true where id = auth.uid();
end;
$$;

grant execute on function public.skip_personalization() to authenticated;

-- Default Brasil quando existe (preenche national_team_id pra Resultadistas existentes
-- que ainda não personalizaram). Procura uma seleção brasileira na tabela teams.
do $$
declare
  v_brasil uuid;
begin
  -- Heurística: tenta achar um time chamado "Brasil" ou "Brazil" que seja seleção
  -- (é o que entra em jogos da Copa do Mundo). Se não achar, ignora.
  select id into v_brasil
  from public.teams
  where lower(name) in ('brasil', 'brazil') or lower(coalesce(short_name, '')) in ('bra', 'brz')
  order by name asc
  limit 1;

  if v_brasil is not null then
    update public.profiles set national_team_id = v_brasil
     where national_team_id is null and personalization_done = false;
  end if;
end $$;
