import { Link } from "react-router-dom";
import { LogOut, ShieldCheck, ChevronRight, Pencil } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/features/auth/AuthProvider";

export function PerfilPage() {
  const { profile, user, isAppAdmin, signOut } = useAuth();

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

        <Card className="divide-y divide-ink-100">
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
