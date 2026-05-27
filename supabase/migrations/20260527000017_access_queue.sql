-- ============================================================================
-- Resultadismo · 16 · Sala de espera / fila de acesso (proteção de pico)
-- ----------------------------------------------------------------------------
-- O teto que estoura primeiro num pico (todo mundo abrindo o app pro jogo do
-- Brasil) é o de conexões Realtime simultâneas (~200 Free / ~500 Pro). Em vez
-- de degradar a experiência de todo mundo, seguramos novos acessos numa fila
-- FIFO e mostramos uma tela de espera; quem já está dentro continua jogando.
--
-- O PORTÃO USA SÓ RPC (PostgREST/HTTP) + POLLING — NUNCA Realtime — porque ele
-- precisa funcionar exatamente quando o Realtime está saturado.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Config (1 linha), ajustável pelo app_admin
-- ---------------------------------------------------------------------------
create table if not exists public.access_control (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default true,
  max_active int not null default 450,           -- folga abaixo do teto de Realtime
  session_ttl_seconds int not null default 45,   -- sem heartbeat nesse tempo = expira
  poll_seconds int not null default 5,           -- intervalo sugerido p/ o cliente na fila
  updated_at timestamptz not null default now()
);

insert into public.access_control (id) values (1) on conflict (id) do nothing;

create trigger access_control_set_updated_at
before update on public.access_control
for each row execute function public.set_updated_at();

alter table public.access_control enable row level security;
create policy "access_control_admin" on public.access_control
  for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

-- ---------------------------------------------------------------------------
-- Sessões ativas / na fila (uma linha por aba aberta)
-- ---------------------------------------------------------------------------
create table if not exists public.access_sessions (
  token uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,  -- null p/ anônimos
  state text not null default 'waiting' check (state in ('active', 'waiting')),
  priority int not null default 0,            -- autenticado = 1 (passa na frente)
  enqueued_at timestamptz not null default now(),
  admitted_at timestamptz,
  last_seen_at timestamptz not null default now()
);

create index access_sessions_active_idx on public.access_sessions (state, last_seen_at);
create index access_sessions_queue_idx on public.access_sessions (state, priority desc, enqueued_at);

-- Sem políticas: tabela só é tocada pelas RPCs SECURITY DEFINER abaixo.
alter table public.access_sessions enable row level security;

-- ---------------------------------------------------------------------------
-- Posição de um token na fila (prioridade desc, depois ordem de chegada)
-- ---------------------------------------------------------------------------
create or replace function private.access_rank(p_token uuid, p_priority int, p_enqueued timestamptz)
returns int
language sql
stable
as $$
  select count(*)::int + 1
  from public.access_sessions s
  where s.state = 'waiting'
    and s.token <> p_token
    and (s.priority > p_priority
         or (s.priority = p_priority and s.enqueued_at < p_enqueued));
$$;

-- ---------------------------------------------------------------------------
-- Pede acesso. Cria/renova a sessão do token e decide admissão.
-- Retorna jsonb: { admitted, token, position?, active?, max_active?, poll_seconds }
-- ---------------------------------------------------------------------------
create or replace function public.request_access(p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.access_control;
  v_token uuid := p_token;
  v_priority int := 0;
  v_enqueued timestamptz;
  v_state text;
  v_active int;
  v_available int;
  v_rank int;
begin
  select * into cfg from public.access_control where id = 1;

  -- Config ausente ou desativada => porta aberta (fail-open).
  -- gen_random_uuid() vive em pg_catalog (PG13+), resolve mesmo com search_path vazio.
  if not found or not cfg.enabled then
    return jsonb_build_object('admitted', true, 'enabled', false,
                              'token', coalesce(v_token, gen_random_uuid()));
  end if;

  if auth.uid() is not null then
    v_priority := 1;
  end if;

  -- Serializa as decisões de admissão para não estourar o teto sob rajada.
  perform pg_advisory_xact_lock(hashtext('resultadismo_access'));

  -- Expira sessões sem heartbeat (libera vagas).
  delete from public.access_sessions
  where last_seen_at < now() - make_interval(secs => cfg.session_ttl_seconds);

  if v_token is null then
    v_token := gen_random_uuid();
  end if;

  insert into public.access_sessions (token, user_id, priority, last_seen_at)
  values (v_token, auth.uid(), v_priority, now())
  on conflict (token) do update
    set last_seen_at = now(),
        user_id = excluded.user_id,
        priority = excluded.priority;

  select state, enqueued_at into v_state, v_enqueued
  from public.access_sessions where token = v_token;

  -- Já está dentro: renova e segue.
  if v_state = 'active' then
    return jsonb_build_object('admitted', true, 'token', v_token, 'poll_seconds', cfg.poll_seconds);
  end if;

  select count(*) into v_active from public.access_sessions where state = 'active';
  v_available := cfg.max_active - v_active;

  if v_available > 0 then
    v_rank := private.access_rank(v_token, v_priority, v_enqueued);
    if v_rank <= v_available then
      update public.access_sessions
        set state = 'active', admitted_at = now()
        where token = v_token;
      return jsonb_build_object('admitted', true, 'token', v_token, 'poll_seconds', cfg.poll_seconds);
    end if;
  end if;

  -- Continua na fila.
  v_rank := private.access_rank(v_token, v_priority, v_enqueued);
  return jsonb_build_object(
    'admitted', false,
    'token', v_token,
    'position', v_rank,
    'active', v_active,
    'max_active', cfg.max_active,
    'poll_seconds', cfg.poll_seconds
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Heartbeat: mantém viva a sessão ativa. Retorna { ok, state }.
-- ok=false => cliente deve voltar a pedir acesso (re-filar).
-- ---------------------------------------------------------------------------
create or replace function public.heartbeat_access(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
begin
  update public.access_sessions
    set last_seen_at = now()
    where token = p_token
    returning state into v_state;

  if v_state is null then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  return jsonb_build_object('ok', v_state = 'active', 'state', v_state);
end;
$$;

-- ---------------------------------------------------------------------------
-- Libera a vaga (ao fechar a aba / sair). Best-effort.
-- ---------------------------------------------------------------------------
create or replace function public.release_access(p_token uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.access_sessions where token = p_token;
$$;

revoke all on function public.request_access(uuid) from public;
revoke all on function public.heartbeat_access(uuid) from public;
revoke all on function public.release_access(uuid) from public;
grant execute on function public.request_access(uuid) to anon, authenticated;
grant execute on function public.heartbeat_access(uuid) to anon, authenticated;
grant execute on function public.release_access(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Limpeza periódica (higiene; a expiração também é lazy no request_access).
-- No-op se pg_cron não existir (ambiente local).
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.schedule(
    'resultadismo-access-cleanup',
    '* * * * *',
    $cron$delete from public.access_sessions
          where last_seen_at < now() - make_interval(secs => coalesce(
            (select session_ttl_seconds from public.access_control where id = 1), 45));$cron$
  );
exception when others then
  raise notice 'cron access-cleanup indisponível: %', sqlerrm;
end $$;
