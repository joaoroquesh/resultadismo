import { useNavigate } from "react-router-dom";
import { ArrowLeft, Database } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useUnmappedTeams, useResolveUnmapped } from "./dataSources";

// Subpágina: times que a API entregou e NÃO estão no registro canônico
// (data/teams-registry). "Aceitar como veio" para de alertar; "copiar JSON"
// gera o trecho pra colar no registro (e rodar npm run gen:all).
export function QualidadeTimesForaPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useUnmappedTeams();
  const resolve = useResolveUnmapped();
  const { toast } = useToast();

  const slugOf = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const copySnippet = (u: NonNullable<typeof data>[number]) => {
    const snippet = JSON.stringify(
      {
        slug: slugOf(u.name),
        name_pt: u.name,
        short_pt: u.short_name ?? u.name,
        tla: u.tla,
        country: null,
        kind: "club",
        competitions: [],
        aliases: [u.name, ...(u.short_name && u.short_name !== u.name ? [u.short_name] : [])],
      },
      null,
      2,
    );
    void navigator.clipboard.writeText(snippet);
    toast("JSON copiado — cole no data/teams-registry.json e rode npm run gen:all.", "info");
  };

  return (
    <Page
      title="Times fora do registro"
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin?t=dados")} aria-label="Voltar para Qualidade">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      <p className="mb-4 text-sm text-ink-600">
        A API entregou estes times e eles não estão no registro canônico. Aceite como veio (fica com o
        nome/escudo da API) ou copie o JSON pra incluir no registro.
      </p>
      {isLoading ? (
        <Card className="h-40 animate-pulse" />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<Database className="size-7" />}
          title="Tudo no registro"
          description="Nenhum time fora do registro canônico no momento."
        />
      ) : (
        <Card className="divide-y divide-border">
          {data.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-3 py-2.5">
              {u.crest_url ? (
                <img src={u.crest_url} alt="" className="size-6 shrink-0 rounded-sm object-contain" />
              ) : (
                <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-ink-100 text-[10px] font-bold text-ink-500">
                  {u.name[0]?.toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900">{u.name}</p>
                <p className="text-[11px] text-ink-500">
                  {u.provider} · visto {u.seen_count}× {u.tla ? `· ${u.tla}` : ""}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => copySnippet(u)}>
                Copiar JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                loading={resolve.isPending}
                onClick={() =>
                  resolve.mutate(u.id, {
                    onSuccess: () => toast("Aceito como veio da API.", "success"),
                    onError: (e) => toast(e instanceof Error ? e.message : "Erro", "error"),
                  })
                }
              >
                Aceitar como veio
              </Button>
            </div>
          ))}
        </Card>
      )}
    </Page>
  );
}
