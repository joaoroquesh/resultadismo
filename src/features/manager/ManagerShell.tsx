import { Link, Outlet } from "react-router-dom";
import { LogIn } from "lucide-react";
import { ConsentBanner } from "@/features/consent/ConsentBanner";
import { MiniGameFooter } from "@/components/layout/MiniGameFooter";
import { Escudo } from "@/components/ui/Escudo";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import { useProductAnalytics } from "@/lib/productAnalytics";

// Faixa de listras (motivo visual do mini-jogo). Inline aqui pra não acoplar o
// Manager ao slice do Retrô (cada mini-jogo é isolado).
function ManagerStripes({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-1.5 ${className}`}
      style={{
        background:
          "linear-gradient(90deg, var(--color-grass-600) 0 25%, var(--color-gold-500) 0 50%, var(--color-brand-500) 0 75%, var(--color-aqua-700) 0)",
      }}
    />
  );
}

// Casca própria do Manager — separação total do app-mãe: sem Sidebar, sem
// BottomNav, sem header do Resultadismo, sem PresenceTracker. Mini-header com
// a volta explícita pro Resultadismo. Espelha o RetroShell.
export function ManagerShell() {
  const { user, profile, loading } = useAuth();
  const { open: openLogin } = useLoginModal();
  useProductAnalytics("manager", { disabled: loading });

  return (
    <div className="flex min-h-dvh flex-col bg-background text-ink-900">
      {/* ITEM E: header NÃO-fixo — rola junto com a página. Durante a partida ao vivo
          o único chrome fixo passa a ser o placar eletrônico do LiveMatch (sticky
          top-0), sem duas barras fixas competindo pela altura útil no mobile. */}
      <header className="border-b border-border bg-surface">
        <ManagerStripes />
        {/* ITEM C: a barra do header acompanha a MESMA largura do canvas — estreita no
            mobile, larga no desktop (lg+) — pra alinhar a borda com o conteúdo abaixo. */}
        <div className="mx-auto flex h-11 w-full max-w-[480px] items-center justify-between px-4 lg:max-w-[960px]">
          <Link to="/manager" className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
            <span>⚽ Resultadismo <span className="text-brand-700">Manager</span></span>
            <span
              className="rounded border border-gold-500/45 bg-gold-500/20 px-1.5 py-px text-[10px] font-black uppercase leading-none tracking-wider text-gold-700"
              title="Em fase de testes"
            >
              beta
            </span>
          </Link>
          {user ? (
            <Link to="/perfil" aria-label="Meu perfil" className="shrink-0">
              <Escudo src={profile?.avatar_url} name={profile?.display_name} size="sm" className="size-7" />
            </Link>
          ) : (
            <Button size="sm" onClick={openLogin}>
              <LogIn className="size-4" /> Entrar
            </Button>
          )}
        </div>
      </header>
      {/* ITEM C: canvas RESPONSIVO — estreito no mobile, LARGO no desktop (lg+) pra a
          tela AO VIVO (lg:grid 2 colunas), o CHAVEAMENTO e o HUB/RESULTADO usarem as
          laterais. As telas naturalmente estreitas (intro, draft, tática, classificação)
          se auto-centralizam num bloco confortável DENTRO deste canvas largo. */}
      <main className="mx-auto w-full max-w-[480px] flex-1 px-4 py-4 lg:max-w-[960px] lg:py-6">
        <Outlet />
      </main>
      {/* "Como funciona" do Manager é in-page (folha de regras no hub) — sem rota, então
          o rodapé omite o link; o resto segue o padrão da Home deslogada. */}
      <MiniGameFooter gameName="Manager" />
      <ConsentBanner />
    </div>
  );
}
