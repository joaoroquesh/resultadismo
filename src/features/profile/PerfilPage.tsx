import { useState } from "react";
import { Link } from "react-router-dom";
import { LogOut, ShieldCheck, ChevronRight, Pencil, BellRing } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { subscribePush, pushConfigured } from "@/features/notifications/push";
import { useAuth } from "@/features/auth/AuthProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { usePlayerStats } from "./stats";

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
  const [pushBusy, setPushBusy] = useState(false);

  async function handlePush() {
    if (!user) return;
    setPushBusy(true);
    const { ok, error } = await subscribePush(user.id);
    setPushBusy(false);
    toast(ok ? "Notificações ativadas! 🔔" : error ?? "Não foi possível ativar.", ok ? "success" : "error");
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
            <Link
              to="/admin"
              className="flex items-center gap-3 p-4 transition hover:bg-ink-50"
            >
              <ShieldCheck className="size-5 text-brand-600" />
              <span className="flex-1 font-medium text-ink-900">Painel administrativo</span>
              <ChevronRight className="size-4 text-ink-400" />
            </Link>
          )}
          <Link to="/ligas" className="flex items-center gap-3 p-4 transition hover:bg-ink-50">
            <span className="flex-1 font-medium text-ink-900">Minhas ligas</span>
            <ChevronRight className="size-4 text-ink-400" />
          </Link>
        </Card>

        <Card className="flex items-center justify-between p-4">
          <span className="font-medium text-ink-900">Aparência</span>
          <ThemeToggle />
        </Card>

        <Card className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="font-medium text-ink-900">Notificações</p>
            <p className="text-xs text-ink-500">Avisos de prazo e cutucadas dos amigos</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            loading={pushBusy}
            onClick={handlePush}
            disabled={!pushConfigured()}
          >
            <BellRing className="size-4" /> {pushConfigured() ? "Ativar" : "Em breve"}
          </Button>
        </Card>

        <Button variant="outline" fullWidth onClick={signOut}>
          <LogOut className="size-4" /> Sair
        </Button>

        <p className="pt-2 text-center text-xs text-ink-400">
          Resultadismo © {new Date().getFullYear()}
        </p>
      </div>
    </Page>
  );
}
