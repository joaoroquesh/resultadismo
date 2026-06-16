import { useCallback, useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileX2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useStudyDoc, useStudyDocContent } from "./api";

export function EstudoViewerPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { resolved } = useTheme();
  const { data: doc, isLoading: loadingDoc } = useStudyDoc(slug);
  const {
    data: html,
    isLoading: loadingHtml,
    error,
  } = useStudyDocContent(doc?.storage_path);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // O srcdoc é same-origin (about:srcdoc), então dá pra injetar o tema do app no
  // documento. Altura: fixa por viewport com rolagem interna (auto-size pelo
  // conteúdo realimenta a medição em docs com alturas relativas — frágil).
  const sync = useCallback(() => {
    const cdoc = frameRef.current?.contentDocument;
    if (!cdoc?.documentElement) return;
    cdoc.documentElement.dataset.theme = resolved;
    cdoc.documentElement.style.colorScheme = resolved;
    // Baseline responsivo p/ QUALQUER estudo (inclusive legados/futuros): mídia
    // nunca estoura a largura e tabelas largas rolam no mobile, sem precisar
    // editar cada arquivo.
    if (cdoc.head && !cdoc.getElementById("rsd-responsive")) {
      const st = cdoc.createElement("style");
      st.id = "rsd-responsive";
      st.textContent =
        "img,svg,video,canvas{max-width:100%;height:auto}" +
        "@media (max-width:760px){table{display:block;width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}pre{overflow-x:auto}}";
      cdoc.head.appendChild(st);
    }
  }, [resolved]);

  // Reaplica o tema quando o usuário troca light/dark com o doc já aberto.
  useEffect(() => {
    sync();
  }, [sync, html]);

  const loading = loadingDoc || (loadingHtml && !!doc);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 pb-6 pt-4 lg:px-6 lg:pt-6">
      {/* barra de navegação — sempre dá pra voltar (Nielsen #3) */}
      <div className="mb-3 flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate("/admin/estudos")}>
          <ArrowLeft className="size-4" /> Estudos
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-ink-950">
          {doc?.title ?? "Estudo"}
        </h1>
        <Link
          to="/admin"
          className="shrink-0 rounded-pill px-3 py-1.5 text-sm font-semibold text-ink-600 hover:bg-ink-100"
        >
          Painel admin
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : !doc ? (
        <EmptyState
          icon={<FileX2 className="size-6" />}
          title="Estudo não encontrado"
          description="Ele pode ter sido removido do acervo."
          action={
            <Button size="sm" onClick={() => navigate("/admin/estudos")}>
              Voltar aos Estudos
            </Button>
          }
        />
      ) : error || html == null ? (
        <EmptyState
          icon={<FileX2 className="size-6" />}
          title="Não consegui abrir o arquivo"
          description={error instanceof Error ? error.message : "O conteúdo não pôde ser carregado."}
        />
      ) : (
        <iframe
          ref={frameRef}
          title={doc.title}
          srcDoc={html}
          onLoad={sync}
          sandbox="allow-same-origin allow-popups"
          className="block w-full rounded-2xl border border-border bg-surface"
          style={{ height: "calc(100dvh - 120px)" }}
        />
      )}
    </div>
  );
}
