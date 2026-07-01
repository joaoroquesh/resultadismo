// Feedback de sinal individual (nunca um total). Os 5 estados do motor
// (pp/p/z/m/mm) viram cor + ícone + frase curta. A cor segue o sistema de
// pontuação do Resultadismo: grass/aqua positivo, ink neutro, flame negativo.
// Reaproveitado pela tática às cegas (coerência) e pelo intervalo (encaixe).
import type { SignalLevel, Tactic } from "./tactics.ts";
import { toSignal } from "./tactics.ts";
import type { ArchetypeKey } from "./archetypes.ts";
import { archetypeBonus, ARCHETYPES } from "./archetypes.ts";
import { ArrowUpIcon, ArrowDownIcon, EqualIcon, CheckIcon, CompassIcon } from "./icons";

// ==== aparência por nível (sem número, só sinal) ====
interface LevelStyle {
  label: string;       // rótulo curto do nível
  chipBg: string;      // fundo da pílula
  chipText: string;    // cor do texto/ícone na pílula
  Icon: typeof CheckIcon;
}

const LEVEL: Record<SignalLevel, LevelStyle> = {
  pp: { label: "Casou", chipBg: "bg-grass-500/18", chipText: "text-grass-700", Icon: CheckIcon },
  p:  { label: "Combina", chipBg: "bg-aqua-500/18", chipText: "text-aqua-700", Icon: ArrowUpIcon },
  z:  { label: "Neutro", chipBg: "bg-ink-400/15", chipText: "text-ink-600", Icon: EqualIcon },
  m:  { label: "Atrito", chipBg: "bg-flame-500/14", chipText: "text-flame-700", Icon: ArrowDownIcon },
  mm: { label: "Briga", chipBg: "bg-flame-500/20", chipText: "text-flame-700", Icon: ArrowDownIcon },
};

export function levelLabel(level: SignalLevel): string {
  return LEVEL[level].label;
}

// pílula compacta de nível (usada inline na linha do sinal)
export function SignalChip({ level, className = "" }: { level: SignalLevel; className?: string }) {
  const s = LEVEL[level];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide ${s.chipBg} ${s.chipText} ${className}`}
    >
      <s.Icon size={12} />
      {s.label}
    </span>
  );
}

// ==== títulos e frases por chave de sinal ====
// Coerência (tática às cegas, sem o rival): formação x estilos x bloco.
const COHERENCE_TITLE: Record<string, string> = {
  formacao_combola: "Formação e ataque",
  formacao_sembola: "Formação e marcação",
  sembola_bloco: "Marcação e bloco",
};
const COHERENCE_PHRASE: Record<string, Partial<Record<SignalLevel, string>>> = {
  formacao_combola: {
    pp: "O desenho serve o seu jeito de atacar como uma luva.",
    p: "A formação ajuda o estilo de ataque escolhido.",
    z: "Formação e ataque convivem, sem somar nem atrapalhar.",
    m: "O desenho briga um pouco com esse jeito de atacar.",
    mm: "A formação rema contra o seu ataque.",
  },
  formacao_sembola: {
    pp: "A formação dá a base perfeita pra marcar assim.",
    p: "O desenho sustenta bem a marcação escolhida.",
    z: "Marcação e formação ficam no zero a zero.",
    m: "A marcação fica desconfortável nesse desenho.",
    mm: "A formação deixa a marcação exposta.",
  },
  sembola_bloco: {
    pp: "A altura do bloco potencializa a marcação.",
    p: "Bloco e marcação trabalham juntos.",
    z: "Altura de bloco neutra pra essa marcação.",
    m: "O bloco escolhido atrapalha a marcação.",
    mm: "Bloco e marcação se anulam de vez.",
  },
};

// Encaixe (intervalo, rival revelado): como minha tática casa com a do adversário.
const MATCHUP_TITLE: Record<string, string> = {
  ataque_vs_defesa: "Seu ataque x a marcação rival",
  defesa_vs_ataque: "Sua marcação x o ataque rival",
  ataque_vs_bloco: "Seu ataque x o bloco rival",
  ataque_rival_vs_meu_bloco: "O ataque rival x o seu bloco",
  formacao_vs_formacao: "Desenho contra desenho",
};
const MATCHUP_PHRASE: Record<string, Partial<Record<SignalLevel, string>>> = {
  ataque_vs_defesa: {
    pp: "Seu ataque encontra a brecha exata na marcação deles.",
    p: "Seu jeito de atacar incomoda a marcação rival.",
    z: "Ataque e marcação rival se equilibram.",
    m: "A marcação deles segura o seu ataque.",
    mm: "A marcação rival anula o seu ataque.",
  },
  defesa_vs_ataque: {
    pp: "Sua marcação desarma o ataque deles antes de nascer.",
    p: "Sua marcação leva a melhor sobre o ataque rival.",
    z: "Defesa e ataque rival ficam parelhos.",
    m: "O ataque deles incomoda a sua marcação.",
    mm: "O ataque rival fura a sua marcação.",
  },
  ataque_vs_bloco: {
    pp: "Seu ataque explora o espaço que o bloco deles deixa.",
    p: "Seu ataque se dá bem contra o bloco rival.",
    z: "Ataque e bloco rival sem vantagem clara.",
    m: "O bloco deles dificulta o seu ataque.",
    mm: "O bloco rival fecha as suas saídas.",
  },
  ataque_rival_vs_meu_bloco: {
    pp: "Seu bloco rouba o tempo do ataque deles.",
    p: "Seu bloco atrapalha o ataque rival.",
    z: "Bloco e ataque rival se neutralizam.",
    m: "O ataque deles aproveita brechas do seu bloco.",
    mm: "O ataque rival rasga o seu bloco.",
  },
  formacao_vs_formacao: {
    pp: "Seu desenho domina o duelo de formações.",
    p: "Seu desenho leva leve vantagem no duelo.",
    z: "Os dois desenhos se equivalem.",
    m: "O desenho deles leva leve vantagem.",
    mm: "O desenho rival domina o duelo.",
  },
};

export function coherenceTitle(key: string): string {
  return COHERENCE_TITLE[key] ?? key;
}
export function coherencePhrase(key: string, level: SignalLevel): string {
  return COHERENCE_PHRASE[key]?.[level] ?? "";
}
export function matchupTitle(key: string): string {
  return MATCHUP_TITLE[key] ?? key;
}
export function matchupPhrase(key: string, level: SignalLevel): string {
  return MATCHUP_PHRASE[key]?.[level] ?? "";
}

// Linha de sinal pronta: título + frase + chip de nível. Acessível (lista).
export function SignalRow({
  title,
  phrase,
  level,
}: {
  title: string;
  phrase: string;
  level: SignalLevel;
}) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-[12px] bg-surface-2 px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-[12.5px] font-bold text-ink-900">{title}</span>
        {phrase && <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-600">{phrase}</span>}
      </span>
      <SignalChip level={level} className="mt-0.5" />
    </li>
  );
}

// Lista de coerências (tática às cegas). signals vem de coherenceSignals(t).
export function CoherenceList({
  signals,
  className = "",
}: {
  signals: { key: string; level: SignalLevel }[];
  className?: string;
}) {
  return (
    <ul className={`flex flex-col gap-1.5 ${className}`} aria-label="Coerência da sua tática">
      {signals.map((s) => (
        <SignalRow key={s.key} title={coherenceTitle(s.key)} phrase={coherencePhrase(s.key, s.level)} level={s.level} />
      ))}
    </ul>
  );
}

// Lista de encaixes (intervalo). signals vem de matchupSignals(me, opp).
export function MatchupList({
  signals,
  className = "",
}: {
  signals: { key: string; level: SignalLevel }[];
  className?: string;
}) {
  return (
    <ul className={`flex flex-col gap-1.5 ${className}`} aria-label="Encaixe contra o adversário">
      {signals.map((s) => (
        <SignalRow key={s.key} title={matchupTitle(s.key)} phrase={matchupPhrase(s.key, s.level)} level={s.level} />
      ))}
    </ul>
  );
}

// ==== ENCAIXE POR IDENTIDADE DO TREINADOR (arquétipo) ====
// Um sinal individual de coerência A MAIS: o quanto a tática combina com a ESCOLA do
// treinador (archetypeBonus). Mesmo idioma (sinal + frase), nunca número cru. Só some
// se houver perfil escolhido. Entra na tática às cegas e no vestiário.
const IDENTITY_PHRASE: Partial<Record<SignalLevel, string>> = {
  pp: "É a cara da sua escola: o time joga do seu jeito.",
  p: "Combina com a sua escola de técnico.",
  z: "Neutro pra sua escola: nem a favor, nem contra.",
  m: "Foge um pouco do seu jeito de treinar.",
  mm: "Contraria a sua escola: você joga contra o seu instinto.",
};

export function identityFit(arch: ArchetypeKey, t: Tactic): { level: SignalLevel; title: string; phrase: string } {
  const level = toSignal(archetypeBonus(arch, t));
  return {
    level,
    title: `Combina com sua escola (${ARCHETYPES[arch].nome})`,
    phrase: IDENTITY_PHRASE[level] ?? "",
  };
}

// Linha pronta do encaixe de identidade (ícone de bússola + frase + chip). Standalone
// pra caber dentro do card de coerência existente, sem virar outra seção pesada.
export function IdentityFitRow({ arch, tac }: { arch: ArchetypeKey; tac: Tactic }) {
  const fit = identityFit(arch, tac);
  return (
    <div className="flex items-start justify-between gap-3 rounded-[12px] bg-brand-500/[0.06] px-3 py-2.5">
      <span className="flex min-w-0 items-start gap-2">
        <CompassIcon size={15} className="mt-0.5 shrink-0 text-brand-600" />
        <span className="min-w-0">
          <span className="block text-[12.5px] font-bold text-ink-900">{fit.title}</span>
          {fit.phrase && <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-600">{fit.phrase}</span>}
        </span>
      </span>
      <SignalChip level={fit.level} className="mt-0.5" />
    </div>
  );
}
