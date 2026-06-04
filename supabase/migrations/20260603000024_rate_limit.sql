-- ============================================================================
-- Resultadismo · Segurança (code review v2) · Rate limit (janela fixa)
-- ----------------------------------------------------------------------------
-- Endpoints que disparam fetch a APIs pagas/limitadas ou são públicos (webhook)
-- não tinham throttle. rate_limit_hit faz uma janela fixa atômica por "bucket"
-- (ex.: ip da webhook, uid do checkout) e devolve false quando estourou.
-- Só service_role chama (as Edge Functions usam a chave de serviço).
-- ============================================================================

create table if not exists public.rate_limits (
  bucket text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);

alter table public.rate_limits enable row level security;
-- sem policies: ninguém (anon/authenticated) acessa direto; só service_role/definer.

create or replace function public.rate_limit_hit(
  p_bucket text,
  p_max int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  insert into public.rate_limits (bucket, window_start, count)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set count = case
                  when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                  then 1
                  else public.rate_limits.count + 1
                end,
        window_start = case
                  when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                  then now()
                  else public.rate_limits.window_start
                end
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;
