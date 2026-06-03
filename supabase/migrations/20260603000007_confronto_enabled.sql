-- Confronto (Liga/Copa + sorteio) liberado por federação, só pelo app admin.
--
-- Padrão: TODA federação nasce com confronto_enabled = false. Nesse estado os
-- modos Liga/Copa aparecem como "em breve" e o limite de competições do MVP
-- continua valendo. O app admin pode habilitar federações específicas para
-- testar/usar Confronto; nelas o seletor Pontos|Confronto (Liga/Copa) aparece,
-- o sorteio fica disponível e o limite de competições é solto.

alter table public.leagues
  add column if not exists confronto_enabled boolean not null default false;

comment on column public.leagues.confronto_enabled is
  'Quando true, libera os modos de Confronto (Liga/Copa) + sorteio e remove o limite de competições. Só o app admin altera (RPC admin_set_confronto_enabled).';

-- ---------------------------------------------------------------------------
-- Trava: só o app admin pode mudar confronto_enabled. Qualquer outro update
-- (ex.: dono editando a federação) mantém o valor antigo silenciosamente, em
-- vez de explodir — o resto do update segue normal.
-- ---------------------------------------------------------------------------
create or replace function public.leagues_guard_confronto_enabled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.confronto_enabled is distinct from old.confronto_enabled
     and not public.is_app_admin() then
    new.confronto_enabled := old.confronto_enabled;
  end if;
  return new;
end;
$$;

drop trigger if exists leagues_guard_confronto_enabled on public.leagues;
create trigger leagues_guard_confronto_enabled
  before update on public.leagues
  for each row
  execute function public.leagues_guard_confronto_enabled();

-- ---------------------------------------------------------------------------
-- RPC admin: liga/desliga o Confronto de uma federação.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_confronto_enabled(
  p_league_id uuid,
  p_value boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem liberar o modo Confronto.';
  end if;

  update public.leagues
     set confronto_enabled = p_value,
         updated_at = now()
   where id = p_league_id;

  if not found then
    raise exception 'Federação não encontrada.';
  end if;
end;
$$;

revoke all on function public.admin_set_confronto_enabled(uuid, boolean) from public, anon;
grant execute on function public.admin_set_confronto_enabled(uuid, boolean) to authenticated;
