// Home do Maneiger reformulado: cards de entrada. "Jogar Mata-Mata 2026" é o
// primário (permite escolher o Brasil); perfil de técnico é opcional; "Selecionar
// Copa" abre o seletor de edição; "Como funciona" é um guia simples e completo.
import { latestEditionWithBrazil } from "./data";
import { ArchetypeCard } from "./ArchetypeQuiz";
import type { ArchetypeKey } from "./archetypes.ts";
import { CompassIcon, TrophyIcon, FlagIcon, BookIcon, ArrowRightIcon, BallIcon } from "./icons";

export type HomeAction = "quiz" | "playBrasil" | "selectCopa" | "how";

function Card({
  title,
  desc,
  Icon,
  primary,
  onClick,
  badge,
}: {
  title: string;
  desc: string;
  Icon: typeof TrophyIcon;
  primary?: boolean;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3.5 rounded-[16px] border p-4 text-left transition-[transform,border-color,box-shadow,background-color] duration-150 ease-out active:scale-[0.98] ${
        primary
          ? "border-transparent bg-brand-600 text-white shadow-[var(--shadow-brand)] hover:bg-brand-700"
          : "border-border bg-surface text-ink-900 hover:border-brand-400 hover:bg-surface-2"
      }`}
    >
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-full ${
          primary ? "bg-white/15 text-white" : "bg-brand-500/12 text-brand-700"
        }`}
      >
        <Icon size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[15.5px] font-bold leading-tight">{title}</span>
          {badge && (
            <span
              className={`rounded-full px-1.5 py-px text-[9.5px] font-black uppercase tracking-wider ${
                primary ? "bg-white/20 text-white" : "bg-gold-500/20 text-gold-700"
              }`}
            >
              {badge}
            </span>
          )}
        </span>
        <span className={`mt-0.5 block text-[12px] leading-snug ${primary ? "text-white/80" : "text-ink-500"}`}>{desc}</span>
      </span>
      <ArrowRightIcon size={18} className={primary ? "text-white/70" : "text-ink-400 transition-transform group-hover:translate-x-0.5"} />
    </button>
  );
}

export function Home({
  onAction,
  archetype,
}: {
  onAction: (a: HomeAction) => void;
  archetype: ArchetypeKey | null;
}) {
  const brasil = latestEditionWithBrazil();
  const year = brasil?.edition.year ?? 2026;
  return (
    <div className="flex flex-col gap-5">
      <header className="text-center">
        <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-brand-500/12 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-brand-700">
          <BallIcon size={14} color="var(--color-brand-600)" /> Maneiger
        </div>
        <h1 className="mt-3 text-[26px] font-black leading-tight text-ink-900">Você no comando da seleção</h1>
        <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-snug text-ink-500">
          Monte a tática às cegas, leia o jogo ao vivo e ajuste no intervalo. Copa curta, decisão no detalhe.
        </p>
      </header>

      <div className="flex flex-col gap-2.5">
        <Card
          title={`Jogar Mata-Mata ${year}`}
          desc="Comande o Brasil direto, ou escolha outra seleção."
          Icon={TrophyIcon}
          primary
          badge="Começar"
          onClick={() => onAction("playBrasil")}
        />
        <Card
          title="Perfil de técnico"
          desc={archetype ? `Seu perfil: ${labelFor(archetype)}. Toque para refazer.` : "5 perguntas para achar a sua escola. Opcional."}
          Icon={CompassIcon}
          onClick={() => onAction("quiz")}
        />
        <Card title="Selecionar Copa" desc="Escolha a edição e a seleção que quiser." Icon={FlagIcon} onClick={() => onAction("selectCopa")} />
        <Card title="Como funciona" desc="Entenda o jogo em um minuto." Icon={BookIcon} onClick={() => onAction("how")} />
      </div>

      {archetype && (
        <section aria-label="Seu perfil de técnico">
          <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">Seu técnico</div>
          <ArchetypeCard keyId={archetype} />
        </section>
      )}
    </div>
  );
}

function labelFor(k: ArchetypeKey): string {
  return (
    {
      posicional: "Posicional",
      reativo: "Reativo",
      intenso: "Intenso",
      equilibrista: "Equilibrista",
      relacional: "Relacional",
      copeiro: "Copeiro",
    } as Record<ArchetypeKey, string>
  )[k];
}

// ==== Como funciona (guia simples e completo, in-page) ====
export function HowItWorks({ onBack, onPlay }: { onBack: () => void; onPlay: () => void }) {
  const steps: { n: string; title: string; body: string }[] = [
    { n: "1", title: "Escolha a seleção", body: "Pegue o Brasil ou qualquer seleção de qualquer edição. Cada uma tem forças de ataque, meio, defesa e físico." },
    { n: "2", title: "Monte a tática às cegas", body: "Você ainda não vê o adversário. No modo Rápido, parta de um plano pronto. No Tático, escolha formação, jeito de jogar com e sem a bola, altura do bloco e a postura." },
    { n: "3", title: "Leia a coerência", body: "O jogo mostra, por sinal e frase, se as suas escolhas combinam entre si. Verde casou, vermelho briga. Nunca uma nota geral: cada peça fala por si." },
    { n: "4", title: "Assista ao jogo ao vivo", body: "O placar, a posse e a narração rolam em tempo real. Você controla a velocidade (1x, 2x, 4x), pode pausar e pular o tempo. No meio do jogo, o único ajuste é a postura." },
    { n: "5", title: "Ajuste no intervalo", body: "No vestiário o adversário é revelado. Aí você vê o encaixe da sua tática contra a dele e pode replanejar o segundo tempo." },
    { n: "6", title: "Leia o resultado", body: "No fim, uma leitura honesta: o que a seleção mostrou, como foi o confronto com o rival e o que a sua escola de técnico somou." },
  ];
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 self-start text-[13px] font-semibold text-ink-600 hover:text-ink-900">
        <span className="grid size-5 place-items-center rounded-full bg-surface-2">
          <BookIcon size={13} />
        </span>
        Como funciona
      </button>
      <h2 className="text-[20px] font-black leading-tight text-ink-900">O jogo em seis passos</h2>

      <ol className="flex flex-col gap-2.5">
        {steps.map((s) => (
          <li key={s.n} className="flex items-start gap-3 rounded-[14px] border border-border bg-surface p-3.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-500/12 text-[13px] font-black text-brand-700">{s.n}</span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-bold text-ink-900">{s.title}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-600">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="rounded-[14px] bg-surface-2 p-3.5">
        <div className="text-[12px] font-bold text-ink-900">Sem números mágicos</div>
        <p className="mt-1 text-[12px] leading-snug text-ink-600">
          A única coisa em número é o que importa pro torcedor: o overall, as forças (ATA, MEI, DEF, FIS), a porcentagem de postura e as estatísticas do jogo. O acerto da tática é sempre sinal e frase, nunca uma nota secreta.
        </p>
      </div>

      <button
        type="button"
        onClick={onPlay}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 text-[15px] font-bold text-white shadow-[var(--shadow-brand)] transition-all hover:bg-brand-700 active:scale-[0.98]"
      >
        Bora jogar
        <ArrowRightIcon size={16} />
      </button>
    </div>
  );
}
