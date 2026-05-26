import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Mail, Lock, User as UserIcon } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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
  const { session, loading, signInWithGoogle, signInWithPassword, signUp } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <LoadingScreen />;
  if (session) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } =
      mode === "login"
        ? await signInWithPassword(email, password)
        : await signUp(email, password, name);
    setBusy(false);
    if (error) {
      toast(traduzErro(error), "error");
    } else if (mode === "signup") {
      toast("Conta criada! Bem-vindo ao Resultadismo.", "success");
    }
  }

  async function handleGoogle() {
    setBusy(true);
    const { error } = await signInWithGoogle();
    if (error) {
      toast(error, "error");
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/brand/Resultadismo.svg" alt="" className="size-16" />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink-950">Resultadismo</h1>
          <p className="mt-1 text-sm text-ink-500">
            Crave o placar, suba na classificação.
          </p>
        </div>

        <div className="rounded-lg bg-surface p-6 shadow-[var(--shadow-card)] ring-1 ring-black/[0.04]">
          <Button variant="outline" fullWidth onClick={handleGoogle} disabled={busy}>
            <GoogleIcon />
            Continuar com Google
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs text-ink-400">
            <span className="h-px flex-1 bg-ink-200" />
            ou com email
            <span className="h-px flex-1 bg-ink-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <Input
                label="Nome"
                placeholder="Como quer ser chamado"
                icon={<UserIcon className="size-4" />}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
            <Input
              label="Email"
              type="email"
              placeholder="voce@email.com"
              icon={<Mail className="size-4" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Senha"
              type="password"
              placeholder="••••••••"
              icon={<Lock className="size-4" />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <Button type="submit" fullWidth loading={busy}>
              {mode === "login" ? "Entrar" : "Criar conta"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-ink-500">
            {mode === "login" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="font-semibold text-brand-600 hover:text-brand-700"
            >
              {mode === "login" ? "Crie agora" : "Entrar"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function traduzErro(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "Email ou senha incorretos.";
  if (/already registered|already exists/i.test(msg)) return "Este email já está cadastrado.";
  if (/password should be at least/i.test(msg)) return "A senha deve ter ao menos 6 caracteres.";
  return msg;
}
