import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { Skeleton } from "@/components/ui/Skeleton";
import { Escudo } from "@/components/ui/Escudo";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { RetroStripes } from "./RetroFx";
import {
  useRetroAchievements,
  useRetroCollection,
  useRetroMyStats,
  useRetroReminder,
  useSetRetroReminder,
} from "./api";
import { subscribePush } from "@/features/notifications/push";
import { fmtMs } from "./share";

// "Minha Copa Retrô" (/retro/eu): identidade e progressão próprias do jogador —
// título/XP, streak + recorde, melhor campanha, totais, estante de conquistas e
// o álbum de seleções. Ataca o furo de Posse (Octalysis CD4).
export function RetroProfilePage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { open: openLogin } = useLoginModal();
  const { toast } = useToast();
  const stats = useRetroMyStats();
  const ach = useRetroAchievements(!!user);
  const col = useRetroCollection(!!user);
  const reminder = useRetroReminder(!!user);
  const setReminder = useSetRetroReminder();

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-md space-y-4">
        <Card className="p-6 text-center">
          <p className="text-base font-bold">Sua Copa Retrô te espera 🕹️</p>
          <p className="mt-1 text-sm text-ink-500">
            Entre pra guardar seu escudo, sua sequência, suas conquistas e sua coleção de seleções.
          </p>
          <Button className="mt-3 w-full font-bold" onClick={openLogin}>
            Entrar com Google
          </Button>
        </Card>
        <Button variant="ghost" className="w-full" onClick={() => navigate("/retro")}>
          ← Voltar ao Retrô
        </Button>
      </div>
    );
  }

  const s = stats.data;
  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {/* cabeçalho de identidade */}
      <Card className="retro-scanlines relative overflow-hidden border-2 border-ink-950 bg-brand-700 p-4 text-white">
        <RetroStripes className="absolute inset-x-0 top-0" />
        <RetroStripes className="absolute inset-x-0 bottom-0" />
        <div className="relative flex items-center gap-3">
          <Escudo src={profile?.avatar_url} name={profile?.display_name} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold leading-tight">{profile?.display_name ?? "Jogador"}</p>
            {s ? (
              <p className="text-sm font-semibold text-white/90">
                {s.title} · {s.xp} XP
              </p>
            ) : (
              <Skeleton className="mt-1 h-4 w-24" />
            )}
          </div>
        </div>
      </Card>

      {/* números de cabeceira */}
      {s ? (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="🔥 Sequência" value={`${s.streak}`} sub={`recorde ${s.best_streak ?? 0}`} />
          <Stat label="🏆 Títulos" value={`${s.champions ?? 0}`} sub={`${s.runs ?? 0} campanhas`} />
          <Stat label="🎯 Cravadas" value={`${s.cravadas ?? 0}`} sub="na carreira" />
        </div>
      ) : (
        <Skeleton className="h-20 w-full" />
      )}

      {/* lembrete diário (push opt-in) */}
      <Card className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-bold">🔔 Me lembra da Seleção do Dia</p>
          <p className="text-xs text-ink-500">Um aviso por dia pra não perder a sequência.</p>
        </div>
        <Switch
          checked={reminder.data ?? false}
          label="Lembrete diário"
          onChange={(on) => {
            if (on && user) void subscribePush(user.id);
            setReminder.mutate(on, {
              onSuccess: () => toast(on ? "Lembrete ligado! 🔔" : "Lembrete desligado.", "success"),
              onError: (e) => toast(e.message, "error"),
            });
          }}
        />
      </Card>

      {/* melhor campanha */}
      {s?.best && (
        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Melhor campanha</p>
          <p className="mt-1 text-sm">
            <b>{s.best.stage_reached}</b> · {s.best.points} pts · {fmtMs(s.best.total_ms)}
          </p>
        </Card>
      )}

      {/* coleção de seleções */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">📚 Coleção de seleções</p>
          {col.data && (
            <span className="text-xs font-semibold text-brand-700">
              {col.data.jogadas}/{col.data.total}
            </span>
          )}
        </div>
        {col.isLoading ? (
          <Skeleton className="mt-2 h-4 w-full" />
        ) : (
          <>
            <div className="mt-2 h-2 overflow-hidden rounded-pill bg-ink-100">
              <div
                className="h-full rounded-pill bg-brand-500"
                style={{ width: `${col.data ? (col.data.jogadas / Math.max(1, col.data.total)) * 100 : 0}%` }}
              />
            </div>
            {col.data && col.data.vencidas.length > 0 && (
              <p className="mt-2 text-[11px] text-ink-500">
                🏆 Seleções do Dia vencidas: <b>{col.data.vencidas.join(", ")}</b>
              </p>
            )}
          </>
        )}
      </Card>

      {/* estante de conquistas */}
      <Card className="p-4">
        <p className="mb-2 text-sm font-bold">🏅 Conquistas</p>
        {ach.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {(ach.data?.all ?? []).map((a) => (
              <div
                key={a.code}
                className={cn(
                  "flex items-start gap-2 rounded-md p-2 text-xs ring-1",
                  a.earned ? "bg-gold-50 ring-gold-300" : "bg-ink-50 opacity-60 ring-border",
                )}
                title={a.description}
              >
                <span className={cn("text-lg leading-none", !a.earned && "grayscale")}>{a.emoji}</span>
                <div className="min-w-0">
                  <p className="font-bold leading-tight">{a.label}</p>
                  <p className="leading-tight text-ink-500">{a.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Button variant="ghost" className="w-full" onClick={() => navigate("/retro")}>
        ← Voltar ao Retrô
      </Button>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="p-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-brand-700">{value}</p>
      <p className="text-[10px] text-ink-400">{sub}</p>
    </Card>
  );
}
