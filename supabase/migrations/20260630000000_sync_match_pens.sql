-- ============================================================================
-- Resultadismo · Pênaltis chegam em matches (fix do "quem passa" no mata-mata)
-- ----------------------------------------------------------------------------
-- BUG em produção: num mata-mata decidido nos PÊNALTIS, o card mostrava "não
-- passou" para TODOS. Causa: os pênaltis ficam em match_sources (o sync grava via
-- record_observation), mas NÃO sobem para matches.home_pen/away_pen no fluxo ao
-- vivo — o resolve_match_golden só reconcilia o PLACAR, e o reconcilePrimary (edge)
-- só grava pênaltis no modo 'catalog'. Resultado: matches.home_pen/away_pen ficam
-- nulos no empate → resolved_advancer() não acha o classificado → "não passou".
--
-- Fix ADITIVO: copia os pênaltis da observação mais recente que os tiver para o
-- jogo (não travado/congelado), na mesma cadência do release (cron 25s). NÃO
-- altera resolve_match_golden nem reconcilePrimary. Admin com override manual
-- (manual_lock/soft_lock) tem prioridade e não é tocado.
-- Rollback: dropar a função + voltar o cron a chamar só release_soft_overrides.
-- ============================================================================

create or replace function public.sync_match_pens()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_updated int;
begin
  update public.matches m
     set home_pen = s.home_pen,
         away_pen = s.away_pen
  from (
    select distinct on (ms.match_id) ms.match_id, ms.home_pen, ms.away_pen
    from public.match_sources ms
    where ms.home_pen is not null and ms.away_pen is not null
    order by ms.match_id, ms.fetched_at desc
  ) s
  where m.id = s.match_id
    and m.frozen = false
    and m.manual_lock = false
    and (m.home_pen is distinct from s.home_pen or m.away_pen is distinct from s.away_pen);
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;
revoke all on function public.sync_match_pens() from public, anon, authenticated;
grant execute on function public.sync_match_pens() to service_role;

-- Re-agenda o cron de 25s para rodar o release SOFT + a cópia de pênaltis.
do $$
begin
  perform cron.unschedule('resultadismo-release-soft');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule('resultadismo-release-soft', '25 seconds',
    $cron$select public.release_soft_overrides(); select public.sync_match_pens();$cron$);
exception when others then
  begin
    perform cron.schedule('resultadismo-release-soft', '* * * * *',
      $cron$select public.release_soft_overrides(); select public.sync_match_pens();$cron$);
    raise notice 'release-soft+pens: 25s indisponível, mantido 1min (%).', sqlerrm;
  exception when others then
    raise notice 'cron.schedule (release-soft+pens) indisponível: %', sqlerrm;
  end;
end $$;
