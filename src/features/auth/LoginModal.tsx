import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
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

/**
 * Modal de login que sobe sobre a home (hero/CTA da landing e botão "Entrar"
 * da Sidebar). Entrada via Google; a rota /login continua como fallback.
 */
export function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signInWithGoogle, signInWithPassword } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function handleGoogle() {
    setBusy(true);
    const { error } = await signInWithGoogle();
    if (error) {
      toast(error, "error");
      setBusy(false);
    }
    // sucesso: o OAuth redireciona; não precisa mexer no estado aqui
  }

  // Login de desenvolvimento: só aparece quando rodando em DEV e quando AMBAS as
  // variáveis (e-mail + senha) estiverem definidas no ambiente. Sem credenciais
  // hardcoded no código.
  const devLogin =
    import.meta.env.DEV &&
    import.meta.env.VITE_DEV_LOGIN_EMAIL &&
    import.meta.env.VITE_DEV_LOGIN_PASSWORD;

  async function handleDevLogin() {
    setBusy(true);
    const { error } = await signInWithPassword(
      import.meta.env.VITE_DEV_LOGIN_EMAIL,
      import.meta.env.VITE_DEV_LOGIN_PASSWORD,
    );
    if (error) {
      toast(error, "error");
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} label="Entrar no Resultadismo">
      <div className="px-6 pb-6 pt-8 text-center sm:px-7">
        <img
          src="/brand/Resultadismo.svg"
          alt=""
          className="mx-auto size-16 drop-shadow-[var(--shadow-brand)]"
        />
        <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-ink-950">
          Bora pro jogo!
        </h2>
        <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-500">
          Crie sua conta em segundos, crave os placares e dispute com a galera. É grátis.
        </p>

        <div className="mt-6">
          <Button variant="outline" fullWidth size="lg" onClick={handleGoogle} loading={busy}>
            {!busy && <GoogleIcon />}
            Entrar com Google
          </Button>
          <p className="mt-3 text-xs text-ink-400">Rapidinho, sem senha nova pra decorar.</p>

          {devLogin && (
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

        <p className="mt-6 text-xs text-ink-400">
          Ao continuar, você topa as regras da diversão. ⚽
        </p>
      </div>
    </Modal>
  );
}
