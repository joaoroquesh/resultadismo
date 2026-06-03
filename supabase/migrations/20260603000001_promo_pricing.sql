-- Resultadismo · Preço promocional com validade
-- Preço base da federação + um preço PROMOCIONAL opcional que vale até uma data.
-- Preço efetivo (cobrado/exibido) = (promo definido E now() < promo_until)
--   ? promo_price_cents : league_price_cents.
-- Decisão (03/06/2026): base R$ 19,90; promo R$ 9,90 durante a Copa do Mundo 2026.

alter table public.app_settings
  add column if not exists promo_price_cents int,
  add column if not exists promo_until timestamptz;

-- Preço base R$ 19,90; promo R$ 9,90 até o fim da Copa do Mundo 2026 (final em 19/07).
update public.app_settings
  set league_price_cents = 1990,
      promo_price_cents = 990,
      promo_until = timestamptz '2026-07-20 23:59:59-03',
      updated_at = now()
  where id = 1;

-- RPC: admin define/edita a promoção (preço promocional + validade).
-- Passar promo_price_cents = null limpa a promoção (volta a valer o preço base).
create or replace function public.admin_set_promo(
  p_promo_price_cents int default null,
  p_promo_until timestamptz default null
)
returns public.app_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.app_settings;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem alterar o pagamento.';
  end if;
  update public.app_settings
    set promo_price_cents = case
          when p_promo_price_cents is null then null
          else greatest(0, p_promo_price_cents)
        end,
        promo_until = case when p_promo_price_cents is null then null else p_promo_until end,
        updated_at = now()
    where id = 1
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.admin_set_promo(int, timestamptz) from public, anon;
grant execute on function public.admin_set_promo(int, timestamptz) to authenticated;
