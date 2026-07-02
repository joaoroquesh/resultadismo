import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, Lock, Shield, Trophy } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { dayjs } from "@/lib/format";
import { useAuth } from "@/features/auth/AuthProvider";
import { UserAnalyticsPanel } from "@/features/admin/UserAnalyticsPanel";
import { UserModerationPanel } from "@/features/admin/UserModerationPanel";
import { usePlayerProfile } from "./api";
import { catalogClubs, catalogNations } from "@/features/onboarding/teamsCatalog";

function Stat({ value, label, accent }: { value: string | number; label: string; accent?: string }) {
  return (
    <div className="rounded-md bg-surface-2 p-3 text-center">
      <p className={`text-2xl font-extrabold tabular-nums ${accent ?? "text-ink-950"}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-ink-500">{label}</p>
    </div>
  );
}

// Conquistas ainda não existem — mostramos o que vem por aí (placeholder).
const FUTURE_BADGES = [
  { label: "Primeira cravada", icon: Trophy },
  { label: "Sequência de 5", icon: Trophy },
  { label: "Top 3 num grupo", icon: Shield },
];

export function PlayerProfilePage() {
  const params = useParams();
  // Robustez: se por algum motivo o useParams não entregar o :id, extrai da URL.
  const id =
    params.id ||
    (typeof window !== "undefined"
      ? decodeURIComponent(window.location.pathname.split("/jogador/")[1]?.split(/[/?#]/)[0] ?? "")
      : "") ||
    undefined;
  const navigate = useNavigate();
  const { user, isAppAdmin } = useAuth();
  const { data: player, isLoading } = usePlayerProfile(id);
  const canModerate = isAppAdmin && !!id && id !== user?.id;
  // Cálculo barato (find num catálogo estático) — sem memo manual: o React
  // Compiler memoiza sozinho (regra react-hooks/preserve-manual-memoization).
  const favTeam = player?.favorite_team_id
    ? catalogClubs().find((t) => t.id === player.favorite_team_id)
    : undefined;
  const natTeam = player?.national_team_id
    ? catalogNations().find((t) => t.id === player.national_team_id)
    : undefined;

  return (
    <Page
      title="Jogador"
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !player ? (
        <EmptyState title="Jogador não encontrado" description="Esse perfil não está disponível." />
      ) : (
        <div className="space-y-4">
          <Card className="flex items-center gap-4 p-4">
            <Avatar src={player.avatar_url} name={player.display_name} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold text-ink-950">{player.display_name}</h2>
              <p className="text-sm text-ink-500">
                no Resultadismo desde {dayjs(player.member_since).format("MMM [de] YYYY")}
              </p>
              {(favTeam || natTeam) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-ink-600">
                  {favTeam && (
                    <span className="inline-flex items-center gap-1.5">
                      {favTeam.local_crest && (
                        <img src={favTeam.local_crest} alt="" className="size-4 rounded-sm object-contain" />
                      )}
                      {favTeam.name}
                    </span>
                  )}
                  {natTeam && (
                    <span className="inline-flex items-center gap-1.5">
                      {natTeam.local_crest && (
                        <img src={natTeam.local_crest} alt="" className="size-4 rounded-sm object-contain" />
                      )}
                      {natTeam.name}
                    </span>
                  )}
                </div>
              )}
            </div>
          </Card>

          {player.stats.jogos > 0 ? (
            <div>
              <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-ink-400">
                Desempenho
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <Stat value={player.stats.pontos} label="Pontos" accent="text-brand-600" />
                <Stat value={player.stats.cravadas} label="Cravadas" accent="text-gold-600" />
                <Stat value={`${player.stats.aproveitamento}%`} label="Aproveitamento" />
                <Stat value={`${player.stats.acertividade}%`} label="Acertividade" />
                <Stat value={player.stats.saldos} label="Saldos" accent="text-grass-600" />
                <Stat value={player.stats.jogos} label="Jogos" />
              </div>
            </div>
          ) : (
            <EmptyState
              title="Ainda sem pontos"
              description="Quando os jogos forem encerrados, o desempenho aparece aqui."
            />
          )}

          {/* Conquistas (em breve) */}
          <div>
            <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-ink-400">
              Conquistas <span className="text-ink-300">· em breve</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {FUTURE_BADGES.map((b) => (
                <span
                  key={b.label}
                  className="inline-flex items-center gap-1.5 rounded-pill bg-ink-100 px-3 py-1.5 text-xs font-semibold text-ink-400"
                >
                  <Lock className="size-3" /> {b.label}
                </span>
              ))}
            </div>
          </div>

          {/* Grupos */}
          {player.leagues.length > 0 && (
            <div>
              <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-ink-400">
                Grupos
              </h3>
              <Card className="divide-y divide-border">
                {player.leagues.map((l) => (
                  <Link
                    key={l.id}
                    to={`/grupos/${l.slug}`}
                    className="flex items-center gap-3 p-4 transition hover:bg-ink-50"
                  >
                    <Shield className="size-5 text-brand-600" />
                    <span className="min-w-0 flex-1 truncate font-medium text-ink-900">{l.name}</span>
                    <ChevronRight className="size-4 text-ink-400" />
                  </Link>
                ))}
              </Card>
            </div>
          )}

          {isAppAdmin && id && <UserAnalyticsPanel userId={id} />}

          {canModerate && id && (
            <UserModerationPanel
              userId={id}
              userName={player.display_name}
              onDeleted={() => navigate("/admin?t=usuarios")}
            />
          )}
        </div>
      )}
    </Page>
  );
}
