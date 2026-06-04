# Changelog — Resultadismo

Todas as mudanças relevantes que **sobem para produção** a partir de agora são registradas aqui.

Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versionamento
**MAJOR.MINOR.PATCH** (regras no [`MESTRE.md`](MESTRE.md) §6). O número fonte de verdade fica no
[`package.json`](../package.json).

> **Como usar:** toda mudança que sobe ganha uma entrada (passo 7 do protocolo em
> [`MESTRE.md`](MESTRE.md) §5 / [`08-PROCESSO.md`](08-PROCESSO.md)). Acumule em **[Não lançado]**
> enquanto desenvolve; ao subir, mova para uma versão datada e atualize o `package.json`.
> A evolução **anterior** ao 2.0.0 (site v1 e a construção do v2) está em [`HISTORICO.md`](HISTORICO.md).

Tipos de entrada: **Adicionado**, **Alterado**, **Corrigido**, **Removido**, **Segurança**,
**Depreciado**.

---

## [Não lançado]

_(Nada ainda. Próximas mudanças entram aqui antes de virar uma versão.)_

---

## [2.0.0] — 2026-06-03

**Marco de lançamento.** Linha de base da reescrita **React + Supabase**, no ar em
**www.resultadismo.com** e cobrando de verdade (Mercado Pago). Consolida tudo que foi construído
entre 26/05 e 03/06/2026 (detalhe e cronologia em [`HISTORICO.md`](HISTORICO.md)).

### Adicionado
- **Jogo de palpites completo:** cravada/saldo/acerto (3/2/1), pontuação e re-pontuação automáticas
  no banco, dobro (2×) com limite por semana, classificação com desempate fixo.
- **Federações** (grupos privados): criação, papéis (dono/admin/membro), visibilidade e políticas de
  entrada, código de convite, escudo por máscara SVG.
- **Modo Confronto (Liga/Copa)** por federação, **atrás de gate** (`confronto_enabled`): duelo por
  período (fase/semana), sorteio transacional (instantâneo/agendado), formato turno/ida-volta/suíço,
  participantes admin/opt-in, anti-trapaça, W.O. na saída, simulador de estrutura.
- **Monetização:** cobrança de taxa única pela criação de Federação via Mercado Pago (modos
  Desativado/Teste/Mercado Pago), preço base + promoção da Copa, cupons de desconto, cortesia do
  admin, e **reembolso self-service** (arrependimento, 7 dias).
- **Dados de futebol** via ESPN (preferido), football-data.org e TheSportsDB; admin de competições
  (publicar/renomear/sincronizar) e admin de jogos por competição (curadoria + override).
- **Tela de jogos** com "Todos os campeonatos", dia hoje/próximo e pontuação do dia.
- **Notificações:** Web Push (lembrete de prazo) e cutucadas, PWA instalável.
- **Sala de espera** (fila FIFO) para proteger o Realtime em pico.
- **Painel admin** (Federações / Competições / Usuários / Pagamento) e perfis público/próprio.
- **Documentação `.claude/`** (este conjunto): MESTRE + 01–09 + CHANGELOG + HISTORICO.

### Segurança
- Coluna `email` removida de `profiles` (PII); admin lê e-mail via RPC restrita.
- Acesso governado por RLS + RPCs `SECURITY DEFINER`; pagamento protegido por triggers de guarda.

### Infra
- Deploy 100% por push na `main` (Vercel + integração Supabase + GitHub Action de Edge Functions).

---

<!--
GABARITO para a próxima entrada (copie e preencha):

## [2.0.1] — AAAA-MM-DD
### Corrigido
- … (o que mudou, e por quê; cite arquivos/migrations se ajudar)
### Documentação
- Atualizado `.claude/0X-...md` por causa desta mudança.
-->
