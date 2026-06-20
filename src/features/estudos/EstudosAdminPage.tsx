import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, Plus, Trash2, Upload } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import {
  useDeleteStudyDoc,
  useStudyDocs,
  useUploadStudyDoc,
  type StudyDoc,
} from "./api";

const CATEGORIAS = ["Gamificação", "Retrô", "Confrontos", "Planos", "Geral"];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function EstudosAdminPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: docs, isLoading } = useStudyDocs();
  const del = useDeleteStudyDoc();
  const [adding, setAdding] = useState(false);

  const grouped = (docs ?? []).reduce<Record<string, StudyDoc[]>>((acc, d) => {
    (acc[d.category] ??= []).push(d);
    return acc;
  }, {});

  async function onDelete(d: StudyDoc) {
    if (!window.confirm(`Remover o estudo "${d.title}"? O arquivo sai do acervo.`)) return;
    try {
      await del.mutateAsync({ slug: d.slug, storage_path: d.storage_path });
      toast("Estudo removido.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Falha ao remover.", "error");
    }
  }

  return (
    <Page
      title="📚 Estudos"
      wide
      action={
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/admin")}
          aria-label="Voltar ao painel admin"
        >
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          Análises e estudos do produto, visíveis só para administradores.
        </p>
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="size-4" /> Adicionar
        </Button>
      </div>

      {adding && (
        <UploadForm
          onDone={() => {
            setAdding(false);
            toast("Estudo publicado no acervo.", "success");
          }}
        />
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (docs?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<FileText className="size-6" />}
          title="Nenhum estudo ainda"
          description="Suba o primeiro HTML em “Adicionar”. Ele fica guardado só para admins."
        />
      ) : (
        <div className="space-y-7">
          {Object.entries(grouped).map(([cat, list]) => (
            <section key={cat}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">{cat}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((d) => (
                  <article
                    key={d.id}
                    className="flex flex-col rounded-2xl border border-border bg-surface p-4 transition hover:border-brand-600"
                  >
                    <Link to={`/admin/estudos/${d.slug}`} className="group flex-1">
                      <h3 className="font-bold text-ink-950 group-hover:text-brand-700">{d.title}</h3>
                      {d.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-ink-500">{d.description}</p>
                      )}
                    </Link>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-ink-400">{fmtDate(d.created_at)}</span>
                      <div className="flex items-center gap-1">
                        <Link
                          to={`/admin/estudos/${d.slug}`}
                          className="rounded-pill px-3 py-1 text-sm font-semibold text-brand-700 hover:bg-ink-100"
                        >
                          Abrir →
                        </Link>
                        <button
                          type="button"
                          onClick={() => onDelete(d)}
                          aria-label={`Remover ${d.title}`}
                          className="rounded-pill p-1.5 text-ink-400 hover:bg-ink-100 hover:text-flame-600"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}

function UploadForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const upload = useUploadStudyDoc();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Geral");
  const [description, setDescription] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return toast("Escolha um arquivo .html.", "error");
    if (!title.trim()) return toast("Dê um título.", "error");
    try {
      await upload.mutateAsync({ file, title, category, description });
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Falha no upload.", "error");
    }
  }

  const field = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <form onSubmit={onSubmit} className="mb-5 space-y-3 rounded-2xl border border-border bg-surface-2 p-4">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-ink-600">Arquivo .html</span>
        <input
          type="file"
          accept=".html,text/html"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            if (f && !title) setTitle(f.name.replace(/\.html?$/i, ""));
          }}
          className={cn(field, "file:mr-3 file:rounded-pill file:border-0 file:bg-brand-600 file:px-3 file:py-1 file:text-white")}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-600">Título</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="Ex.: Análise de gamificação" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-600">Categoria</span>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            list="estudo-categorias"
            className={field}
          />
          <datalist id="estudo-categorias">
            {CATEGORIAS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-ink-600">Descrição (opcional)</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={field} placeholder="Resumo de uma linha" />
      </label>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={upload.isPending}>
          <Upload className="size-4" /> Publicar estudo
        </Button>
      </div>
    </form>
  );
}
