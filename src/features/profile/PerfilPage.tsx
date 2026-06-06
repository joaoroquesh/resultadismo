import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ConsentLink } from "@/features/consent/ConsentDialog";
import {
  LogOut,
  ShieldCheck,
  ChevronRight,
  Pencil,
  BellRing,
  BellOff,
  Download,
  Check,
  Share,
  SquarePlus,
  HelpCircle,
  Hammer,
  Sparkles,
  Swords,
} from "lucide-react";
import { replayOnboarding } from "@/features/onboarding/Onboarding";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import {
  subscribePush,
  unsubscribePush,
  getPushState,
  type PushState,
} from "@/features/notifications/push";
import { NotifPrefsCard } from "@/features/notifications/NotifPrefsCard";
import { IosPushHint } from "@/features/notifications/IosPushHint";
import { useInstallState, promptInstall, isIOS } from "@/lib/pwa";
import { useAuth } from "@/features/auth/AuthProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { usePlayerStats } from "./stats";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSetGlobalRankingVisibility } from "@/features/ranking/api";

function Stat({ value, label, accent }: { value: string | number; label: string; accent?: string }) {
  return (
    <div className="rounded-md bg-surface-2 p-3 text-center">
      <p className={`text-2xl font-extrabold tabular-nums ${accent ?? "text-ink-950"}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-ink-500">{label}</p>
    </div>
  );
}

export function PerfilPage() {
  const { profile, user, isAppAdmin, signOut } = useAuth();
  const { data: stats } = usePlayerStats();
  const { toast } = useToast();

  // --- Instalação do app (PWA) ---
  const installState = useInstallState();
  const [installBusy, setInstallBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const onInstall = async () => {
    setInstallBusy(true);
    const r = await promptInstall();
    setInstallBusy(false);
    if (r === "accepted") toast("App instalado! 🎉", "success");
  };

  // --- Notificações (Web Push) ---
  const [push, setPush] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const refreshPush = useCallback(async () => setPush(await getPushState()), []);
  // Carrega o estado inicial do push (leitura assíncrona do service worker). O setState
  // fica no callback da promise — não é setState síncrono em efeito.
  useEffect(() => {
    let alive = true;
    void getPushState().then((s) => {
      if (alive) setPush(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function enablePush() {
    if (!user) return;
    setPushBusy(true);
    const { ok, error } = await subscribePush(user.id);
    await refreshPush();
    setPushBusy(false);
    toast(ok ? "Notificações ativadas! 🔔" : error ?? "Não foi possível ativar.", ok ? "success" : "error");
  }
  async function disablePush() {
    setPushBusy(true);
    const { ok, error } = await unsubscribePush();
    await refreshPush();
    setPushBusy(false);
    toast(ok ? "Notificações desativadas." : error ?? "Erro ao desativar.", ok ? "success" : "error");
  }

  let notifHelp = "Avisos de prazo e cutucadas dos amigos.";
  let notifControl: ReactNode = (
    <Button variant="outline" size="sm" disabled>
      …
    </Button>
  );
  if (push) {
    if (!push.supported) {
      notifHelp = isIOS()
        ? "No iPhone, instale o app na tela inicial para ativar."
        : "Seu navegador não suporta notificações.";
      notifControl = (
        <Button variant="outline" size="sm" disabled>
          Indisponível
        </Button>
      );
    } else if (push.permission === "denied") {
      notifHelp = "Bloqueadas. Libere nas configurações do navegador.";
      notifControl = (
        <Button variant="outline" size="sm" disabled>
          <BellOff className="size-4" /> Bloqueado
        </Button>
      );
    } else if (push.subscribed) {
      notifHelp = "Ativadas neste dispositivo.";
      notifControl = (
        <Button variant="outline" size="sm" loading={pushBusy} onClick={disablePush}>
          <BellOff className="size-4" /> Desativar
        </Button>
      );
    } else {
      notifControl = (
        <Button size="sm" loading={pushBusy} onClick={enablePush}>
          <BellRing className="size-4" /> Ativar
        </Button>
      );
    }
  }

  return (
    <Page title="Perfil">
      <div className="space-y-4">
        <Card className="flex items-center gap-4 p-4">
          <Avatar src={profile?.avatar_url} name={profile?.display_name} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-ink-950">
              {profile?.display_name ?? "Jogador"}
            </h2>
            <p className="truncate text-sm text-ink-500">{user?.email}</p>
            {isAppAdmin && (
              <Badge tone="brand" className="mt-1.5">
                <ShieldCheck className="size-3.5" /> Administrador
              </Badge>
            )}
          </div>
          <Link to="/perfil/editar">
            <Button variant="ghost" size="icon" aria-label="Editar perfil">
              <Pencil className="size-4" />
            </Button>
          </Link>
        </Card>

        {stats && stats.jogos > 0 && (
          <div>
            <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-ink-400">
              Suas estatísticas
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <Stat value={stats.pontos} label="Pontos" accent="text-brand-600" />
              <Stat value={stats.cravadas} label="Cravadas" accent="text-gold-600" />
              <Stat value={`${stats.aproveitamento}%`} label="Aproveitamento" />
              <Stat value={`${stats.acertividade}%`} label="Acertividade" />
              <Stat value={stats.melhorSequencia} label="Sequência" accent="text-grass-600" />
              <Stat value={stats.jogos} label="Jogos" />
            </div>
          </div>
        )}

        <Card className="divide-y divide-border">
          {isAppAdmin && (
            <Link to="/admin" className="flex items-center gap-3 p-4 transition hover:bg-ink-50">
              <ShieldCheck className="size-5 text-brand-600" />
              <span className="flex-1 font-medium text-ink-900">Painel administrativo</span>
              <ChevronRight className="size-4 text-ink-400" />
            </Link>
          )}
          {isAppAdmin && (
            <button
              type="button"
              onClick={() => {
                replayOnboarding();
                toast("Tour reaberto 👋", "success");
              }}
              className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-ink-50"
            >
              <Sparkles className="size-5 text-brand-600" />
              <span className="flex-1 font-medium text-ink-900">Rever tour de boas-vindas</span>
              <ChevronRight className="size-4 text-ink-400" />
            </button>
          )}
          {isAppAdmin && (
            <Link to="/simulador" className="flex items-center gap-3 p-4 transition hover:bg-ink-50">
              <Swords className="size-5 text-brand-600" />
              <span className="flex-1 font-medium text-ink-900">Simulador de confrontos</span>
              <ChevronRight className="size-4 text-ink-400" />
            </Link>
          )}
          <Link to="/grupos" className="flex items-center gap-3 p-4 transition hover:bg-ink-50">
            <span className="flex-1 font-medium text-ink-900">Meus grupos</span>
            <ChevronRight className="size-4 text-ink-400" />
          </Link>
          <Link
            to="/como-funciona"
            className="flex items-center gap-3 p-4 transition hover:bg-ink-50"
          >
            <HelpCircle className="size-5 text-brand-600" />
            <span className="flex-1 font-medium text-ink-900">Como funciona</span>
            <ChevronRight className="size-4 text-ink-400" />
          </Link>
          <Link to="/construa" className="flex items-center gap-3 p-4 transition hover:bg-ink-50">
            <Hammer className="size-5 text-brand-600" />
            <span className="flex-1 font-medium text-ink-900">Construa com a gente</span>
            <ChevronRight className="size-4 text-ink-400" />
          </Link>
        </Card>

        <Card className="flex items-center justify-between p-4">
          <span className="font-medium text-ink-900">Aparência</span>
          <ThemeToggle />
        </Card>

        {/* Instalar o app (PWA) — sempre visível */}
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-ink-900">Instalar o app</p>
              <p className="text-xs text-ink-500">
                {installState === "installed"
                  ? "Instalado neste dispositivo."
                  : "Tenha o Resultadismo na tela inicial, abre num toque."}
              </p>
            </div>
            {installState === "installed" ? (
              <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-grass-600">
                <Check className="size-4" /> Instalado
              </span>
            ) : installState === "installable" ? (
              <Button size="sm" loading={installBusy} onClick={onInstall}>
                <Download className="size-4" /> Instalar
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setHelpOpen((v) => !v)}>
                <Download className="size-4" /> Como instalar
              </Button>
            )}
          </div>
          {installState !== "installed" && installState !== "installable" && helpOpen && (
            <div className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-ink-500">
              {isIOS() ? (
                <p>
                  No Safari, toque em
                  <Share
                    className="mx-1 inline size-3.5 -translate-y-px text-brand-600"
                    aria-label="Compartilhar"
                  />
                  <span className="font-semibold text-ink-700">Compartilhar</span> e depois em{" "}
                  <span className="inline-flex translate-y-px items-center gap-0.5 font-semibold text-ink-700">
                    <SquarePlus className="size-3.5" /> Adicionar à Tela de Início
                  </span>
                  .
                </p>
              ) : (
                <p>
                  <span className="font-semibold text-ink-700">No celular:</span> abra o menu do
                  navegador (⋮) e toque em{" "}
                  <span className="font-semibold text-ink-700">“Instalar app”</span> ou “Adicionar à
                  tela inicial”. <span className="font-semibold text-ink-700">No computador:</span>{" "}
                  clique no ícone de instalar na barra de endereço do Chrome ou Edge.
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Notificações */}
        <div className="space-y-2">
          <Card className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-medium text-ink-900">Notificações</p>
              <p className="text-xs text-ink-500">{notifHelp}</p>
            </div>
            {notifControl}
          </Card>
          {/* iPhone: precisa instalar o app antes de poder receber push. */}
          <IosPushHint subscribed={!!push?.subscribed} />
          {/* Já inscrito: deixa escolher o que receber (vale pra conta toda). */}
          {push?.subscribed && <NotifPrefsCard />}
        </div>

        {/* Privacidade: aparecer ou não no Resultadismo The Best */}
        <GlobalRankingPrefCard />

        <Button variant="outline" fullWidth onClick={signOut}>
          <LogOut className="size-4" /> Sair
        </Button>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-sm font-medium text-ink-500">
          <Link to="/termos" className="transition-colors hover:text-ink-900">
            Termos de uso
          </Link>
          <Link to="/privacidade" className="transition-colors hover:text-ink-900">
            Privacidade
          </Link>
          <ConsentLink />
        </div>
        <p className="text-center text-xs text-ink-400">
          Resultadismo © {new Date().getFullYear()}
        </p>
      </div>
    </Page>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Aparecer no Resultadismo The Best — opt-out por Resultadista             */
/* ────────────────────────────────────────────────────────────────────────── */
function GlobalRankingPrefCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const set = useSetGlobalRankingVisibility();

  const { data: visible, isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["profile-me-rtb-pref", user?.id],
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("show_in_global_ranking")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data?.show_in_global_ranking ?? true;
    },
  });

  const toggle = () => {
    const next = !(visible ?? true);
    set.mutate(next, {
      onSuccess: () => qc.invalidateQueries({ queryKey: ["profile-me-rtb-pref", user?.id] }),
    });
  };

  return (
    <Card className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="font-medium text-ink-900">Aparecer no Resultadismo The Best</p>
        <p className="text-xs text-ink-500">
          {visible === false
            ? "Você não está aparecendo na classificação geral pública."
            : "Sua posição aparece pra outros Resultadistas. Desligue se preferir privacidade."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={visible ?? true}
        aria-label="Aparecer no Resultadismo The Best"
        disabled={isLoading || set.isPending}
        onClick={toggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          (visible ?? true) ? "bg-brand-600" : "bg-ink-300"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${
            (visible ?? true) ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </Card>
  );
}
