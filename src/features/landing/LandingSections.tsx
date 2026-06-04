import { useEffect, useRef, type ReactNode } from "react";
import {
  Target,
  Users,
  Swords,
  Trophy,
  Sparkles,
  Gift,
  ChevronDown,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Reveal on scroll — sobe suave quando entra na viewport.           */
/*  Respeita prefers-reduced-motion (animação some via CSS global).   */
/* ------------------------------------------------------------------ */
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "translate-y-3 opacity-0 transition-all duration-500 [transition-timing-function:var(--ease-out-quart)] [&.is-visible]:translate-y-0 [&.is-visible]:opacity-100",
        className,
      )}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

function SectionTitle({ kicker, title }: { kicker?: string; title: string }) {
  return (
    <div className="mb-5 text-center">
      {kicker && (
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">
          {kicker}
        </span>
      )}
      <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-ink-950 sm:text-3xl">
        {title}
      </h2>
    </div>
  );
}

function FeatureRow({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3.5 rounded-lg bg-surface p-4 shadow-[var(--shadow-soft)] ring-1 ring-border">
      <span className="grid size-11 shrink-0 place-items-center rounded-md bg-brand-500/10 text-brand-600">
        <Icon className="size-5.5" strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <h3 className="font-bold text-ink-950">{title}</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-500">{children}</p>
      </div>
    </div>
  );
}

/** Linha de pontuação — cor semântica vívida (dourado/verde/ciano) + exemplo real. */
function ScoreRow({
  pts,
  label,
  desc,
  tone,
  palpite,
  resultado,
}: {
  pts: number;
  label: string;
  desc: string;
  tone: "gold" | "grass" | "aqua";
  palpite: string;
  resultado: string;
}) {
  const styles = {
    gold: {
      chip: "bg-gold-100 text-gold-800 ring-gold-300/60",
      pts: "text-gold-700",
    },
    grass: {
      chip: "bg-grass-100 text-grass-800 ring-grass-300/60",
      pts: "text-grass-700",
    },
    aqua: {
      chip: "bg-aqua-100 text-aqua-800 ring-aqua-300/60",
      pts: "text-aqua-700",
    },
  }[tone];

  return (
    <div className="rounded-lg bg-surface p-3.5 shadow-[var(--shadow-soft)] ring-1 ring-border">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-md text-2xl font-extrabold tabular-nums ring-1 ring-inset",
            styles.chip,
          )}
        >
          +{pts}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink-950">{label}</p>
          <p className="text-sm text-ink-500">{desc}</p>
        </div>
        <span className={cn("shrink-0 text-sm font-bold tabular-nums", styles.pts)}>
          {pts} {pts === 1 ? "ponto" : "pontos"}
        </span>
      </div>
      {/* exemplo concreto: palpite → resultado */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-ink-100/70 px-3 py-2 text-xs">
        <span className="font-medium text-ink-400">Você palpita</span>
        <span className="rounded bg-surface px-1.5 py-0.5 font-bold tabular-nums text-ink-800 ring-1 ring-border">
          {palpite}
        </span>
        <ArrowRight className="size-3.5 text-ink-300" />
        <span className="font-medium text-ink-400">e o jogo termina</span>
        <span className="rounded bg-surface px-1.5 py-0.5 font-bold tabular-nums text-ink-800 ring-1 ring-border">
          {resultado}
        </span>
      </div>
    </div>
  );
}

function CompetitionPill({
  name,
  status,
}: {
  name: string;
  status: "ativa" | "em breve";
}) {
  const live = status === "ativa";
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-pill border px-4 py-2.5 text-sm font-semibold",
        live
          ? "border-brand-300 bg-brand-500/10 text-brand-800"
          : "border-dashed border-ink-200 bg-surface text-ink-400",
      )}
    >
      <span className="flex items-center gap-2">
        <Trophy className={cn("size-4", live ? "text-brand-600" : "text-ink-300")} />
        {name}
      </span>
      <span
        className={cn(
          "rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
          live ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-400",
        )}
      >
        {live ? "no ar" : "em breve"}
      </span>
    </div>
  );
}

/**
 * Seções de "venda" da home híbrida: aparecem ao rolar para visitantes
 * deslogados. Vendem o jogo (o que é, o que dá pra fazer, pontuação,
 * competições, preço) e terminam num CTA que abre o modal de login.
 */
export function LandingSections({ onOpenLogin }: { onOpenLogin: () => void }) {
  return (
    <div className="mt-10 space-y-16 pb-4">
      {/* divisor sutil entre os jogos e a parte de venda */}
      <div className="flex flex-col items-center gap-1 text-ink-300">
        <span className="text-xs font-semibold uppercase tracking-[0.18em]">
          Conheça o Resultadismo
        </span>
        <ChevronDown className="size-4 animate-bounce [animation-duration:2s]" />
      </div>

      {/* ---- HERO ---- */}
      <section>
        <Reveal className="rounded-xl bg-brand-600 px-6 py-9 text-center shadow-[var(--shadow-brand)] sm:px-8 sm:py-12">
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
            <Sparkles className="size-3.5" /> palpite e zoeira
          </span>
          <h1 className="mx-auto mt-4 max-w-md text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
            Crave o placar. Dispute com os amigos.
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-white/90">
            Palpite nos jogos de verdade, some pontos a cada acerto e veja quem manda no grupo.
            Sem planilha, só futebol e rivalidade boa.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <Button
              size="lg"
              onClick={onOpenLogin}
              className="bg-white text-brand-700 shadow-[var(--shadow-pop)] hover:bg-white/90"
            >
              Criar conta grátis
            </Button>
            <span className="text-xs text-white/80">Leva 10 segundos. É de graça.</span>
          </div>
        </Reveal>
      </section>

      {/* ---- O QUE VOCÊ PODE FAZER ---- */}
      <section>
        <SectionTitle kicker="O jogo" title="O que você pode fazer" />
        <div className="space-y-3">
          <Reveal>
            <FeatureRow icon={Target} title="Palpitar nos jogos">
              Para cada jogo, você dá um palpite de placar, tipo 2×1. Quanto mais perto do resultado
              real, mais pontos você leva.
            </FeatureRow>
          </Reveal>
          <Reveal delay={60}>
            <FeatureRow icon={Users} title="Criar ou entrar em grupos">
              Monte um grupo privado e chame a galera com um link. Trabalho, família, panela de
              amigos — você decide quem entra.
            </FeatureRow>
          </Reveal>
          <Reveal delay={120}>
            <FeatureRow icon={Swords} title="Enfrentar os amigos">
              Classificação que mexe a cada jogo. No fim, só sobra um pra contar vantagem no grupo.
            </FeatureRow>
          </Reveal>
        </div>
      </section>

      {/* ---- PONTUAÇÃO ---- */}
      <section>
        <SectionTitle kicker="Como pontua" title="Acertou, pontuou" />
        <Reveal>
          <div className="space-y-2.5">
            <ScoreRow
              tone="gold"
              pts={3}
              label="Cravou o placar"
              desc="Acertou em cheio: os gols dos dois times."
              palpite="2×1"
              resultado="2×1"
            />
            <ScoreRow
              tone="grass"
              pts={2}
              label="Acertou o saldo de gols"
              desc="Errou o placar, mas pegou a diferença. Cravar o empate também conta aqui."
              palpite="1×1"
              resultado="2×2"
            />
            <ScoreRow
              tone="aqua"
              pts={1}
              label="Acertou só quem venceu"
              desc="Foi no time certo, mas errou o saldo de gols."
              palpite="2×0"
              resultado="1×0"
            />
          </div>
          <p className="mt-3 text-center text-xs text-ink-400">
            Quanto mais perto do resultado real, mais ponto você leva.
          </p>
        </Reveal>
      </section>

      {/* ---- COMPETIÇÕES ---- */}
      <section>
        <SectionTitle kicker="Onde jogar" title="As competições" />
        <Reveal>
          <div className="space-y-2.5">
            <CompetitionPill name="Copa do Mundo 2026" status="ativa" />
            <CompetitionPill name="Brasileirão" status="em breve" />
            <CompetitionPill name="Libertadores" status="em breve" />
            <CompetitionPill name="Sul-Americana" status="em breve" />
            <CompetitionPill name="Copa do Brasil" status="em breve" />
          </div>
          <p className="mt-3 text-center text-xs text-ink-400">
            Começamos pela Copa. As outras vêm chegando — fique de olho.
          </p>
        </Reveal>
      </section>

      {/* ---- PREÇO ---- */}
      <section>
        <Reveal className="rounded-xl bg-surface-2 px-6 py-8 text-center ring-1 ring-border">
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-grass-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-grass-800">
            <Gift className="size-3.5" /> jogar é de graça
          </span>
          <h2 className="mx-auto mt-4 max-w-md text-2xl font-extrabold tracking-tight text-ink-950">
            Palpitar e disputar não custa nada
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-500">
            Criar a conta, cravar os placares e entrar nos grupos dos amigos é{" "}
            <span className="font-semibold text-ink-700">100% grátis</span>. Só quem quer{" "}
            <span className="font-semibold text-ink-700">criar a próprio grupo</span> — o espaço
            onde a sua turma joga — paga uma{" "}
            <span className="font-semibold text-ink-700">taxa única</span> (Pix ou cartão). É o que
            mantém o app no ar e sem anúncios.{" "}
            <span className="font-semibold text-grass-700">Na Copa, sai por R$ 9,90</span> (depois
            R$ 19,90).
          </p>
          <div className="mt-6">
            <Button size="lg" onClick={onOpenLogin}>
              Quero jogar agora
            </Button>
          </div>
        </Reveal>
      </section>

      {/* ---- CTA FINAL ---- */}
      <section>
        <Reveal className="text-center">
          <img src="/brand/Resultadismo.svg" alt="" className="mx-auto size-12 opacity-90" />
          <h2 className="mt-3 text-xl font-extrabold tracking-tight text-ink-950">
            Bora cravar o próximo placar?
          </h2>
          <p className="mx-auto mt-1 max-w-xs text-sm text-ink-500">
            Entre, chame a galera e comece a disputar.
          </p>
          <div className="mt-5">
            <Button size="lg" onClick={onOpenLogin}>
              Entrar e jogar
            </Button>
          </div>
          <p className="mt-8 text-xs text-ink-300">Feito pra torcedor. ⚽</p>
        </Reveal>
      </section>
    </div>
  );
}
