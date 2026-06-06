# 10 — Guia de UX Writing

> Como **escrever os textos do Resultadismo** (microcopy): botões, títulos, erros, estados vazios,
> sucesso, confirmações, formulários, notificações, onboarding. É a aplicação prática da **regra
> central 13** do [`MESTRE.md`](MESTRE.md) (UI/UX impecável) à **palavra**.
>
> **Fonte metodológica:** skill global **`ux-writing`** (4 padrões de qualidade, padrões de
> microcopy, voz/tom, acessibilidade, benchmarks). **Fonte de identidade:** [`PRODUCT.md`](../PRODUCT.md)
> (marca e voz) e [`DESIGN.md`](../DESIGN.md) (visual). Este guia une as duas para o Resultadismo.
>
> v1 — 2026-06-04.

---

## 0. Princípio reitor: clareza e simplicidade máximas

**Acima de tudo, o texto tem que ser óbvio.** Qualquer pessoa — inclusive quem **nunca ouviu falar**
de bolão de palpites — precisa entender **rápido** o que está acontecendo, o que fazer e como funciona.

- **Simplifique o complexo** (sem infantilizar): se um conceito está difícil, o problema é do
  texto/da tela, não do usuário.
- **Curto e direto.** As pessoas **não leem** textos grandes — diga o essencial primeiro, no menor
  número de palavras.
- **Próximo e agradável**, com um toque **boleiro** (futebol) — *desde que a clareza nunca pague o
  preço.* Na dúvida entre a piada e a clareza, **escolha a clareza**.

> Este princípio rege **tudo** aqui — e vale também para o **design** (regra central 13 do
> [`MESTRE.md`](MESTRE.md), [`02-CODIGO.md`](02-CODIGO.md) §1, [`DESIGN.md`](../DESIGN.md)).

---

## 1. Os 4 padrões (todo texto passa por eles)

Todo texto de interface tem que ser, nesta ordem de checagem:

1. **Proposital** — ajuda o jogador (ou o negócio) a alcançar um objetivo. Se não tem função, sai.
2. **Conciso** — menos palavras possível sem perder sentido. Cada palavra tem um trabalho.
3. **Conversacional** — soa como gente falando, não como sistema. Leia em voz alta: você diria isso?
4. **Claro** — sem ambiguidade, verbo específico, termo consistente.

> No Resultadismo tem um 5º filtro, **inegociável**: **on-brand e justo** — soa a torcida (não a
> planilha nem a casa de apostas). Ver seção 2 e a regra de linguagem proibida na seção 4.

---

## 2. Voz (a personalidade — constante)

A voz do Resultadismo é a de um **amigo torcedor que organiza o bolão**: caloroso, animado,
brincalhão e confiável. Cor-assinatura: turquesa. Quatro conceitos guiam toda a escrita.

### Conceito 1 — Energia de torcida (caloroso, animado)
**Características:** vibrante, acolhedor, celebratório.
**O que significa:** o app comemora junto e chama pra ação com entusiasmo. Pontuar é festa.

- ✅ "Crave o placar e suba na classificação."
- ✅ "Cravou! +3 pra você. 🔥"
- ❌ "Registro de previsão efetuado com sucesso."
- ❌ "Pontuação computada."

### Conceito 2 — Zoeira saudável (brincalhão)
**Características:** leve, divertido, cúmplice — **nunca** humilhante.
**O que significa:** a brincadeira é entre amigos. Provoca o preguiçoso, celebra o cravador — mas
nunca debocha de quem errou nem exclui ninguém. Calibragem **equilibrada**: zoeira nos momentos leves
(CTAs, vazios, cutucadas), neutra nas tarefas, recua no sério (dinheiro/erro). Clareza vem antes da piada.

- ✅ "Cutuca o preguiçoso que ainda não palpitou. 👉"
- ✅ "Tá quieto demais nessa rodada, hein?"
- ❌ "Que palpite ridículo." (debochar do usuário)
- ❌ Zoeira em momento sério (erro de pagamento, reembolso, sair do grupo).

### Conceito 3 — Direto e claro (sem corporatês)
**Características:** coloquial, objetivo, simples.
**O que significa:** português de conversa, frases curtas, zero juridiquês/tech. Estados óbvios
(aberto / pendente / ao vivo / pontuado).

- ✅ "Seu palpite trava quando o jogo começa."
- ✅ "Você já palpitou neste jogo."
- ❌ "O prazo para submissão de palpites encerra-se no kickoff."
- ❌ "Operação não permitida no estado atual da entidade."

### Conceito 4 — Confiável e justo (não é casa de apostas)
**Características:** honesto, transparente, sem urgência predatória.
**O que significa:** a gente fala a verdade sobre dinheiro, prazos e regras, sem pressão, sem
linguagem de aposta/odds/risco. Ver a **linguagem proibida** (seção 4).

- ✅ "Criar grupo é grátis. É só dar um nome e chamar a galera."
- ✅ "Mudou de ideia? Você pode cancelar e receber de volta em até 7 dias."
- ❌ "Aposte agora e ganhe!" / "Última chance!" / "Suas odds de cravar."
- ❌ Esconder o custo ou criar falsa urgência.

---

## 3. Tom (como a voz se adapta ao momento)

A voz é sempre a mesma; o **tom** muda conforme o estado emocional do jogador e o tipo de conteúdo.
Regra de ouro: **quanto mais sério o momento (dinheiro, perda, erro), menos zoeira.**

### Por estado emocional

| Estado | Quando | Tom | Exemplo Resultadismo |
|---|---|---|---|
| **Animado** | palpitar, ver jogos, subir no ranking | vibrante, convidativo | "Crave o placar." |
| **Vitorioso** | cravou, pontuou, subiu | comemora, proporcional | "Cravou! +3. 🔥" / "Subiu pra 2º!" |
| **Confiante** | tarefa de rotina (salvar palpite) | curto, direto | "Palpite salvo." |
| **Confuso** | 1º acesso, recurso novo (confronto) | paciente, explica | "Confronto é um duelo: quem fizer mais pontos no período vence." |
| **Frustrado** | erro, jogo travado, falha | empático, com saída | "O jogo já começou — os palpites travaram." |
| **Cauteloso** | ação séria (sair = W.O., reembolso, excluir) | sério, transparente | "Sair agora dá W.O. nos seus confrontos. Tem certeza?" |

### Por tipo de conteúdo
- **Erros:** empático, sem culpar, com o próximo passo. Nunca "entrada inválida".
- **Sucesso:** positivo e específico, proporcional ("Palpite salvo" para o corriqueiro; festa só pra
  conquista de verdade).
- **Instruções/onboarding:** convidativo, foca no valor, um passo de cada vez.
- **Confirmações (destrutivo):** sério e claro sobre a consequência; fácil voltar atrás.
- **Estados vazios:** esperançoso e que **ensina** o próximo passo.

---

## 4. Glossário e terminologia (consistência)

> Mesma coisa = mesma palavra, em todo o app. Isto amarra com a **regra central 9** (coerência em
> todos os pontos de contato): mudou um termo → muda em todos os lugares.

### Termos oficiais (use exatamente estes)
| Use | Não use | Observação |
|---|---|---|
| **grupo** | federação, liga, bolão* | o espaço social (antes "Federação"). |
| **Resultadista** | usuário, jogador, fulano | como **chamamos** quem joga, em momentos sociais/de conquista ("Você é o 27º Resultadista", "Vamos, Resultadista!"). Não usar em copy puramente operacional/técnica. |
| **Bolão** (modo) | Pontos, Tabela | um dos **2 modos** de disputa. Bolão = corrida de pontos sobre os jogos de um campeonato. Banco mantém `points` (não muda). **Nome** do bolão é sempre o do campeonato (ex.: "Copa do Mundo 2026"). |
| **Confrontos** (modo) | duelos, mata-mata* | o **2º modo** — duelo A×B entre membros. Inclui **Liga** (pontos corridos 3/1/0) e **Copa** (mata-mata). Gated por federação (`confronto_enabled`); só aparece quando está ligado. |
| **Liga / Copa** (dentro de Confrontos) | — | **formatos** dentro de Confrontos. Nome auto: **"Nª Liga {Grupo}"** / **"Nª Copa {Grupo}"** (ex.: "7ª Liga Clubistash"). |
| **palpite** / **palpitar** | aposta, chute, previsão | a ação central |
| **cravar** / **cravada** | acertar em cheio | placar exato (+3) |
| **saldo** | — | vencedor + diferença de gols (+2) |
| **acerto** | — | só o vencedor (+1) |
| **dobro (2×)** | **joker** (anglicismo), multiplicador | rótulo: **"Dobro (2×)"**. Metáfora de carta? use **"coringa"** (PT), nunca "joker". |
| **classificação** | tabela | "ranking" é aceitável se for mais claro no contexto |
| **Resultadismo The Best** | "ranking global", "leaderboard" | **nome da classificação geral** (todos os Resultadistas, todas as competições). |
| **cutucar** | nudge, alertar | lembrar quem não palpitou |
| **escudo** | avatar, brasão | identidade visual de perfil/grupo (no grupo é uma **flâmula** estilo bandeira de país). |
| **jogo** | partida, match | |

### ⛔ Linguagem PROIBIDA (regra de negócio 3 — "não é casa de apostas")
**Nunca** use, em nenhum texto do site: **aposta/apostar, odds, banca, prêmio em dinheiro, ganhe
dinheiro, jackpot, cassino, "última chance", urgência predatória.** Hoje **criar grupos é grátis**
(ADR [`0002`](decisions/0002-pagamento-desligado-gratis.md)); se voltar a cobrar, é **taxa de
serviço** pela criação de grupo, nunca "aposta". → [`06`](06-REGRAS-DE-NEGOCIO.md) §5.

### Convenções
- **Tratamento:** **"você"**, sempre (sem "tu"/"cês").
- **Anglicismos — priorize a clareza:** use o termo que a pessoa entende **mais rápido**. PT-BR
  quando for igualmente claro (classificação, dobro, ao vivo); o termo consagrado quando for o mais
  óbvio (ex.: "Pix", "app", "login"). **Clareza acima de purismo** — e acima de soar bonito.
- **Capitalização:** *sentence case* (só a 1ª letra). "Criar grupo", não "Criar Grupo".
- **CTAs herói** (marca): imperativo na 2ª pessoa — "Crave o placar", "Faça seu palpite".
- **Botões funcionais:** infinitivo curto — "Salvar", "Criar grupo", "Entrar", "Cancelar".
- **Números/placar:** algarismos sempre (3 × 1, +3, R$ 9,90). Vírgula decimal, "R$" com espaço.
- **Emojis:** com **parcimônia**, só em festa/leveza. Lista oficial: **🔥** (cravada/grande momento),
  **👉** (cutucada), **⚽** (jogos), **⏰** (prazo). **Nunca** em erro, dinheiro ou confirmação séria.

---

## 5. Padrões de microcopy (com exemplos do Resultadismo)

### Botões e CTAs
Verbo de ação + objeto, *sentence case*. 2–4 palavras. Nada de "OK", "Enviar", "Clique aqui".
- ✅ "Fazer palpite" · "Criar grupo" · "Entrar com código" · "Cancelar e reembolsar"
- ❌ "OK" · "Enviar" · "Confirmar" (sozinho, sem objeto)

### Títulos
Frase-substantivo curta (≤ 40 caracteres), *sentence case*, orienta onde estou.
- ✅ "Seus grupos" · "Como funciona" · "Jogos de hoje"

### Mensagens de erro — `[O que falhou]. [Por quê]. [O que fazer].`
Empático, sem culpar, sempre com saída. 12–18 palavras.
| Situação | ✅ Bom | ❌ Ruim |
|---|---|---|
| Palpite após o apito | "O jogo já começou — os palpites travaram aqui." | "Operação não permitida." |
| Sem conexão ao salvar | "Não deu pra salvar. Confira a internet e tente de novo." | "Erro ao salvar." |
| Pagamento recusado | "O pagamento não passou. Tente outro cartão ou Pix." | "Falha na transação." |
| Código de convite inválido | "Não achamos esse grupo. Confira o código." | "Código inválido." |

### Mensagens de sucesso — `[Ação] [resultado]`
Passado, específico, proporcional.
- ✅ "Palpite salvo." · "Você entrou no grupo." · "Cravou! +3 pra você. 🔥"
- ❌ "Sucesso!" · "Operação concluída."

### Estados vazios — explicação + próximo passo
- Sem grupos: **"Você ainda não está em nenhum grupo."** + "Crie a sua ou entre com um
  código de convite."
- Sem jogos no dia: **"Nenhum jogo hoje."** + "Veja os próximos ou troque de campeonato."

### Confirmações (destrutivo / sério) — consequência clara, fácil voltar
- Sair do grupo (com confronto ativo): **"Sair agora dá W.O. nos seus confrontos em aberto — o
  adversário vence. Tem certeza?"** → "Sair" / "Voltar". (2 passos, ver `ConfirmDialog`.)
- Reembolso: **"Cancelar e reembolsar? O grupo vai pra Lixeira e o valor volta em até 7 dias."**

### Formulários
- **Label** visível e curto ("Nome do grupo"). Sem campo só-placeholder.
- **Ajuda** explica o porquê quando precisa ("Esse código deixa seus amigos entrarem.").
- **Erro inline:** abaixo do campo, específico ("O nome precisa de pelo menos 3 letras.").

### Notificações / Web Push — título (verbo) + corpo curto
- Lembrete de prazo: **"Não esquece de palpitar! ⏰"** + "Brasil × Argentina começa logo."
- Cutucada: **"Cutucada! 👉"** + "Fulano tá esperando seu palpite na [grupo]."

### Onboarding
Convida sem afogar, foca no valor, comemora o 1º acerto. Um conceito por tela.

---

## 6. Acessibilidade (escrever pra todo mundo)
- **Link/botão se explica sozinho:** "Ler a política de privacidade", não "clique aqui".
- **Erro + campo juntos** pro leitor de tela: "Erro: o nome precisa de 3 letras" (não só borda
  vermelha).
- **Não dependa só de cor:** o tipo de pontuação tem rótulo, não só dourado/verde/ciano.
- **Frases curtas:** ~8 palavras = 100% de compreensão; ~14 = 90%. Evite subordinada empilhada.
- **Linguagem simples:** nível "conversa de torcida", sem jargão técnico nem juridiquês.

---

## 7. Benchmarks (alvos práticos — PT-BR)
| Elemento | Alvo |
|---|---|
| Botão / CTA | 2–4 palavras (≤ ~24 caracteres) |
| Título | 3–6 palavras (≤ 40 caracteres) |
| Erro (com solução) | 12–18 palavras |
| Instrução | ≤ 20 palavras (14 ideal) |
| Notificação (título) | ≤ 45 caracteres |
| Frase (média) | ~14 palavras; evitar > 25 |

> Português corre ~15–20% mais longo que o inglês — priorize **cortar**, não comprimir feio. Teste
> lendo em voz alta. (Flesch-Kincaid é p/ inglês; aqui vale o princípio: frase curta, palavra comum.)

---

## 8. Checklist de qualidade (antes de subir qualquer texto)
Avalie cada texto nas 4 dimensões (some um 5º: on-brand). Nota baixa → reescreve.
- **Proposital:** ajuda o jogador a fazer o que veio fazer? O valor está claro?
- **Conciso:** dá pra tirar palavra sem perder sentido? Info importante na frente?
- **Conversacional:** eu falaria isso em voz alta? Voz ativa? Sem corporatês?
- **Claro:** verbo específico? Termo do glossário (seção 4)? Sem ambiguidade?
- **On-brand & justo:** soa a torcida? Zero linguagem de aposta? Tom certo pro momento?

**Processo de edição (4 fases):** rascunhe falando → corte (conciso) → naturalize (conversacional)
→ afie (claro). Use a skill `ux-writing` para auditar/gerar.

---

## 9. Exemplos antes → depois (Resultadismo)
| Antes (❌) | Depois (✅) | Por quê |
|---|---|---|
| "Previsão registrada." | "Palpite salvo." | termo oficial, conversacional |
| "Erro: operação inválida." | "O jogo já começou — os palpites travaram." | explica + sem culpar |
| "Deseja realmente sair?" | "Sair agora dá W.O. nos seus confrontos. Tem certeza?" | consequência clara |
| "Adquira sua liga." | "Crie seu grupo — é grátis." | termo certo, honesto, sem "aposta" |
| "Nenhum dado encontrado." | "Você ainda não está em nenhum grupo." + CTA | ensina o próximo passo |

---

## 10. Como usar a skill + manutenção
- **Skill global `ux-writing`:** invoque para **gerar** microcopy (erro, vazio, onboarding) ou
  **auditar** strings existentes — ela traz templates e checklist. Este guia é a **camada
  Resultadismo** por cima (voz, glossário, regras próprias).
- **Ao mudar um texto:** propague em **todos os pontos de contato** (regra 9 / [`MESTRE.md`](MESTRE.md)
  §5 passo 6) e atualize o glossário aqui se criar/alterar um termo.
- **Mudança que sobe** → CHANGELOG + esta doc, conforme o protocolo.

---

## 11. Decisões de voz (v1) e o que ainda evolui
**Definido com o João (2026-06-04):** princípio reitor = **clareza e simplicidade máximas** (seção 0,
acima de tudo); humor **equilibrado** com toque boleiro; **priorizar clareza** nos termos; **emojis
com parcimônia** (lista na seção 4); **"você"** fixo; **"Dobro (2×)"** como rótulo; estrutura aprovada.

**Evolui depois:** inventário das **strings reais** do app (auditoria tela a tela, com versão
recomendada) e exemplos que o João marcar como referência/"nunca mais". Doc viva — todo ajuste segue
o protocolo ([`MESTRE.md`](MESTRE.md) §5: propaga em todos os pontos de contato + CHANGELOG).
