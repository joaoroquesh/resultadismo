import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { PaymentAdmin } from "./PaymentAdmin";
import { LigasAdmin } from "./LigasAdmin";
import { CompeticoesAdmin } from "./CompeticoesAdmin";
import { UsuariosAdmin } from "./UsuariosAdmin";
import { AdminDashboard } from "./AdminDashboard";
import { SyncAlertsPanel } from "./SyncAlertsPanel";
import { BroadcastPanel } from "./BroadcastPanel";
import { FeedbackAdmin } from "@/features/feedback/FeedbackAdmin";
import { ChangelogTab } from "./ChangelogTab";
import { useSystemHealth } from "./sync";

const NAV = [
  { key: "visao", label: "Visão" },
  { key: "alertas", label: "Alertas" },
  { key: "avisos", label: "Avisos" },
  { key: "construa", label: "Construa" },
  { key: "grupos", label: "Grupos" },
  { key: "competicoes", label: "Competições" },
  { key: "usuarios", label: "Usuários" },
  { key: "pagamento", label: "Pagamento" },
  { key: "changelog", label: "Changelog" },
] as const;

type TabKey = (typeof NAV)[number]["key"];

export function AdminPage() {
  const navigate = useNavigate();
  // Aba na URL (?t=) — voltar de "ver jogos" cai na aba certa, e dá pra
  // recarregar/compartilhar mantendo o contexto (Nielsen #3: controle do usuário).
  const [params, setParams] = useSearchParams();
  const raw = params.get("t");
  const tab: TabKey = (NAV.some((n) => n.key === raw) ? raw : "visao") as TabKey;
  const setTab = (t: TabKey) => setParams(t === "visao" ? {} : { t }, { replace: true });

  // Só pro badge de alertas — cacheado, compartilhado com o dashboard.
  const { data: health } = useSystemHealth();
  const alertBadge = (health?.pending_alerts ?? 0) + (health?.sync_problems ?? 0);

  return (
    <Page
      title="Admin"
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate("/perfil")} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      {/* Navegação rolável — não espreme no mobile como um segmented de 6 itens */}
      <nav className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {NAV.map((n) => {
          const active = tab === n.key;
          const badge = n.key === "alertas" ? alertBadge : 0;
          return (
            <button
              key={n.key}
              type="button"
              onClick={() => setTab(n.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-pill border px-3.5 py-1.5 text-sm font-semibold transition",
                active
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-border bg-surface text-ink-600 hover:bg-ink-100",
              )}
            >
              {n.label}
              {badge > 0 && (
                <span
                  className={cn(
                    "grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold leading-4",
                    active ? "bg-white/25 text-white" : "bg-flame-500 text-white",
                  )}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {tab === "visao" && <AdminDashboard onNavigate={(t) => setTab(t as TabKey)} />}
      {tab === "alertas" && <SyncAlertsPanel />}
      {tab === "avisos" && <BroadcastPanel />}
      {tab === "construa" && <FeedbackAdmin />}
      {tab === "grupos" && <LigasAdmin />}
      {tab === "competicoes" && <CompeticoesAdmin />}
      {tab === "usuarios" && <UsuariosAdmin />}
      {tab === "pagamento" && <PaymentAdmin />}
      {tab === "changelog" && <ChangelogTab />}
    </Page>
  );
}
