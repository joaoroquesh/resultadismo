import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import changelogRaw from "../../../.claude/CHANGELOG.md?raw";

// Render leve do subconjunto de markdown do CHANGELOG.md (sem dependência):
// cada "## versão" vira um accordion; dentro: ### seção · - bullets · > nota ·
// --- divisória · **negrito** · `código` · [txt](url)→txt.

function inline(text: string): ReactNode[] {
  const s = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // [texto](url) -> texto
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(
        <strong key={k++} className="font-semibold text-ink-900">
          {m[1]}
        </strong>,
      );
    } else {
      out.push(
        <code
          key={k++}
          className="break-all rounded bg-ink-100 px-1 py-0.5 text-[0.85em] text-ink-700"
        >
          {m[2]}
        </code>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

// Renderiza as linhas internas de uma versão (bullets/notas/sub-seções/parágrafos).
function renderBody(lines: string[]): ReactNode[] {
  const nodes: ReactNode[] = [];
  let bullets: ReactNode[] | null = null;
  let quote: ReactNode[] | null = null;
  let k = 0;
  const flushBullets = () => {
    if (bullets) {
      nodes.push(
        <ul key={k++} className="my-2 list-disc space-y-1.5 pl-5 marker:text-ink-300">
          {bullets}
        </ul>,
      );
      bullets = null;
    }
  };
  const flushQuote = () => {
    if (quote) {
      nodes.push(
        <blockquote
          key={k++}
          className="my-2 space-y-1 border-l-2 border-brand-300 pl-3 text-sm text-ink-500"
        >
          {quote}
        </blockquote>,
      );
      quote = null;
    }
  };
  const flush = () => {
    flushBullets();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.startsWith("- ")) {
      flushQuote();
      (bullets ??= []).push(
        <li key={k++} className="break-words text-sm text-ink-600">
          {inline(line.slice(2))}
        </li>,
      );
      continue;
    }
    if (line.startsWith("> ")) {
      flushBullets();
      (quote ??= []).push(
        <p key={k++} className="break-words">
          {inline(line.slice(2))}
        </p>,
      );
      continue;
    }
    flush();
    if (line.trim() === "") continue;
    if (line === "---") {
      nodes.push(<hr key={k++} className="my-4 border-border" />);
      continue;
    }
    if (line.startsWith("### ")) {
      nodes.push(
        <h4
          key={k++}
          className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wide text-ink-500"
        >
          {inline(line.slice(4))}
        </h4>,
      );
      continue;
    }
    nodes.push(
      <p key={k++} className="my-1.5 break-words text-sm text-ink-600">
        {inline(line)}
      </p>,
    );
  }
  flush();
  return nodes;
}

type Block = { ver: string; date: string | null; body: string[] };

// Quebra o markdown em blocos por versão ("## "), juntando linhas quebradas
// (continuação indentada com 2+ espaços) e tirando o comentário-gabarito.
function toBlocks(md: string): Block[] {
  const noComments = md.replace(/<!--[\s\S]*?-->/g, "");
  const lines: string[] = [];
  for (const r of noComments.split("\n")) {
    if (/^ {2,}\S/.test(r) && lines.length && lines[lines.length - 1].trim() !== "") {
      lines[lines.length - 1] = lines[lines.length - 1].replace(/\s+$/, "") + " " + r.trim();
    } else {
      lines.push(r);
    }
  }
  const blocks: Block[] = [];
  let cur: Block | null = null;
  for (const line of lines) {
    if (line.startsWith("## ")) {
      const title = line.slice(3).trim();
      const m = title.match(/^\[([^\]]+)\]\s*(?:—\s*(.+))?$/);
      cur = { ver: m ? m[1] : title, date: m?.[2] ?? null, body: [] };
      blocks.push(cur);
      continue;
    }
    if (line.startsWith("# ")) continue; // título do arquivo
    if (cur) cur.body.push(line);
  }
  return blocks;
}

const BLOCKS = toBlocks(changelogRaw);

export function ChangelogTab() {
  // Primeira versão (mais recente) já aberta; resto fechado.
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="min-w-0 max-w-full">
      <p className="mb-3 text-sm text-ink-500">
        O que mudou em cada versão — toque para abrir. Do mais recente ao mais antigo.
      </p>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {BLOCKS.map((b, i) => {
          const isOpen = open.has(i);
          return (
            <div key={i} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-50"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="font-bold text-brand-700">{b.ver}</span>
                  {b.date && (
                    <span className="truncate text-xs font-normal text-ink-400">{b.date}</span>
                  )}
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-ink-400 transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              {isOpen && <div className="min-w-0 px-4 pb-4 pt-0">{renderBody(b.body)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
