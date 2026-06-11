import { type ReactNode } from "react";
import { track } from "@/lib/analytics";
import { Link, useNavigate } from "react-router-dom";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import {
  ArrowLeft,
  Target,
  Scale,
  CheckCircle2,
  Zap,
  Trophy,
  ListOrdered,
  Swords,
  Eye,
  EyeOff,
  Mail,
  UserCheck,
  DoorOpen,
  ShieldCheck,
  Goal,
  Hand,
  Globe2,
  SlidersHorizontal,
  Users,
  Star,
  Gamepad2,
  HandCoins,
} from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/AuthProvider";

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-extrabold tracking-tight text-ink-950">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-2 text-brand-600">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Placar de exemplo (chip 2×1) nas linhas de pontuação. */
function ScoreChip({ value }: { value: string }) {
  return (
    <span className="rounded border border-border bg-surface px-1.5 py-0.5 text-xs font-bold tabular-nums text-ink-900">
      {value}
    </span>
  );
}

/** Cartão de pontuação no padrão visual do selo +3/+2/+1, com exemplo "mostrado". */
function ScoreRow({
  pts,
  title,
  desc,
  pill,
  text,
  icon,
  palpite,
  placar,
}: {
  pts: string;
  title: string;
  desc: string;
  pill: string;
  text: string;
  icon: ReactNode;
  palpite: string;
  placar: string;
}) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-3">
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-md text-lg font-extrabold tabular-nums ${pill} ${text}`}
        >
          {pts}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-bold text-ink-900">
            {icon}
            {title}
          </p>
          <p className="text-sm leading-snug text-ink-500">{desc}</p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-500">
        Você palpita <ScoreChip value={palpite} /> e o jogo termina{" "}
        <ScoreChip value={placar} />
      </div>
    </Card>
  );
}

/** Linha de opção (visibilidade / forma de entrada) com ícone, título e explicação. */
function OptionRow({
  icon,
  title,
  desc,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-3 p-3.5">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-ink-100 text-ink-600">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink-900">{title}</p>
        <p className="text-sm leading-snug text-ink-500">{desc}</p>
      </div>
    </div>
  );
}

export function ComoFuncionaPage() {
  const { open: openLogin } = useLoginModal();
  const navigate = useNavigate();
  const { session } = useAuth();

  return (
    <Page
      title="Como funciona"
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      <div className="space-y-10">
        {/* Intro */}
        <div className="rounded-lg bg-surface-2 p-4">
          <p className="text-sm leading-relaxed text-ink-700">
            No <span className="font-bold text-brand-700">Resultadismo</span> você crava o placar dos
            jogos antes da bola rolar. Chegou perto do resultado? Pontuou. Somou mais que os amigos?
            Assumiu a liderança do grupo. Aqui vai o jogo completo, sem complicação.
          </p>
        </div>

        {/* Palpitar */}
        <Section icon={<Hand className="size-4" strokeWidth={2.4} />} title="Palpitar leva segundos">
          <Card className="space-y-2 p-4">
            <p className="text-sm leading-relaxed text-ink-600">
              O placar de cada jogo fica <span className="font-bold text-ink-900">– × –</span> até
              você palpitar. Tocou no card, ele vira{" "}
              <span className="font-bold text-ink-900">0×0</span> e aparecem os botões{" "}
              <span className="font-bold text-ink-900">+</span> e{" "}
              <span className="font-bold text-ink-900">−</span> pra ajustar cada lado — sem teclado.
            </p>
            <p className="text-sm leading-relaxed text-ink-600">
              O palpite <span className="font-semibold text-ink-900">salva sozinho</span> e dá pra
              mudar à vontade até a bola rolar. Depois disso, trava — e aí é torcer.
            </p>
          </Card>
        </Section>

        {/* Pontuação */}
        <Section icon={<Target className="size-4" strokeWidth={2.4} />} title="Como pontuar">
          <p className="-mt-1 text-sm leading-relaxed text-ink-600">
            Cada jogo vale até <span className="font-bold text-ink-900">3 pontos</span>, dependendo do
            quanto seu palpite acertou:
          </p>
          <div className="space-y-2">
            <ScoreRow
              pts="+3"
              title="Cravada"
              desc="Você acertou o placar exato. O máximo!"
              pill="bg-gold-500"
              text="text-gold-950"
              icon={<Target className="size-4 text-gold-600" strokeWidth={2.4} />}
              palpite="2×1"
              placar="2×1"
            />
            <ScoreRow
              pts="+2"
              title="Saldo"
              desc="Errou o placar exato, mas acertou a diferença de gols. Prever o empate também conta aqui (palpitou 1×1, deu 2×2)."
              pill="bg-grass-600"
              text="text-white"
              icon={<Scale className="size-4 text-grass-600" strokeWidth={2.4} />}
              palpite="2×0"
              placar="3×1"
            />
            <ScoreRow
              pts="+1"
              title="Acerto"
              desc="Acertou só quem venceu, mas errou o saldo de gols."
              pill="bg-aqua-700"
              text="text-white"
              icon={<CheckCircle2 className="size-4 text-aqua-700" strokeWidth={2.4} />}
              palpite="2×0"
              placar="1×0"
            />
            <ScoreRow
              pts="0"
              title="Errou"
              desc="O resultado foi diferente do que você palpitou. Faz parte — bola pra frente."
              pill="bg-ink-200"
              text="text-ink-500"
              icon={<Goal className="size-4 text-ink-400" strokeWidth={2.4} />}
              palpite="2×0"
              placar="0×1"
            />
          </div>
        </Section>

        {/* Dobro de pontos */}
        <Section icon={<Zap className="size-4" strokeWidth={2.4} />} title="Dobro de pontos (2×)">
          <Card className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-600 text-white">
                <Zap className="size-5 fill-white" />
              </span>
              <p className="text-sm leading-relaxed text-ink-600">
                Confiante em um jogo? Toque no{" "}
                <span className="inline-flex items-center gap-0.5 rounded-pill bg-brand-600 px-1.5 align-middle text-[11px] font-bold text-white">
                  <Zap className="size-2.5 fill-white" /> 2×
                </span>{" "}
                ao palpitar para <span className="font-bold text-ink-900">dobrar os pontos</span>{" "}
                daquele palpite. Uma cravada vira <span className="font-bold text-gold-700">+6</span>,
                um saldo vira <span className="font-bold text-grass-700">+4</span>, um acerto vira{" "}
                <span className="font-bold text-aqua-700">+2</span>.
              </p>
            </div>
            <p className="rounded-md bg-surface-2 px-3 py-2 text-xs font-medium text-brand-700">
              Atenção: você tem no máximo{" "}
              <span className="font-bold">2 dobros por semana</span> (de segunda a domingo). Use com
              estratégia — e cuidado, se errar o jogo dobrado você não perde pontos, mas perde a
              chance de multiplicar.
            </p>
          </Card>
        </Section>

        {/* Resultadismo Retrô (mini-jogo) */}
        <Section icon={<Gamepad2 className="size-4" strokeWidth={2.4} />} title="Resultadismo Retrô">
          <Card className="space-y-2 p-4">
            <p className="text-sm leading-relaxed text-ink-600">
              O <span className="font-bold text-ink-900">Retrô</span> é o nosso mini-jogo de{" "}
              <span className="font-bold text-ink-900">placares históricos</span>: 7 jogos reais de
              Copas do Mundo (1930–2022) e poucos segundos para cravar cada um. A pontuação é a
              mesma do Resultadismo (cravada +3, saldo +2, acerto +1) — pontuou, avança na sua
              própria Copa; errou no mata-mata, caiu. Vale o placar final com prorrogação; pênaltis
              não contam.
            </p>
            <p className="text-sm leading-relaxed text-ink-600">
              Dá pra jogar <span className="font-bold text-ink-900">sem conta</span>. Logado, você
              entra no <span className="font-bold text-ink-900">ranking da Copa do Dia</span> (uma
              tentativa por dia, os mesmos 7 jogos para todo mundo) e acumula a sua sequência 🔥.
            </p>
            <Link
              to="/retro"
              className="block rounded-md bg-brand-600 px-3 py-2 text-center text-sm font-bold text-white"
            >
              Jogar a Copa Retrô de hoje 🕹️
            </Link>
          </Card>
        </Section>

        {/* Modos de disputa */}
        <Section
          icon={<Trophy className="size-4" strokeWidth={2.4} />}
          title="Como a disputa funciona"
        >
          <div className="space-y-2">
            <Card className="space-y-1.5 p-4">
              <p className="flex items-center gap-2 font-bold text-ink-900">
                <ListOrdered className="size-4 text-brand-600" strokeWidth={2.4} />
                Bolão
              </p>
              <p className="text-sm leading-relaxed text-ink-600">
                O modo da temporada: todo mundo palpita nos mesmos jogos, os pontos somam e{" "}
                <span className="font-semibold text-ink-900">quem somou mais lidera</span>. Todo
                grupo joga o <span className="font-semibold text-ink-900">bolão da Copa do Mundo
                2026</span> — você entra quando quiser, sem ficar de fora.
              </p>
            </Card>
            <Card className="space-y-1.5 p-4">
              <p className="flex items-center gap-2 font-bold text-ink-900">
                <Swords className="size-4 text-brand-600" strokeWidth={2.4} />
                Confronto
                <span className="rounded-pill bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-400">
                  em breve
                </span>
              </p>
              <p className="text-sm leading-relaxed text-ink-600">
                Disputas mano a mano dentro do grupo. Vem aí.
              </p>
            </Card>
          </div>
          <Card className="flex items-start gap-3 p-4">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-surface-2 text-brand-600">
              <Trophy className="size-4" strokeWidth={2.4} />
            </span>
            <div className="space-y-2">
              <p className="font-semibold text-ink-900">Quem está ganhando? E o desempate</p>
              <p className="text-sm leading-relaxed text-ink-600">
                A classificação ordena pelo{" "}
                <span className="font-semibold text-ink-900">total de pontos</span>. Deu empate? O
                desempate segue nesta ordem:
              </p>
              <ol className="ml-1 space-y-1 text-sm text-ink-600">
                <li>
                  1. Mais <span className="font-semibold text-gold-700">cravadas</span> (placar exato)
                </li>
                <li>
                  2. Mais <span className="font-semibold text-grass-700">saldos</span> (diferença de
                  gols)
                </li>
                <li>
                  3. Maior <span className="font-semibold text-ink-900">aproveitamento</span> (pontos
                  feitos ÷ pontos possíveis)
                </li>
                <li>
                  4. <span className="font-semibold text-ink-900">Usuário mais antigo</span> (quem está
                  no Resultadismo há mais tempo)
                </li>
              </ol>
              <p className="text-xs leading-relaxed text-ink-500">
                Também mostramos a <span className="font-semibold">acertividade</span> (em quantos
                palpites você pontuou) — ótima pra estatística e pra zoeira no grupo.
              </p>
            </div>
          </Card>
        </Section>

        {/* Grupos */}
        <Section icon={<ShieldCheck className="size-4" strokeWidth={2.4} />} title="Grupos">
          <p className="-mt-1 text-sm leading-relaxed text-ink-600">
            O <span className="font-semibold text-ink-900">grupo</span> é o espaço onde você e seus
            amigos jogam. Nesta temporada, todo grupo joga o{" "}
            <span className="font-semibold text-ink-900">bolão da Copa do Mundo 2026</span>. Depois
            da Copa chegam outros campeonatos — Brasileirão, top 5 da Europa, Série B, Libertadores
            e Copa do Brasil.
          </p>
          <p className="text-sm leading-relaxed text-ink-600">
            Jogar, participar e <span className="font-semibold text-ink-900">criar grupos</span> é{" "}
            <span className="font-semibold text-grass-700">100% grátis</span> — sem taxa, sem
            mensalidade, sem anúncio. Ao criar, você define quem pode{" "}
            <span className="font-semibold text-ink-900">ver</span> e quem pode{" "}
            <span className="font-semibold text-ink-900">entrar</span> no grupo.
          </p>

          <div>
            <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-ink-400">
              Visibilidade — quem enxerga o grupo
            </h3>
            <Card className="divide-y divide-border">
              <OptionRow
                icon={<EyeOff className="size-4" strokeWidth={2.2} />}
                title="Privada"
                desc="Só aparece para quem é membro. Ninguém de fora encontra o grupo — ideal para a turma fechada de amigos."
              />
              <OptionRow
                icon={<Eye className="size-4" strokeWidth={2.2} />}
                title="Pública"
                desc="Qualquer pessoa pode encontrar e acompanhar o grupo. Como é aberta a todos, a entrada fica liberada automaticamente."
              />
            </Card>
          </div>

          <div>
            <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-ink-400">
              Forma de entrada — quem pode participar
            </h3>
            <Card className="divide-y divide-border">
              <OptionRow
                icon={<Mail className="size-4" strokeWidth={2.2} />}
                title="Convite"
                desc="Só entra quem recebe o código ou o link de convite do grupo — quem abre o link já chega com o código preenchido. O controle é todo seu."
              />
              <OptionRow
                icon={<UserCheck className="size-4" strokeWidth={2.2} />}
                title="Aprovação"
                desc="Qualquer um pode pedir para entrar, mas um administrador do grupo precisa aprovar antes."
              />
              <OptionRow
                icon={<DoorOpen className="size-4" strokeWidth={2.2} />}
                title="Aberta"
                desc="Entrada livre: quem quiser participar entra na hora, sem convite nem aprovação. (Grupos públicos usam sempre esta opção.)"
              />
            </Card>
          </div>

          <Card className="flex items-start gap-3 p-4">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-surface-2 text-brand-600">
              <Users className="size-4" strokeWidth={2.4} />
            </span>
            <p className="text-sm leading-relaxed text-ink-600">
              Em cada jogo, abra <span className="font-semibold text-ink-900">"Quem já palpitou"</span>{" "}
              pra ver quem do grupo está em dia — e{" "}
              <span className="font-semibold text-ink-900">cutucar</span> quem está devendo. Está em
              mais de um grupo? Filtre a lista por grupo e use a{" "}
              <Star className="inline size-3.5 -translate-y-px text-gold-500" aria-label="estrela" />{" "}
              pra fixar seus rivais favoritos no topo.
            </p>
          </Card>

          <div className="flex items-start gap-2 rounded-md bg-surface-2 p-3 text-xs leading-relaxed text-brand-800">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <p>
              Seu grupo fica <span className="font-semibold">ativo na hora</span>. Só o{" "}
              <span className="font-semibold">nome</span> passa por uma revisão rápida da moderação (pra
              evitar nomes ofensivos) — e você já joga normalmente enquanto isso.
            </p>
          </div>
        </Section>

        {/* Gestão do Bolão */}
        <Section icon={<HandCoins className="size-4" strokeWidth={2.4} />} title="Gestão do Bolão">
          <Card className="space-y-2 p-4">
            <p className="text-sm leading-relaxed text-ink-600">
              Seu grupo já combina um bolão entre amigos? A aba{" "}
              <span className="font-semibold text-ink-900">Gestão</span> do grupo ajuda a organizar:
              o admin marca <span className="font-semibold text-ink-900">quem pagou</span>, registra
              o <span className="font-semibold text-ink-900">valor da inscrição</span> e define a{" "}
              <span className="font-semibold text-ink-900">divisão do prêmio</span> (1º, 2º e 3º).
              Na classificação, um selo mostra quem está levando o quê — contando só quem
              participa do bolão.
            </p>
            <p className="text-sm leading-relaxed text-ink-600">
              Quando estiver tudo combinado, o{" "}
              <span className="font-semibold text-ink-900">dono do grupo pode travar</span> as
              definições pra ninguém mudar no meio da disputa.
            </p>
          </Card>
          <div className="flex items-start gap-2 rounded-md bg-surface-2 p-3 text-xs leading-relaxed text-brand-800">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-semibold">Nenhum dinheiro passa pelo Resultadismo.</span> O app
              só organiza a informação: pagamento e prêmio são combinados e acertados entre vocês,
              fora do app.
            </p>
          </div>
        </Section>

        {/* The Best */}
        <Section icon={<Globe2 className="size-4" strokeWidth={2.4} />} title="Resultadismo The Best">
          <Card className="p-4">
            <p className="text-sm leading-relaxed text-ink-600">
              Além dos seus grupos, existe a{" "}
              <span className="font-semibold text-ink-900">classificação geral</span> do
              Resultadismo: o <span className="font-semibold text-brand-700">The Best</span>, com
              todo mundo que topa participar. Você escolhe se aparece — e pode entrar ou sair quando
              quiser, lá no seu perfil.
            </p>
          </Card>
        </Section>

        {/* Personalização */}
        <Section
          icon={<SlidersHorizontal className="size-4" strokeWidth={2.4} />}
          title="Do seu jeito"
        >
          <Card className="space-y-2 p-4">
            <p className="text-sm leading-relaxed text-ink-600">
              No primeiro acesso você monta seu perfil: escudo, nome, estado,{" "}
              <span className="font-semibold text-ink-900">time do coração</span>, seleção e os
              campeonatos que quer acompanhar. Quer mudar algo depois? Tudo fica em{" "}
              <span className="font-semibold text-ink-900">Perfil → Editar perfil</span>, item por
              item.
            </p>
            <p className="text-sm leading-relaxed text-ink-600">
              Dica: <span className="font-semibold text-ink-900">ative as notificações</span> pra
              ser lembrado antes dos jogos — e{" "}
              <span className="font-semibold text-ink-900">instale o app</span> pra abrir num toque.
            </p>
          </Card>
        </Section>

        {/* CTA */}
        <div className="space-y-3 border-t border-border pt-6 text-center">
          <p className="text-sm font-medium text-ink-600">Pronto pra cravar?</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link to="/" className="sm:w-auto">
              <Button variant="outline" fullWidth>
                <Goal className="size-4" /> Ver os jogos
              </Button>
            </Link>
            {session ? (
              <Link to="/grupos/nova" className="sm:w-auto">
                <Button fullWidth>
                  <Trophy className="size-4" /> Criar um grupo
                </Button>
              </Link>
            ) : (
              <div className="sm:w-auto">
                <Button
                  fullWidth
                  onClick={() => {
                    track("cta_click", { location: "como_funciona" });
                    openLogin();
                  }}
                >
                  Entrar e jogar
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}
