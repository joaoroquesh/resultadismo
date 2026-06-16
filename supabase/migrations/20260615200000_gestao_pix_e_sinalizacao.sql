-- ============================================================================
-- Resultadismo · Gestão do Bolão: chave Pix + o membro sinaliza que pagou
-- ----------------------------------------------------------------------------
-- Pedido do João (2026-06-15, evolução do ADR 0009): o dono coloca a CHAVE PIX
-- da caixinha; os membros veem e COPIAM pra pagar. E o membro pode SINALIZAR no
-- app que pagou — mas só vira "pago de verdade" quando o DONO/admin confirmar.
-- O app continua sem movimentar dinheiro (ADR 0002/0009): tudo é organização.
-- ============================================================================

-- 1) Chave Pix combinada (contato pro pagamento; NÃO é transação). Editável pelo
--    admin (RLS de league_competitions já restringe); fora da trava de definições
--    (não está na lista de colunas do trg_lc_pot_guard) — é só contato.
alter table public.league_competitions
  add column if not exists pot_pix_key text;
comment on column public.league_competitions.pot_pix_key is
  'Chave Pix combinada pra caixinha do grupo (organização interna; o app não recebe nem repassa dinheiro).';

-- 2) Estado pendente × confirmado dos pagantes. As linhas que já existem foram
--    marcadas pelo admin → confirmadas (default true preserva o comportamento).
alter table public.league_pot_payers
  add column if not exists confirmed boolean not null default true;
comment on column public.league_pot_payers.confirmed is
  'true = dono/admin confirmou o pagamento; false = o membro sinalizou que pagou e aguarda confirmação.';

-- 3) RLS: o membro pode SINALIZAR que pagou (cria a PRÓPRIA linha, pendente) e
--    DESFAZER enquanto não confirmada. Confirmar (confirmed=true) segue exclusivo
--    do admin/dono (policy pot_payers_write_admin, que já existe). A trava do dono
--    (trg_pot_payers_lock) continua valendo pra todos.
drop policy if exists "pot_payers_self_declare" on public.league_pot_payers;
create policy "pot_payers_self_declare" on public.league_pot_payers
for insert with check (
  user_id = auth.uid()
  and confirmed = false
  and exists (
    select 1 from public.league_competitions lc
    where lc.id = lc_id and public.is_league_member(lc.league_id)
  )
);

drop policy if exists "pot_payers_self_undo" on public.league_pot_payers;
create policy "pot_payers_self_undo" on public.league_pot_payers
for delete using (
  user_id = auth.uid() and confirmed = false
);
