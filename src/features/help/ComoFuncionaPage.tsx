import { type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Target,
  Scale,
  CheckCircle2,
  Zap,
  Trophy,
  ListOrdered,
  Eye,
  EyeOff,
  Mail,
  UserCheck,
  DoorOpen,
  ShieldCheck,
  Goal,
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
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-500/10 text-brand-600">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Cartão de pontuação no padrão visual do selo +3/+2/+1. */
function ScoreRow({
  pts,
  title,
  desc,
  pill,
  text,
  icon,
}: {
  pts: string;
  title: string;
  desc: string;
  pill: string;
  text: string;
  icon: ReactNode;
}) {
  return (
    <Card className="flex items-center gap-3 p-3.5">
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
        <div className="rounded-lg bg-brand-500/10 p-4">
          <p className="text-sm leading-relaxed text-ink-700">
            No <span className="font-bold text-brand-700">Resultadismo</span> você crava o placar dos
            jogos antes da bola rolar. Quanto mais perto do resultado real, mais pontos você ganha — e
            sobe na classificação das suas federações. Aqui vão as regras, sem complicação.
          </p>
        </div>

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
            />
            <ScoreRow
              pts="+2"
              title="Saldo"
              desc="Errou o placar exato, mas acertou a diferença de gols (ex.: palpitou 2×0, deu 3×1). Cravar o empate também conta aqui (ex.: palpitou 1×1, deu 2×2)."
              pill="bg-grass-600"
              text="text-white"
              icon={<Scale className="size-4 text-grass-600" strokeWidth={2.4} />}
            />
            <ScoreRow
              pts="+1"
              title="Acerto"
              desc="Acertou só quem venceu, mas errou o saldo de gols (ex.: palpitou 2×0, deu 1×0)."
              pill="bg-aqua-700"
              text="text-white"
              icon={<CheckCircle2 className="size-4 text-aqua-700" strokeWidth={2.4} />}
            />
            <ScoreRow
              pts="0"
              title="Errou"
              desc="O resultado foi diferente do que você palpitou. Faz parte — bola pra frente."
              pill="bg-ink-200"
              text="text-ink-500"
              icon={<Goal className="size-4 text-ink-400" strokeWidth={2.4} />}
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
            <p className="rounded-md bg-brand-500/10 px-3 py-2 text-xs font-medium text-brand-700">
              Atenção: você tem no máximo{" "}
              <span className="font-bold">2 dobros por semana</span> (de segunda a domingo). Use com
              estratégia — e cuidado, se errar o jogo dobrado você não perde pontos, mas perde a
              chance de multiplicar.
            </p>
          </Card>
        </Section>

        {/* Modos de disputa */}
        <Section
          icon={<Trophy className="size-4" strokeWidth={2.4} />}
          title="Como a disputa funciona"
        >
          <p className="-mt-1 text-sm leading-relaxed text-ink-600">
            Toda federação acompanha uma competição (um campeonato de futebol). Ao criar a federação, você
            escolhe <span className="font-semibold text-ink-900">como os pontos são contados</span>:
          </p>
          <div className="space-y-2">
            <Card className="space-y-1.5 p-4">
              <p className="flex items-center gap-2 font-bold text-ink-900">
                <ListOrdered className="size-4 text-brand-600" strokeWidth={2.4} />
                Modo Tabela
              </p>
              <p className="text-sm leading-relaxed text-ink-600">
                Vale o campeonato <span className="font-semibold text-ink-900">inteiro</span>: cada
                jogo que tem na competição conta, do começo ao fim. Os pontos vão somando rodada após
                rodada e formam uma classificação única — ótimo para uma disputa longa entre os
                amigos.
              </p>
            </Card>
            <Card className="space-y-1.5 p-4">
              <p className="flex items-center gap-2 font-bold text-ink-900">
                <Zap className="size-4 text-brand-600" strokeWidth={2.4} />
                Modo Pontos
              </p>
              <p className="text-sm leading-relaxed text-ink-600">
                Foco em <span className="font-semibold text-ink-900">acumular pontos</span> nos jogos
                da competição, com a corrida sempre baseada em quem somou mais. A leitura é direta:
                quem pontuou mais, lidera.
              </p>
            </Card>
          </div>
          <Card className="flex items-start gap-3 p-4">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-brand-500/10 text-brand-600">
              <Trophy className="size-4" strokeWidth={2.4} />
            </span>
            <div className="space-y-1">
              <p className="font-semibold text-ink-900">Quem está ganhando?</p>
              <p className="text-sm leading-relaxed text-ink-600">
                Em qualquer modo, a classificação ordena os jogadores pelo total de pontos — quem tem
                mais fica no topo. Você também vê o número de{" "}
                <span className="font-semibold text-gold-700">cravadas</span> e o{" "}
                <span className="font-semibold text-ink-900">aproveitamento</span> de cada um (a
                porcentagem dos pontos possíveis que a pessoa conquistou), bons critérios de desempate
                e de pura zoeira no grupo.
              </p>
            </div>
          </Card>
        </Section>

        {/* Federações */}
        <Section icon={<ShieldCheck className="size-4" strokeWidth={2.4} />} title="Federações">
          <p className="-mt-1 text-sm leading-relaxed text-ink-600">
            Federação é o seu grupo de disputa. Ao criar uma, você define duas coisas: quem pode{" "}
            <span className="font-semibold text-ink-900">ver</span> a federação e quem pode{" "}
            <span className="font-semibold text-ink-900">entrar</span> nela.
          </p>

          <div>
            <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-ink-400">
              Visibilidade — quem enxerga a federação
            </h3>
            <Card className="divide-y divide-border">
              <OptionRow
                icon={<EyeOff className="size-4" strokeWidth={2.2} />}
                title="Privada"
                desc="Só aparece para quem é membro. Ninguém de fora encontra a federação — ideal para a turma fechada de amigos."
              />
              <OptionRow
                icon={<Eye className="size-4" strokeWidth={2.2} />}
                title="Pública"
                desc="Qualquer pessoa pode encontrar e acompanhar a federação. Como é aberta a todos, a entrada fica liberada automaticamente."
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
                desc="Só entra quem recebe o código de convite da federação. O controle é todo seu."
              />
              <OptionRow
                icon={<UserCheck className="size-4" strokeWidth={2.2} />}
                title="Aprovação"
                desc="Qualquer um pode pedir para entrar, mas um administrador da federação precisa aprovar antes."
              />
              <OptionRow
                icon={<DoorOpen className="size-4" strokeWidth={2.2} />}
                title="Aberta"
                desc="Entrada livre: quem quiser participar entra na hora, sem convite nem aprovação. (Federações públicas usam sempre esta opção.)"
              />
            </Card>
          </div>

          <div className="flex items-start gap-2 rounded-md bg-brand-500/10 p-3 text-xs leading-relaxed text-brand-800">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <p>
              Para evitar abusos, toda federação nova passa por uma{" "}
              <span className="font-semibold">aprovação rápida</span> de um administrador do
              Resultadismo antes de ficar ativa. É coisa de pouco tempo.
            </p>
          </div>
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
              <Link to="/federacoes/nova" className="sm:w-auto">
                <Button fullWidth>
                  <Trophy className="size-4" /> Criar uma federação
                </Button>
              </Link>
            ) : (
              <Link to="/login" className="sm:w-auto">
                <Button fullWidth>Entrar e jogar</Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}
