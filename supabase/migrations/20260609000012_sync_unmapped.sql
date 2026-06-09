-- Times que as APIs entregam e NÃO estão no registro canônico (data/teams-registry).
-- O sync registra aqui (melhor-esforço) e o admin decide em Admin → Dados:
-- "aceitar como veio" (fica com nome/escudo da API) ou copiar o JSON pro registro.
create table public.sync_unmapped (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'team',
  provider text not null,
  name text not null,
  short_name text,
  tla text,
  crest_url text,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  seen_count int not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (kind, provider, name)
);

-- RLS ligado SEM policy: acesso só via RPC (padrão do projeto p/ tabela interna).
alter table public.sync_unmapped enable row level security;

-- Chamada pelo sync (service_role): upsert + incremento do contador.
create or replace function public.log_unmapped_teams(p_provider text, p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r jsonb;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    insert into public.sync_unmapped (kind, provider, name, short_name, tla, crest_url)
    values ('team', p_provider, r->>'name', r->>'short_name', r->>'tla', r->>'crest_url')
    on conflict (kind, provider, name) do update
      set seen_count = public.sync_unmapped.seen_count + 1,
          last_seen = now(),
          short_name = coalesce(excluded.short_name, public.sync_unmapped.short_name),
          tla = coalesce(excluded.tla, public.sync_unmapped.tla),
          crest_url = coalesce(excluded.crest_url, public.sync_unmapped.crest_url);
  end loop;
end;
$$;
revoke all on function public.log_unmapped_teams(text, jsonb) from public;
grant execute on function public.log_unmapped_teams(text, jsonb) to service_role;

-- Admin: lista os pendentes (mais vistos primeiro).
create or replace function public.admin_list_unmapped()
returns setof public.sync_unmapped
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.sync_unmapped
   where public.is_app_admin() and status = 'pending'
   order by seen_count desc, last_seen desc;
$$;
revoke all on function public.admin_list_unmapped() from public;
grant execute on function public.admin_list_unmapped() to authenticated;

-- Admin: aceita como veio da API (para de alertar).
create or replace function public.admin_resolve_unmapped(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores.';
  end if;
  update public.sync_unmapped set status = 'accepted' where id = p_id;
end;
$$;
revoke all on function public.admin_resolve_unmapped(uuid) from public;
grant execute on function public.admin_resolve_unmapped(uuid) to authenticated;
