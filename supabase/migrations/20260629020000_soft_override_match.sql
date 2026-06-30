-- ============================================================================
-- Resultadismo · Override do admin em DOIS modos (placar/pênaltis ao vivo)
-- ----------------------------------------------------------------------------
-- O admin já podia TRAVAR um jogo contra a API (manual_lock=true): tanto o edge
-- `reconcilePrimary` quanto o `resolve_match_golden` PULAM jogos com manual_lock
-- (só registram observação) — então placar E pênaltis ficam blindados. Isso é a
-- TRAVA DURA (decisão João).
--
-- Aqui entra a TRAVA SOFT ("adiantar o que a API vai trazer"): o admin crava um
-- placar/pênaltis na frente da API; o jogo fica com manual_lock=true (segura o
-- valor) MAIS soft_lock=true (marca que é provisório). Assim que QUALQUER fonte
-- reportar o MESMO placar (a API "alcançou"), o jogo é LIBERADO sozinho
-- (manual_lock/soft_lock → false) e a API volta a mandar. Decisão João.
--
-- Implementação ADITIVA: nova coluna + função + cron de 25s. NÃO altera
-- resolve_match_golden nem reconcilePrimary (ambos já respeitam manual_lock).
-- Rollback: dropar a coluna/função/cron volta ao comportamento atual sem perdas
-- (jogos soft viram trava comum até alguém destravar).
-- ============================================================================

alter table public.matches
  add column if not exists soft_lock boolean not null default false;
comment on column public.matches.soft_lock is
  'Override SOFT do admin: o placar/pênaltis adiantados valem (junto de manual_lock=true) até a API trazer o MESMO valor — aí release_soft_overrides libera (manual_lock/soft_lock→false) e a API volta a mandar. false = trava dura (manual_lock permanente) ou sem trava.';

-- Libera os SOFT cujo placar adiantado já foi confirmado por ALGUMA fonte. Os
-- pênaltis só entram na comparação quando o admin os definiu (senão são ignorados).
create or replace function public.release_soft_overrides()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_released int;
begin
  update public.matches m
     set manual_lock = false,
         soft_lock   = false
   where m.soft_lock = true
     and m.home_score is not null
     and m.away_score is not null
     and exists (
       select 1 from public.match_sources ms
       where ms.match_id = m.id
         and ms.home_score = m.home_score
         and ms.away_score = m.away_score
         and (m.home_pen is null or ms.home_pen is not distinct from m.home_pen)
         and (m.away_pen is null or ms.away_pen is not distinct from m.away_pen)
     );
  get diagnostics v_released = row_count;
  return v_released;
end;
$$;
revoke all on function public.release_soft_overrides() from public, anon, authenticated;
grant execute on function public.release_soft_overrides() to service_role;

-- Cron a cada 25s (handoff rápido no ao vivo); fallback 1min se segundos não
-- estiverem disponíveis — NUNCA fica sem o release.
do $$
begin
  perform cron.unschedule('resultadismo-release-soft');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule('resultadismo-release-soft', '25 seconds',
    $cron$select public.release_soft_overrides();$cron$);
exception when others then
  begin
    perform cron.schedule('resultadismo-release-soft', '* * * * *',
      $cron$select public.release_soft_overrides();$cron$);
    raise notice 'release-soft: 25s indisponível, mantido 1min (%).', sqlerrm;
  exception when others then
    raise notice 'cron.schedule (release-soft) indisponível: %', sqlerrm;
  end;
end $$;
