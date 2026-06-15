# ADR 0010 — Grupo nasce ativo (sem aprovação prévia) + moderação reativa de nome

**Status:** aceito · **Data:** 2026-06-15 · **PO:** João

## Contexto
No modo grátis (atual, ADR 0002), o grupo nascia `pending` e só virava `active`
por aprovação manual de um admin — e a notificação de "novo grupo" não chegava
de forma confiável. O João decidiu remover o atrito da criação, mantendo um
controle de nomes impróprios.

## Decisão
1. **Grupo nasce ATIVO** no modo grátis (`payment_mode='disabled'`): o trigger
   `leagues_before_insert` seta `status='active'`, `payment_status='none'`,
   `name_approved=true`. A RLS `leagues_insert_own` passou a aceitar o INSERT já
   `active` (o trigger é a autoridade do status; teste/Mercado Pago seguem
   nascendo `pending`).
2. **Aviso aos admins na criação**: trigger `notify_admins_group_created`
   (AFTER INSERT) chama `fan_notify_admins(... 'group_created' ...)` sempre, pro
   admin conferir o nome. Substitui o antigo `notify_admins_name_review`.
3. **Moderação de nome é REATIVA**: o admin pode SINALIZAR o nome de um grupo já
   ativo via RPC `admin_flag_league_name(p_league_id, p_reason?)` (gate
   `is_app_admin`). Isso seta `name_approved=false` e avisa o DONO
   (notification `name_rejected`). O grupo **continua ativo o tempo todo**.
4. **Nome sinalizado some**: o front exibe um genérico ("Grupo (nome em
   revisão)") em todos os pontos (`groupDisplayName` em `groupName.ts`) quando
   `name_approved=false`; o nome real continua no banco.
5. **Renomear LIBERA**: `update_group_info` passou a setar `name_approved=true`
   quando o nome muda (era `false` — modelo de pré-aprovação). Admin pode
   re-sinalizar; admin também pode liberar de volta (`admin_approve_league_name`).
6. **Backfill**: grupos presos em `pending` no modo grátis foram ativados.

## Consequências
- Sem fila de aprovação no modo grátis: criar é instantâneo. A regra central 3
  (não é casa de apostas) e o pagamento desligado (ADR 0002) seguem intactos.
- Se algum dia voltar a cobrar (test/live), o fluxo de pagamento (nasce
  `pending`) não muda — só o modo grátis nasce ativo.
- Admin tem duas ações de nome: **Sinalizar** (LigasAdmin, aba Grupos) e
  **Liberar** (aba Pgto, "Nomes sinalizados").
