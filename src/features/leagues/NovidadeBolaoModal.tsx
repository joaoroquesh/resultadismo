import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HandCoins, Wallet, BadgeDollarSign, Trophy, Crown } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useFirstSeen } from "@/lib/useFirstSeen";
import { track } from "@/lib/analytics";
import { TOUR_KEY } from "@/features/onboarding/GuidedTour";

const KEY = "resultadismo-novidade-gestao-bolao-v1";

const ITENS = [
  { icon: Wallet, text: "Defina o valor da inscrição do bolão" },
  { icon: BadgeDollarSign, text: "Marque quem já pagou" },
  { icon: Trophy, text: "Configure a divisão do prêmio (1º, 2º e 3º lugar)" },
  { icon: Crown, text: "Veja na classificação quem está levando o prêmio" },
];

/**
 * Anúncio in-app da Gestão do Bolão (ADR 0009), mostrado UMA vez na home pra
 * quem já passou do 1º acesso (`enabled`) — não colide com o tour guiado, que é
 * dos novatos. Nenhum dinheiro passa pelo app; é organização do grupo.
 */
export function NovidadeBolaoModal({ enabled }: { enabled: boolean }) {
  const [pending, markSeen] = useFirstSeen(KEY);
  // não aparece junto com o tour guiado (novatos): só abre quando o tour já foi
  // visto/encerrado (veteranos já têm o flag → abre na hora).
  const [tourDone, setTourDone] = useState(() => {
    try {
      return localStorage.getItem(TOUR_KEY) != null;
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (tourDone) return;
    const onDone = () => window.setTimeout(() => setTourDone(true), 400);
    window.addEventListener("resultadismo:tour-done", onDone);
    return () => window.removeEventListener("resultadismo:tour-done", onDone);
  }, [tourDone]);

  const open = enabled && tourDone && pending;

  const close = () => {
    track("novidade_dismiss", { content_type: "gestao_bolao" });
    markSeen();
  };

  return (
    <Modal open={open} onClose={close} label="Novidade: Gestão do Bolão">
      <div className="p-5 sm:p-6">
        <span className="mb-3 inline-flex size-12 items-center justify-center rounded-pill bg-gold-600/15 text-gold-700">
          <HandCoins className="size-6" strokeWidth={2.2} />
        </span>
        <p className="text-[11px] font-bold uppercase tracking-wide text-gold-700">Novidade</p>
        <h2 className="mt-0.5 text-xl font-extrabold text-ink-950">Gestão do Bolão</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
          Seu grupo combina um bolão entre amigos? Agora dá pra organizar tudo dentro do app, na
          aba <span className="font-semibold text-ink-900">Gestão</span> do grupo:
        </p>

        <ul className="mt-4 space-y-2.5">
          {ITENS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-surface-2 text-brand-600">
                <Icon className="size-4" strokeWidth={2.2} />
              </span>
              <span className="text-sm leading-snug text-ink-700">{text}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-md bg-surface-2 p-3 text-xs leading-relaxed text-ink-500">
          O pagamento <span className="font-semibold text-ink-700">não passa pelo Resultadismo</span>:
          o dinheiro continua entre vocês (Pix, dinheiro, como preferirem). Aqui é só organização.
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Link
            to="/grupos"
            onClick={() => {
              track("novidade_cta", { content_type: "gestao_bolao" });
              markSeen();
            }}
            className="sm:flex-1"
          >
            <Button fullWidth>Ver meus grupos</Button>
          </Link>
          <Button variant="ghost" onClick={close} className="sm:flex-1">
            Agora não
          </Button>
        </div>
      </div>
    </Modal>
  );
}
