// ============================================================================
// DevPanel — chip flutuante de HOMOLOGAÇÃO (SÓ desenvolvimento).
// ----------------------------------------------------------------------------
// Permite testar o app como deslogado / admin / membro / dono / 1º acesso, ou
// "entrar como" qualquer usuário (útil no snapshot de produção). Arrastável e
// reposicionável (não tampa nada), colapsável, posição persistida.
//
// NUNCA vai para produção: o AppShell só renderiza isto sob `import.meta.env.DEV`,
// então o bundle de prod nem inclui este componente. A senha é a do seed local
// (já pública em supabase/seed.sql); pode sobrescrever com VITE_DEV_LOGIN_PASSWORD.
// Login é por senha — funciona com o seed e com o snapshot (o script de snapshot
// seta esta senha nos usuários locais). → .claude/07-BUILD-E-DEPLOY.md (Homologação).
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, LogOut, Shield, User, Crown, Sparkles, X, FlaskConical } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { cn } from "@/lib/utils";

const DEV_PW = import.meta.env.VITE_DEV_LOGIN_PASSWORD ?? "resultadismo123";
const POS_KEY = "resultadismo-devpanel-pos";
const OPEN_KEY = "resultadismo-devpanel-open";

type Persona = {
  id: string;
  label: string;
  hint: string;
  icon: typeof Shield;
  email?: string;
  kind: "login" | "logout" | "first";
};

// Perfis do seed local (ver supabase/seed.sql). No snapshot de prod, "entrar como"
// cobre qualquer usuário real.
const PERSONAS: Persona[] = [
  { id: "out", label: "Deslogado", hint: "visitante / landing", icon: LogOut, kind: "logout" },
  { id: "admin", label: "Admin", hint: "app-admin", icon: Shield, email: "joao.crf93@gmail.com", kind: "login" },
  { id: "member", label: "Membro", hint: "não-admin, num grupo", icon: User, email: "bruno@teste.com", kind: "login" },
  { id: "owner", label: "Dono", hint: "dono de grupo (não-admin)", icon: Crown, email: "dona@teste.com", kind: "login" },
  { id: "first", label: "1º acesso", hint: "usuário novo + onboarding", icon: Sparkles, email: "novato@teste.com", kind: "first" },
];

/** Limpa os flags de onboarding/coachmarks (mantém a posição/estado do DevPanel). */
function resetOnboarding() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("resultadismo") && k !== POS_KEY && k !== OPEN_KEY) localStorage.removeItem(k);
    }
  } catch {
    /* localStorage indisponível */
  }
}

function loadPos(): { x: number; y: number } {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? "");
    if (typeof p?.x === "number" && typeof p?.y === "number") return p;
  } catch {
    /* sem posição salva */
  }
  return { x: 12, y: 80 };
}

export function DevPanel() {
  const { user, profile, isAppAdmin, signInWithPassword, signOut } = useAuth();
  // Por padrão recolhido (só o chip-badge), pra não tampar conteúdo; expande no clique.
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) === "1");
  const [pos, setPos] = useState(loadPos);
  const [busy, setBusy] = useState<string | null>(null);
  const [asEmail, setAsEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  // Mantém dentro da viewport (no mount e ao redimensionar).
  const clamp = useCallback((x: number, y: number) => {
    const el = ref.current;
    const w = el?.offsetWidth ?? 220;
    const h = el?.offsetHeight ?? 60;
    return {
      x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - w - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - h - 8)),
    };
  }, []);

  useEffect(() => {
    const onResize = () => setPos((p) => clamp(p.x, p.y));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp, open]);

  useEffect(() => {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      /* ignora */
    }
  }, [pos]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos(clamp(e.clientX - drag.current.dx, e.clientY - drag.current.dy));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const become = async (p: Persona | { kind: "as"; email: string }) => {
    setErr(null);
    if (p.kind === "logout") {
      setBusy("out");
      resetOnboarding();
      await signOut().catch(() => {});
      window.location.assign("/");
      return;
    }
    const email = "email" in p ? p.email : undefined;
    if (!email) return;
    setBusy("email" in p && "id" in p ? p.id : "as");
    if (p.kind === "first") resetOnboarding();
    await signOut().catch(() => {});
    const { error } = await signInWithPassword(email, DEV_PW);
    if (error) {
      setErr(`${email}: ${error}`);
      setBusy(null);
      return;
    }
    window.location.assign("/"); // visão limpa como o novo perfil
  };

  const current = useMemo(() => {
    if (!user) return { label: "Deslogado", icon: LogOut };
    if (isAppAdmin) return { label: "Admin", icon: Shield };
    const match = PERSONAS.find((p) => p.email === user.email);
    return { label: match?.label ?? profile?.display_name ?? "Logado", icon: match?.icon ?? User };
  }, [user, isAppAdmin, profile]);

  const setOpenP = (v: boolean) => {
    setOpen(v);
    try {
      localStorage.setItem(OPEN_KEY, v ? "1" : "0");
    } catch {
      /* ignora */
    }
  };

  const CurIcon = current.icon;

  // Chip colapsado: badge arrastável mostrando o perfil atual.
  if (!open) {
    return (
      <div
        ref={ref}
        style={{ left: pos.x, top: pos.y }}
        className="fixed z-[9999] touch-none select-none"
      >
        <button
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={() => !drag.current && setOpenP(true)}
          title="DevPanel — clique p/ abrir, arraste p/ mover"
          aria-label="Abrir DevPanel"
          className="flex cursor-grab items-center gap-1.5 rounded-pill border border-brand-500/40 bg-surface/95 px-2.5 py-1.5 text-xs font-bold text-ink-800 shadow-lg backdrop-blur active:cursor-grabbing"
        >
          <FlaskConical className="size-3.5 text-brand-600" />
          <CurIcon className="size-3.5 text-ink-500" />
          <span className="max-w-[10ch] truncate">{current.label}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[9999] w-60 touch-none select-none overflow-hidden rounded-xl border border-brand-500/40 bg-surface/95 shadow-2xl backdrop-blur"
      role="dialog"
      aria-label="DevPanel de homologação"
    >
      {/* handle / header arrastável */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex cursor-grab items-center gap-1.5 border-b border-border bg-brand-600/10 px-2.5 py-1.5 active:cursor-grabbing"
      >
        <GripVertical className="size-3.5 text-ink-400" />
        <FlaskConical className="size-3.5 text-brand-600" />
        <span className="flex-1 text-xs font-bold uppercase tracking-wide text-ink-700">
          Homologação
        </span>
        <button
          onClick={() => setOpenP(false)}
          aria-label="Recolher"
          className="rounded p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="p-2">
        <p className="mb-1.5 px-1 text-[11px] text-ink-400">
          Atual: <span className="font-semibold text-ink-700">{current.label}</span>
          {user?.email && <span className="text-ink-400"> · {user.email}</span>}
        </p>

        <div className="grid grid-cols-1 gap-1">
          {PERSONAS.map((p) => {
            const Icon = p.icon;
            const active =
              (p.kind === "logout" && !user) ||
              (p.email && p.email === user?.email) ||
              (p.id === "admin" && isAppAdmin && user?.email === p.email);
            return (
              <button
                key={p.id}
                onClick={() => become(p)}
                disabled={!!busy}
                title={p.hint}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition disabled:opacity-50",
                  active
                    ? "bg-brand-600 text-white"
                    : "bg-ink-100 text-ink-800 hover:bg-ink-200",
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="flex-1">{p.label}</span>
                {busy === p.id && <span className="text-[10px] opacity-70">…</span>}
              </button>
            );
          })}
        </div>

        {/* entrar como qualquer usuário (snapshot de prod) */}
        <form
          className="mt-2 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (asEmail.trim()) become({ kind: "as", email: asEmail.trim() });
          }}
        >
          <input
            value={asEmail}
            onChange={(e) => setAsEmail(e.target.value)}
            placeholder="entrar como e-mail…"
            aria-label="Entrar como (e-mail)"
            className="min-w-0 flex-1 rounded-md border border-ink-200 bg-surface px-2 py-1 text-[11px] outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            disabled={!!busy || !asEmail.trim()}
            className="rounded-md bg-ink-800 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
          >
            ir
          </button>
        </form>

        {err && <p className="mt-1.5 px-1 text-[10px] leading-tight text-flame-600">{err}</p>}
        <p className="mt-1.5 px-1 text-[10px] leading-tight text-ink-400">
          Só local · recarrega ao trocar de perfil.
        </p>
      </div>
    </div>
  );
}
