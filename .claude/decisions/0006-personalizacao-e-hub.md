# ADR 0006 — Personalização como hub do Perfil + registro único de times

**Status:** aceito · **Data:** 2026-06-09 · **PO:** João

## Contexto
A personalização (`/perfil/personalizar`) era um wizard linear de 4 telas, com bugs (X da busca,
vazamento de estado, escudos), competições limitadas e sem coleta de perfil. Nome/alias/escudo/
competição de times viviam espalhados (catálogo + `normName` + mapas EN→PT no sync).

## Decisão
1. **Registro único de times** — `data/teams-registry.json` é a fonte editável à mão; o gerador
   re-resolve escudos e escreve `data/` + `src/data/` (ver [`13-TIMES-E-ESCUDOS.md`](../13-TIMES-E-ESCUDOS.md)).
   Unificar o **sync** (aliases dirigindo o casamento + tradução) fica para a **Fase C**.
2. **Onboarding (1º acesso) = wizard guiado de 6 telas**: (0) perfil (escudo+nome+UF) · (1) time do
   coração · (2) seleção · (3) campeonatos/times (4 grupos) · (4) The Best + convite · (5)
   notificações + instalar. O **tour de boas-vindas vem DEPOIS** da personalização (fluxos
   independentes; `personalization_done`).
3. **Edição posterior = HUB no `/perfil/editar`**: escudo + nome + email + UF; linhas de preferência
   com **preview** que abrem o editor focado (`/perfil/personalizar?only=…`, com **Salvar**); The Best
   no fim; **convite só na página de Grupos**.
4. **Convite por link** (`?convite=`) capturado no boot → `localStorage` → preenche o campo.
5. **Coluna `profiles.uf`** (migration aditiva) — coleta de UF para personalizar depois.
6. **Design:** proibido "tom lavado" como destaque (ver [`12-DESIGN.md`](../12-DESIGN.md)); destaque
   sólido (ring/brand/dourado), aplicado nas telas tocadas.

## Consequências
- UF, time rival e cadência de notificação ficam como dados futuros (entrou só UF agora).
- Competições já vêm das migrations `20260607` (4 grupos); torná-las editáveis por registro é follow-up.
- Varredura do "tom lavado" nas ~29 telas legadas: backlog (a regra impede novas ocorrências).
