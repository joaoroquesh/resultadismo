import { type ReactNode } from "react";
import changelogRaw from "../../../.claude/CHANGELOG.md?raw";

// Render leve do subconjunto de markdown usado no CHANGELOG.md (sem dependência):
// ## versão · ### seção · - bullets · > nota · --- divisória · **negrito** · `código` · [txt](url)→txt.

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
        <code key={k++} className="rounded bg-ink-100 px-1 py-0.5 text-[0.85em] text-ink-700">
          {m[2]}
        </code>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

function parse(md: string): ReactNode[] {
  // tira comentários HTML (gabarito) e junta linhas quebradas (continuação indentada com 2+ espaços)
  const noComments = md.replace(/<!--[\s\S]*?-->/g, "");
  const lines: string[] = [];
  for (const r of noComments.split("\n")) {
    if (/^ {2,}\S/.test(r) && lines.length && lines[lines.length - 1].trim() !== "") {
      lines[lines.length - 1] = lines[lines.length - 1].replace(/\s+$/, "") + " " + r.trim();
    } else {
      lines.push(r);
    }
  }

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
        <li key={k++} className="text-sm text-ink-600">
          {inline(line.slice(2))}
        </li>,
      );
      continue;
    }
    if (line.startsWith("> ")) {
      flushBullets();
      (quote ??= []).push(<p key={k++}>{inline(line.slice(2))}</p>);
      continue;
    }
    flush();
    if (line.trim() === "") continue;
    if (line === "---") {
      nodes.push(<hr key={k++} className="my-5 border-border" />);
      continue;
    }
    if (line.startsWith("# ")) continue; // título do arquivo (já temos o cabeçalho da aba)
    if (line.startsWith("## ")) {
      nodes.push(
        <h3 key={k++} className="mb-1 mt-6 text-[15px] font-bold text-brand-700">
          {inline(line.slice(3))}
        </h3>,
      );
      continue;
    }
    if (line.startsWith("### ")) {
      nodes.push(
        <h4 key={k++} className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wide text-ink-500">
          {inline(line.slice(4))}
        </h4>,
      );
      continue;
    }
    nodes.push(
      <p key={k++} className="my-1.5 text-sm text-ink-600">
        {inline(line)}
      </p>,
    );
  }
  flush();
  return nodes;
}

// O conteúdo é estático (inlined no build), então parseia uma vez só.
const CONTENT = parse(changelogRaw);

export function ChangelogTab() {
  return (
    <div>
      <p className="mb-3 text-sm text-ink-500">
        O que mudou em cada versão — do mais recente ao mais antigo.
      </p>
      <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">{CONTENT}</div>
    </div>
  );
}
