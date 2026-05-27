import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { LoadingScreen } from "@/components/ui/Spinner";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

export function LoginPage() {
  const { session, loading, signInWithGoogle, signInWithPassword } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  if (loading) return <LoadingScreen />;
  if (session) return <Navigate to="/" replace />;

  async function handleGoogle() {
    setBusy(true);
    const { error } = await signInWithGoogle();
    if (error) {
      toast(error, "error");
      setBusy(false);
    }
  }

  async function handleDevLogin() {
    setBusy(true);
    const { error } = await signInWithPassword("joao.crf93@gmail.com", "resultadismo123");
    if (error) {
      toast(error, "error");
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/brand/Resultadismo.svg" alt="" className="size-20" />
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink-950">Resultadismo</h1>
          <p className="mt-2 text-ink-500">Crave o placar, suba na classificação.</p>
        </div>

        <div className="rounded-lg bg-surface p-6 shadow-[var(--shadow-soft)] ring-1 ring-border">
          <Button variant="outline" fullWidth size="lg" onClick={handleGoogle} loading={busy}>
            {!busy && <GoogleIcon />}
            Continuar com Google
          </Button>
          <p className="mt-4 text-center text-xs text-ink-400">
            Use sua conta Google para entrar e jogar.
          </p>

          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={handleDevLogin}
              disabled={busy}
              className="mt-4 w-full rounded-md border border-dashed border-ink-200 py-2 text-xs font-medium text-ink-400 hover:bg-ink-50"
            >
              Entrar como João (dev)
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-ink-400">
          Ao continuar, você concorda com as regras da diversão. ⚽
        </p>
      </div>
    </div>
  );
}
