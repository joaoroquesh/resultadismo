import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ConsentLink } from "@/features/consent/ConsentDialog";
import { Button } from "@/components/ui/Button";

// Rodapé compartilhado dos mini-jogos (Retrô, Manager, e os próximos): no estilo da
// Home deslogada — "Como funciona" do PRÓPRIO jogo, Termos, Privacidade,
// Compartilhamento de dados e troca de tema — mais o botão que leva ao Resultadismo
// (a ponte pro bolão vive aqui, não no topo).
export function MiniGameFooter({
  gameName,
  comoFuncionaTo,
}: {
  gameName: string;
  comoFuncionaTo: string;
}) {
  const navigate = useNavigate();
  return (
    <footer className="mt-12 border-t border-border bg-surface-2">
      <div className="mx-auto w-full max-w-md px-4 py-8">
        {/* ponte pro Resultadismo (bolão da Copa) */}
        <div className="flex flex-col items-center gap-2 border-b border-border pb-6 text-center">
          <img src="/brand/Resultadismo.svg" alt="" className="size-9" />
          <p className="text-sm font-bold text-ink-900">O bolão da Copa com os amigos</p>
          <Button size="sm" variant="outline" className="mt-1 font-bold" onClick={() => navigate("/")}>
            Ir pro Resultadismo <ArrowRight className="size-4" />
          </Button>
        </div>

        {/* navegação + tema (mesma linguagem da Home deslogada) */}
        <div className="flex flex-col items-center gap-4 pt-5">
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm font-medium text-ink-500">
            <Link to={comoFuncionaTo} className="transition-colors hover:text-ink-900">
              Como funciona
            </Link>
            <Link to="/termos" className="transition-colors hover:text-ink-900">
              Termos
            </Link>
            <Link to="/privacidade" className="transition-colors hover:text-ink-900">
              Privacidade
            </Link>
            <ConsentLink />
          </nav>
          <ThemeToggle />
        </div>

        <p className="mt-5 text-center text-xs text-ink-400">
          © 2026 Resultadismo {gameName}. Feito pra torcedor. ⚽
        </p>
      </div>
    </footer>
  );
}
