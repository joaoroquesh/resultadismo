-- ONDA C #1 — Grupo nasce ATIVO no modo grátis (sem aprovação prévia); admins
-- são avisados na CRIAÇÃO pra conferir o nome; a moderação de nome vira REATIVA:
-- o admin pode SINALIZAR o nome de um grupo já ativo → o nome some (vira genérico
-- no front) e o dono é avisado pra trocar; ao renomear, volta a valer. Decisão do
-- João (ADR 0010). Modos teste/Mercado Pago seguem como antes (nascem pending).

-- 1) Grupo nasce ATIVO no modo grátis (era 'pending').
create or replace function public.leagues_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_mode public.payment_mode;
begin
  if new.join_code is null then
    new.join_code := public.gen_join_code();
  end if;
  if not public.can_settle_leagues() then
    select payment_mode into v_mode from public.app_settings where id = 1;
    if coalesce(v_mode, 'disabled') = 'disabled' then
      new.status := 'active';          -- ATIVO na hora, sem aprovação
      new.payment_status := 'none';
    else
      new.status := 'pending';         -- teste/Mercado Pago: como antes
      new.payment_status := 'pending';
    end if;
  end if;
  return new;
end;
$$;

-- 2) RLS: aceitar o INSERT já 'active' (o trigger acima é a autoridade do status;
--    em test/live ele força 'pending', então liberar 'active' aqui é seguro).
alter policy leagues_insert_own on public.leagues
  with check (
    (owner_id = auth.uid()) and (status in ('pending', 'active') or public.is_app_admin())
  );

-- 3) Aviso aos admins na CRIAÇÃO (sempre) — substitui o antigo fluxo de revisão
--    de nome no insert. O dedupe de fan_notify_admins usa ref = id do grupo.
drop trigger if exists notify_admins_name_review on public.leagues;
create or replace function public.notify_admins_group_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.fan_notify_admins(
    'Novo grupo criado',
    coalesce(new.name, 'Um grupo') || ' acabou de ser criado. Confira o nome.',
    '/admin?t=grupos',
    'group_created',
    new.id::text
  );
  return new;
exception when others then
  return new;  -- alerta nunca bloqueia a criação do grupo
end;
$$;
create trigger notify_admins_group_created
  after insert on public.leagues
  for each row execute function public.notify_admins_group_created();

-- 4) Moderação REATIVA: admin sinaliza o nome → name_approved=false + avisa o dono.
create or replace function public.admin_flag_league_name(p_league_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_name text;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem sinalizar o nome de um grupo.';
  end if;
  perform set_config('app.settle_bypass', '1', true);  -- passa pelo guard de status
  update public.leagues set name_approved = false
   where id = p_league_id
  returning owner_id, name into v_owner, v_name;
  if v_owner is null then
    raise exception 'Grupo não encontrado.';
  end if;
  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_owner, 'name_rejected', 'Troque o nome do seu grupo',
    coalesce(
      nullif(p_reason, ''),
      'O nome "' || coalesce(v_name, '') ||
      '" foi sinalizado pela moderação. Escolha outro nome pra ele voltar a aparecer.'
    ),
    jsonb_build_object('url', '/grupos')
  );
end;
$$;
revoke all on function public.admin_flag_league_name(uuid, text) from public, anon;
grant execute on function public.admin_flag_league_name(uuid, text) to authenticated;

-- 5) Renomear LIBERA o nome (moderação reativa): o novo nome entra valendo na hora
--    (antes voltava a name_approved=false, que era o modelo de pré-aprovação).
create or replace function public.update_group_info(p_league_id uuid, p_name text, p_description text)
returns leagues language plpgsql security definer set search_path = '' as $$
declare
  v public.leagues;
  v_old_name text;
begin
  if not (public.is_league_admin(p_league_id) or public.is_app_admin()) then
    raise exception 'Só o dono ou admin do grupo pode editar o grupo.';
  end if;
  select name into v_old_name from public.leagues where id = p_league_id;
  if v_old_name is null then
    raise exception 'Grupo não encontrado.';
  end if;
  p_name := trim(coalesce(p_name, ''));
  if char_length(p_name) < 2 then
    raise exception 'O nome do grupo precisa de pelo menos 2 caracteres.';
  end if;
  if char_length(p_name) > 60 then
    raise exception 'O nome do grupo pode ter no máximo 60 caracteres.';
  end if;

  perform set_config('app.settle_bypass', '1', true);  -- passa pelo guard de status
  update public.leagues
    set name = p_name,
        description = nullif(trim(coalesce(p_description, '')), ''),
        -- nome mudou → entra VALENDO (moderação reativa; admin re-sinaliza se precisar)
        name_approved = case when p_name is distinct from v_old_name then true else name_approved end
    where id = p_league_id
  returning * into v;

  return v;
end;
$$;

-- 6) Backfill: ativar os grupos presos em 'pending' no modo grátis (decisão do João).
select set_config('app.settle_bypass', '1', false);
update public.leagues set status = 'active'
 where status = 'pending' and payment_status = 'none';
select set_config('app.settle_bypass', '', false);
