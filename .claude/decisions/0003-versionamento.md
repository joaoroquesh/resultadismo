# ADR 0003 — Versionamento: reset para 1.0.0 + cadência por release

> **Status:** ✅ Aprovada (2026-06-06, decisão do João).

## Contexto
O versionamento disparou: **2.0.0 → 2.11.0 em ~3 dias** (28 bumps; vários MINORs/dia). Causas:
1. **SemVer é de biblioteca/API** (eixo = compatibilidade com consumidores). O Resultadismo é um
   **app de deploy contínuo**, sem consumidores de API — o número inchava sem significar nada.
2. **Bump por commit/mudança parcial**, não por release.
3. **Sessões paralelas** cortavam versões independentes → números saltavam e "brigavam".

Começar a reescrita em **2.0** também foi erro: o site antigo era **protótipo (v0)**, nunca 1.0.

## Decisão
1. **Marcos:** v0 = legado; **1.0.0 = reescrita soft-launched** (estado atual, pré-Copa); **2.0.0 =
   lançamento oficial da Copa** (o João corta quando estiver "pronto"). Ajuste pré-Copa = v1.x.
2. **Reset:** `package.json` 2.11.0 → **1.0.0**. As entradas 2.0–2.11 do CHANGELOG viram **Arquivo —
   desenvolvimento do 1.0**; detalhe granular no HISTORICO.
3. **Cadência:** acumular em `[Não lançado]`; **versão só sobe em release deliberado** (João decide;
   **um** dono faz o bump). Nunca por commit/sessão. → 09-PARALELISMO.
4. **Critérios:** MAJOR = marco de produto (Copa)/overhaul; MINOR = recurso perceptível; PATCH =
   correção/refino.

## Consequências
- ✅ O número volta a significar algo (1.0 = soft-launch; 2.0 = Copa) e para de inflar.
- ✅ Sessões paralelas não brigam pelo número (só editam `[Não lançado]`).
- ⚖️ Salto pra trás 2.11 → 1.0 (incomum), mas a versão só aparece no rodapé do Perfil + metadado de
  feedback, e o app é pré-lançamento — risco baixo, feito **uma única vez**.
- Versão passa a ser **exibida no rodapé do Perfil**; tela de Changelog no admin (em seguida).

## Regras vivas
[`../MESTRE.md`](../MESTRE.md) §6 · [`../09-PARALELISMO.md`](../09-PARALELISMO.md) · [`../CHANGELOG.md`](../CHANGELOG.md)
