// Home do Maneiger reformulado (TASK 2). Fluxo de cima pra baixo: manchete +
// descrição curta -> "Como funciona" enxuto (2-3 linhas) com "Saiba mais" abrindo o
// guia completo -> identidade de treinador (card do arquétipo, ou convite ao quiz) ->
// CTA primário "Jogar Mata-Mata 2026" (sorteio por dificuldade OU Brasil) -> "Selecionar
// Copa". Mobile-first, microinterações discretas (entrada escalonada, hover suave),
// prefers-reduced-motion coberto pelo kill-switch global do index.css.
import { latestEditionWithBrazil } from "./data";
import { ArchetypeCard } from "./ArchetypeQuiz";
import type { ArchetypeKey } from "./archetypes.ts";
import { CompassIcon, FlagIcon, ArrowRightIcon, BallIcon, BookIcon } from "./icons";

export type HomeAction = "quiz" | "playBrasil" | "selectCopa" | "how";

// ícone oficial (public/icons) num selo tintado. Glifo cinza-escuro fixo, legível em
// qualquer superfície; o container dá a cor de marca. Usado nas 3 linhas do "Como funciona".
function StepGlyph({ src }: { src: string }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-brand-500/12">
      <img src={src} alt="" aria-hidden width={17} height={17} className="opacity-80" />
    </span>
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

  // 3 passos curtos do "Como funciona" (2-3 linhas no total), cada um com um ícone oficial.
  const comoFunciona: { src: string; text: string }[] = [
    { src: "/icons/copa.svg", text: "Pegue uma seleção e monte a tática antes de ver o rival." },
    { src: "/icons/jogos.svg", text: "Assista ao jogo ao vivo e ajuste a postura na hora." },
    { src: "/icons/premiacao.svg", text: "Vire a chave no intervalo e decida no detalhe." },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* manchete + descrição */}
      <header className="animate-rise text-center" style={{ animationDelay: "0ms" }}>
        <div className="mx-auto flex w-fit items-center gap-1.5 rounded-full bg-brand-500/12 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-700">
          <BallIcon size={14} color="var(--color-brand-600)" /> Maneiger
        </div>
        <h1 className="mt-3 text-[30px] font-black leading-[1.05] tracking-tight text-ink-900">
          Você no comando<br />da seleção
        </h1>
        <p className="mx-auto mt-2.5 max-w-[36ch] text-[14px] leading-snug text-ink-500">
          Monte a tática às cegas, leia o jogo ao vivo e vire a chave no intervalo. Copa curta, decisão no detalhe.
        </p>
      </header>

      {/* Como funciona (enxuto) + Saiba mais */}
      <section className="animate-rise rounded-[18px] border border-border bg-surface p-4" style={{ animationDelay: "60ms" }} aria-labelledby="home-como-h">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="home-como-h" className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-ink-500">Como funciona</h2>
          <button
            type="button"
            onClick={() => onAction("how")}
            className="group flex items-center gap-0.5 text-[12px] font-bold text-brand-700 hover:text-brand-800"
          >
            Saiba mais
            <ArrowRightIcon size={13} className="transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
          </button>
        </div>
        <ul className="flex flex-col gap-2.5">
          {comoFunciona.map((s, i) => (
            <li key={i} className="flex items-center gap-3">
              <StepGlyph src={s.src} />
              <span className="text-[12.5px] leading-snug text-ink-700">{s.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* identidade de treinador */}
      <section className="animate-rise" style={{ animationDelay: "120ms" }} aria-label="Sua identidade de treinador">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-ink-500">Sua identidade de treinador</h2>
          {archetype && (
            <button type="button" onClick={() => onAction("quiz")} className="text-[12px] font-bold text-brand-700 hover:text-brand-800">
              Refazer
            </button>
          )}
        </div>
        {archetype ? (
          <button type="button" onClick={() => onAction("quiz")} className="block w-full text-left transition-transform duration-200 ease-out active:scale-[0.99]">
            <ArchetypeCard keyId={archetype} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onAction("quiz")}
            className="group flex w-full items-center gap-3.5 rounded-[16px] border border-dashed border-brand-400/60 bg-brand-500/[0.05] p-4 text-left transition-[transform,border-color,background-color] duration-200 ease-out hover:border-brand-500 hover:bg-brand-500/[0.09] active:scale-[0.99]"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-500/15 text-brand-700">
              <CompassIcon size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-bold text-ink-900">Descubra a sua escola</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-ink-500">
                5 perguntas rápidas revelam o seu estilo de treinador. Ele dá um tempero à sua tática. Opcional.
              </span>
            </span>
            <ArrowRightIcon size={18} className="text-brand-500 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
          </button>
        )}
      </section>

      {/* ações de jogo */}
      <section className="animate-rise flex flex-col gap-2.5" style={{ animationDelay: "180ms" }} aria-label="Começar a jogar">
        {/* CTA primário: sorteio por dificuldade (Sua seleção), com a favorita/Brasil no topo */}
        <button
          type="button"
          onClick={() => onAction("playBrasil")}
          className="group relative flex w-full items-center gap-4 overflow-hidden rounded-[18px] bg-brand-600 p-4 text-left text-white shadow-[var(--shadow-brand)] transition-[transform,background-color] duration-200 ease-out hover:bg-brand-700 active:scale-[0.98]"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-white/15">
            <img src="/icons/copa.svg" alt="" aria-hidden width={26} height={26} className="brightness-0 invert" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-[17px] font-black leading-tight">Jogar Mata-Mata {year}</span>
              <span className="rounded-full bg-white/20 px-1.5 py-px text-[9.5px] font-black uppercase tracking-wider">Começar</span>
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-white/85">
              Sorteie a sua dificuldade, da favorita à zebra, e comande o mata-mata.
            </span>
          </span>
          <ArrowRightIcon size={20} className="text-white/80 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
        </button>

        {/* secundário: picker manual de edição + seleção */}
        <button
          type="button"
          onClick={() => onAction("selectCopa")}
          className="group flex w-full items-center gap-3.5 rounded-[16px] border border-border bg-surface p-4 text-left text-ink-900 transition-[transform,border-color,background-color] duration-200 ease-out hover:border-brand-400 hover:bg-surface-2 active:scale-[0.98]"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-500/12 text-brand-700">
            <FlagIcon size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold leading-tight">Selecionar Copa</span>
            <span className="mt-0.5 block text-[12px] leading-snug text-ink-500">Escolha a edição e a seleção que você quiser, na mão.</span>
          </span>
          <ArrowRightIcon size={18} className="text-ink-400 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
        </button>
      </section>
    </div>
  );
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
