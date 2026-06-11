-- ============================================================================
-- Resultadismo · Grupo aguardando aprovação → alerta pros app-admins
-- ----------------------------------------------------------------------------
-- Lacuna confirmada em produção (11/06): no modo grátis o grupo nasce
-- status='pending' esperando liberação do admin, mas NENHUM trigger cobria esse
-- caminho — o único alerta de leagues (name_review) pertence ao fluxo de
-- pagamento (liquidação → active + name_approved=false). Resultado: 3 grupos
-- foram criados e aprovados sem que nenhum admin fosse avisado.
--
-- Daqui em diante: grupo criado pendente → fan_notify_admins (sininho + push),
-- com dedupe padrão de 6h por kind+ref (ref = id do grupo, então grupos
-- diferentes nunca se deduplicam entre si).
-- ============================================================================

create or replace function public.notify_admins_group_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    perform public.fan_notify_admins(
      'Grupo aguardando aprovação 👥',
      coalesce(new.name, 'Um grupo novo') || ' tá esperando sua liberação.',
      '/admin?t=grupos',
      'group_pending',
      new.id::text
    );
  end if;
  return new;
exception when others then
  -- Alerta nunca pode impedir a criação do grupo.
  return new;
end;
$$;

drop trigger if exists notify_admins_group_pending on public.leagues;
create trigger notify_admins_group_pending
after insert on public.leagues
for each row execute function public.notify_admins_group_pending();

-- ============================================================================
-- admin_push_stats — visão operacional do push no painel de Avisos
-- ----------------------------------------------------------------------------
-- Quantos aparelhos estão inscritos pra Web Push e de quantas pessoas. Deixa o
-- alcance do broadcast honesto: o nº de avisos in-app é maior que o nº de
-- aparelhos que recebem push.
-- ============================================================================

create or replace function public.admin_push_stats()
returns table (devices bigint, users bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores do app.';
  end if;
  return query
    select count(*)::bigint as devices,
           count(distinct ps.user_id)::bigint as users
    from public.push_subscriptions ps;
end;
$$;

revoke all on function public.admin_push_stats() from public, anon;
grant execute on function public.admin_push_stats() to authenticated;
