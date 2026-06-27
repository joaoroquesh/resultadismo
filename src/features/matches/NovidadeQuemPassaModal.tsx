import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Swords } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useFirstSeen } from "@/lib/useFirstSeen";
import { track } from "@/lib/analytics";
import { TOUR_KEY } from "@/features/onboarding/GuidedTour";

const KEY = "resultadismo-novidade-quem-passa-v1";

const FASES = [
  { fase: "16-avos", pts: "+1" },
  { fase: "Oitavas", pts: "+2" },
  { fase: "Quartas", pts: "+3" },
  { fase: "Semi e 3º", pts: "+4" },
  { fase: "Final", pts: "+5" },
];

/**
 * Anúncio in-app do "Ponto extra — quem passa no mata-mata", mostrado UMA vez por
 * usuário na home (chave `resultadismo-novidade-quem-passa-v1`), depois do tour
 * guiado pra não colidir com os novatos (veteranos já têm o flag → abre na hora).
 * Some quando a pessoa fecha ("Entendi") ou clica em "Ver como funciona".
 */
export function NovidadeQuemPassaModal() {
  const [pending, markSeen] = useFirstSeen(KEY);
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

  const open = tourDone && pending;

  const close = () => {
    track("novidade_dismiss", { content_type: "quem_passa" });
    markSeen();
  };

  return (
    <Modal open={open} onClose={close} label="Novidade: ponto extra no mata-mata">
      <div className="p-5 sm:p-6">
        <span className="mb-3 inline-flex size-12 items-center justify-center rounded-pill bg-grass-600/15 text-grass-700">
          <Swords className="size-6" strokeWidth={2.2} />
        </span>
        <p className="text-[11px] font-bold uppercase tracking-wide text-grass-700">Novidade</p>
        <h2 className="mt-0.5 text-xl font-extrabold text-ink-950">Ponto extra no mata-mata</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
          Nas fases eliminatórias, além do placar você ganha pontos por acertar{" "}
          <span className="font-semibold text-ink-900">quem se classifica</span> — e vale{" "}
          <span className="font-semibold text-ink-900">mais quanto mais fundo</span> na Copa:
        </p>

        <div className="mt-4 grid grid-cols-2 gap-1.5 text-xs">
          {FASES.map(({ fase, pts }) => (
            <span key={fase} className="rounded-md bg-surface-2 px-2 py-1.5 text-ink-700">
              {fase} <span className="font-bold text-grass-700">{pts}</span>
            </span>
          ))}
        </div>

        <div className="mt-4 rounded-md bg-surface-2 p-3 text-xs leading-relaxed text-ink-500">
          No palpite de <span className="font-semibold text-ink-700">empate</span>, o app já marca o{" "}
          <span className="font-semibold text-ink-700">mandante</span> como quem passa — é só trocar se
          quiser. Pode ser decidido nos pênaltis e{" "}
          <span className="font-semibold text-ink-700">não dobra</span> com o 2×.
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Link
            to="/como-funciona"
            onClick={() => {
              track("novidade_cta", { content_type: "quem_passa" });
              markSeen();
            }}
            className="sm:flex-1"
          >
            <Button fullWidth>Ver como funciona</Button>
          </Link>
          <Button variant="ghost" onClick={close} className="sm:flex-1">
            Entendi
          </Button>
        </div>
      </div>
    </Modal>
  );
}
