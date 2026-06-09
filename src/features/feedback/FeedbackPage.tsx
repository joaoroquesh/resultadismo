import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bug, Lightbulb, Send, CheckCircle2, Hammer, Archive, Clock } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { fromNow } from "@/lib/format";
import {
  useSubmitFeedback,
  useMyFeedback,
  type FeedbackKind,
  type FeedbackStatus,
  type MyFeedback,
} from "./api";

const BODY_MAX = 300;

// Páginas do app pra apontar onde o erro aconteceu (sem precisar mandar print).
const PAGES = [
  "Jogos / palpites",
  "Meus grupos",
  "Detalhe de um grupo",
  "Classificação (Resultadismo The Best)",
  "Confrontos / simulador",
  "Notificações",
  "Meu perfil",
  "Criar grupo",
  "Entrar / login",
  "Outra",
];

const STATUS_META: Record<FeedbackStatus, { label: string; tone: "neutral" | "gold" | "brand" | "grass"; icon: typeof Clock }> = {
  novo: { label: "Recebido", tone: "neutral", icon: Clock },
  backlog: { label: "No backlog", tone: "brand", icon: Hammer },
  resolvido: { label: "Resolvido", tone: "grass", icon: CheckCircle2 },
  arquivado: { label: "Arquivado", tone: "neutral", icon: Archive },
};

export function FeedbackPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const submit = useSubmitFeedback();
  const { data: mine, isLoading } = useMyFeedback();

  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [page, setPage] = useState(PAGES[0]);

  const canSend = title.trim().length > 0 && body.trim().length > 0 && body.length <= BODY_MAX;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || submit.isPending) return;
    submit.mutate(
      { kind, title: title.trim(), body: body.trim(), page: kind === "bug" ? page : null },
      {
        onSuccess: () => {
          toast(
            kind === "bug" ? "Report enviado! Valeu por ajudar 🙌" : "Sugestão enviada! Valeu 🙌",
            "success",
          );
          setTitle("");
          setBody("");
        },
        onError: (err) => toast(err instanceof Error ? err.message : "Não foi possível enviar.", "error"),
      },
    );
  }

  return (
    <Page
      title="Construa com a gente"
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate("/perfil")} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Convite */}
        <Card className="bg-surface-2 p-4 ring-1 ring-border">
          <h2 className="text-base font-extrabold text-brand-800">Construa o Resultadismo com a gente! 🛠️⚽</h2>
          <p className="mt-1 text-sm text-brand-900/80">
            Achou um erro ou tem uma ideia pra melhorar? Conta pra gente — a gente lê tudo, e te
            avisa aqui quando resolver.
          </p>
        </Card>

        {/* Formulário */}
        <Card className="p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Tipo */}
            <div className="grid grid-cols-2 gap-2">
              <KindButton active={kind === "bug"} onClick={() => setKind("bug")} icon={<Bug className="size-4" />} label="Reportar erro" />
              <KindButton active={kind === "idea"} onClick={() => setKind("idea")} icon={<Lightbulb className="size-4" />} label="Sugerir melhoria" />
            </div>

            <Input
              label="Título"
              placeholder={kind === "bug" ? "Ex.: Placar não atualiza" : "Ex.: Filtro por competição"}
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />

            <div>
              <label className="mb-1 block text-sm font-medium text-ink-700">
                {kind === "bug" ? "O que aconteceu?" : "Sua ideia"}
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                rows={4}
                placeholder={
                  kind === "bug"
                    ? "Descreva em poucas linhas o que deu errado e como reproduzir."
                    : "Descreva sua sugestão em poucas linhas."
                }
                className="w-full resize-none rounded-md border border-ink-200 bg-surface p-3 text-sm outline-none focus:border-brand-500"
              />
              <div className={cn("mt-1 text-right text-[11px]", body.length >= BODY_MAX ? "font-semibold text-flame-600" : "text-ink-400")}>
                {body.length}/{BODY_MAX}
              </div>
            </div>

            {/* Contexto — só pra erro */}
            {kind === "bug" && (
              <div className="space-y-2 rounded-md bg-ink-50 p-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-600">Em qual página?</label>
                  <Select
                    ariaLabel="Em qual página?"
                    value={page}
                    onChange={setPage}
                    options={PAGES.map((p) => ({ value: p, label: p }))}
                  />
                </div>
                <p className="text-[11px] leading-snug text-ink-400">
                  Pra ajudar a achar o erro, anexamos automaticamente a <strong>versão do app</strong> e
                  o <strong>seu navegador/aparelho</strong>. Sem dados pessoais.
                </p>
              </div>
            )}

            <Button type="submit" fullWidth loading={submit.isPending} disabled={!canSend}>
              <Send className="size-4" /> Enviar {kind === "bug" ? "report" : "sugestão"}
            </Button>
          </form>
        </Card>

        {/* Meus reports */}
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">Meus envios</h2>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !mine || mine.length === 0 ? (
            <EmptyState title="Nada enviado ainda" description="Seus reports e sugestões aparecem aqui, com o status." />
          ) : (
            mine.map((f) => <MyFeedbackRow key={f.id} f={f} />)
          )}
        </section>
      </div>
    </Page>
  );
}

function KindButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 text-sm font-semibold transition",
        active ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-surface text-ink-600 hover:bg-ink-100",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function MyFeedbackRow({ f }: { f: MyFeedback }) {
  const meta = STATUS_META[f.status];
  const Icon = meta.icon;
  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {f.kind === "bug" ? <Bug className="size-3.5 shrink-0 text-flame-500" /> : <Lightbulb className="size-3.5 shrink-0 text-gold-500" />}
            <p className="truncate font-semibold text-ink-900">{f.title}</p>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{f.body}</p>
        </div>
        <Badge tone={meta.tone}>
          <Icon className="mr-1 size-3" /> {meta.label}
        </Badge>
      </div>
      {f.admin_reply && (
        <div className="mt-2 rounded-md border-l-2 border-grass-600 bg-surface-2 p-2.5 text-xs text-grass-800">
          <span className="font-semibold">Resposta do time:</span> {f.admin_reply}
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-ink-400">enviado {fromNow(f.created_at)}</p>
    </Card>
  );
}
