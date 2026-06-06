-- ============================================================================
-- Resultadismo · "Construa o Resultadismo com a gente!" — feedback dos usuários
-- ----------------------------------------------------------------------------
-- Usuários reportam ERRO (bug) ou sugerem MELHORIA (idea), com texto curto
-- (estilo tweet). Em erro, capturamos contexto (página, versão do app, device)
-- — em melhoria, não precisa. O admin é avisado (fan_notify_admins) e gere o
-- ciclo: novo → arquivado (ignorar) | backlog (pro desenvolvimento) → resolvido.
-- Ao resolver, o autor é notificado (in-app + push) com a resposta do admin.
-- Integra com a infra de notificações (notifications + fan_notify_admins).
-- ============================================================================

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('bug', 'idea')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 500),
  page text,                              -- rótulo da página (só bug)
  app_version text,                       -- versão do app no momento (só bug)
  user_agent text,                        -- navegador/device (só bug)
  status text not null default 'novo' check (status in ('novo', 'arquivado', 'backlog', 'resolvido')),
  admin_reply text,                       -- resposta do admin ao resolver
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists feedback_status_idx on public.feedback (status, created_at desc);
create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc);

alter table public.feedback enable row level security;

-- Usuário cria os próprios reports.
create policy "feedback_insert_own" on public.feedback
  for insert to authenticated with check (user_id = auth.uid());
-- Usuário lê os próprios (pra acompanhar status/resposta); admin lê tudo.
create policy "feedback_select_own_or_admin" on public.feedback
  for select to authenticated using (user_id = auth.uid() or public.is_app_admin());
-- Sem policy de UPDATE: só o admin altera, via RPC SECURITY DEFINER abaixo.

-- ---------------------------------------------------------------------------
-- submit_feedback — envia um report. Contexto (página/versão/device) só p/ bug.
-- ---------------------------------------------------------------------------
create or replace function public.submit_feedback(
  p_kind text,
  p_title text,
  p_body text,
  p_page text default null,
  p_app_version text default null,
  p_user_agent text default null
)
returns public.feedback
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.feedback;
begin
  if auth.uid() is null then
    raise exception 'Você precisa estar logado para enviar feedback.';
  end if;
  if p_kind not in ('bug', 'idea') then
    raise exception 'Tipo de feedback inválido.';
  end if;
  if btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_body, '')) = '' then
    raise exception 'Preencha o título e a descrição.';
  end if;

  insert into public.feedback (user_id, kind, title, body, page, app_version, user_agent)
  values (
    auth.uid(),
    p_kind,
    left(btrim(p_title), 120),
    left(btrim(p_body), 500),
    case when p_kind = 'bug' then nullif(btrim(coalesce(p_page, '')), '') end,
    case when p_kind = 'bug' then nullif(btrim(coalesce(p_app_version, '')), '') end,
    case when p_kind = 'bug' then left(p_user_agent, 400) end
  )
  returning * into r;
  return r;
end;
$$;
revoke all on function public.submit_feedback(text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_feedback(text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_list_feedback — admin vê tudo, com nome + e-mail do autor (pra contato)
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_feedback()
returns table (
  id uuid,
  kind text,
  title text,
  body text,
  page text,
  app_version text,
  user_agent text,
  status text,
  admin_reply text,
  created_at timestamptz,
  resolved_at timestamptz,
  user_id uuid,
  author_name text,
  author_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores.';
  end if;
  return query
  select f.id, f.kind, f.title, f.body, f.page, f.app_version, f.user_agent,
         f.status, f.admin_reply, f.created_at, f.resolved_at,
         f.user_id, p.display_name, u.email::text
  from public.feedback f
  left join public.profiles p on p.id = f.user_id
  left join auth.users u on u.id = f.user_id
  order by (f.status = 'novo') desc, f.created_at desc;
end;
$$;
revoke all on function public.admin_list_feedback() from public, anon;
grant execute on function public.admin_list_feedback() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_update_feedback — muda o status (+resposta). Resolvido → notifica o autor.
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_feedback(p_id uuid, p_status text, p_reply text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.feedback;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores.';
  end if;
  if p_status not in ('novo', 'arquivado', 'backlog', 'resolvido') then
    raise exception 'Status inválido.';
  end if;

  update public.feedback
    set status = p_status,
        admin_reply = coalesce(nullif(btrim(coalesce(p_reply, '')), ''), admin_reply),
        resolved_by = case when p_status = 'resolvido' then auth.uid() else resolved_by end,
        resolved_at = case when p_status = 'resolvido' then now() else resolved_at end
    where id = p_id
    returning * into f;

  if f.id is null then
    raise exception 'Feedback não encontrado.';
  end if;

  -- Resolvido → fecha o ciclo com o autor (in-app + push via trigger de notificação).
  if p_status = 'resolvido' and f.user_id is not null then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      f.user_id,
      'feedback_reply',
      case when f.kind = 'bug' then 'Seu report foi resolvido ✅' else 'Sua sugestão foi atendida ✅' end,
      coalesce(f.admin_reply, 'Obrigado por construir o Resultadismo com a gente!'),
      jsonb_build_object('feedback_id', f.id, 'url', '/construa')
    );
  end if;

  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'feedback_' || p_status, 'feedback', p_id, jsonb_build_object('kind', f.kind));
end;
$$;
revoke all on function public.admin_update_feedback(uuid, text, text) from public, anon;
grant execute on function public.admin_update_feedback(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Novo feedback → avisa os app-admins (reusa fan_notify_admins; fail-safe).
-- ---------------------------------------------------------------------------
create or replace function public.notify_admins_new_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fan_notify_admins(
    case when new.kind = 'bug' then 'Novo report de erro 🐞' else 'Nova sugestão de melhoria 💡' end,
    left(new.title, 120),
    '/admin?t=construa',
    'feedback',
    new.id::text
  );
  return new;
exception when others then
  return new;  -- nunca quebra o insert do report
end;
$$;

drop trigger if exists notify_admins_new_feedback on public.feedback;
create trigger notify_admins_new_feedback
  after insert on public.feedback
  for each row execute function public.notify_admins_new_feedback();
