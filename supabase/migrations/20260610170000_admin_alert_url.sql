-- admin_alert sem url caía em '/'; o lugar de RESOLVER é Admin → Alertas.
create or replace function public.fan_notify_admins(
  p_title text, p_body text, p_url text, p_kind text, p_ref text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.notifications n
    where n.type = 'admin_alert'
      and n.data ->> 'kind' = p_kind
      and n.data ->> 'ref' = p_ref
      and n.created_at > now() - interval '6 hours'
  ) then
    return;
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  select p.id, 'admin_alert', p_title, p_body,
         jsonb_build_object(
           'kind', p_kind,
           'ref', p_ref,
           'url', coalesce(nullif(p_url, ''), '/admin?t=alertas')
         )
  from public.profiles p
  where p.is_app_admin = true;
end;
$$;
