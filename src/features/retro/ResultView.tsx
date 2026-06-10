import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import { CampaignTrail, type TrailSlot } from "./CampaignTrail";
import { buildShareText, fmtMs, type FinishedRun } from "./share";

async function share(text: string, toast: (msg: string) => void) {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch {
    /* usuário cancelou — cai no fallback silenciosamente? não: cancelar = fim */
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  try {
    await navigator.clipboard.writeText(text);
    toast("Texto copiado também!");
  } catch {
    /* sem clipboard, o wa.me já resolve */
  }
}

// Tela final da campanha: o veredito, a grade compartilhável e o loop de recomeço.
export function ResultView({
  run,
  streak,
  onPlayTraining,
  onBackHome,
}: {
  run: FinishedRun;
  streak?: number;
  onPlayTraining: () => void;
  onBackHome: () => void;
}) {
  const { user } = useAuth();
  const { open: openLogin } = useLoginModal();
  const { toast } = useToast();
  const champion = run.status === "champion";
  const trail: TrailSlot[] = run.slots.map((s) => ({ slot: s.slot, scoreType: s.scoreType }));

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <Card className={champion ? "border-gold-500 bg-gold-50 p-5" : "p-5"}>
        <div className="space-y-3 text-center">
          {champion && <div className="animate-retro-stamp text-5xl">🏆</div>}
          <h2 className="text-2xl font-bold">
            {champion ? "CAMPEÃO DO MUNDO (RETRÔ)!" : `Sua Copa parou: ${run.stageReached}`}
          </h2>
          <CampaignTrail slots={trail} currentSlot={null} />
          <p className="text-sm text-ink-500">
            <b className="tabular-nums">{run.points} pts</b> · tempo{" "}
            <b className="tabular-nums">{fmtMs(run.totalMs)}</b>
            {streak ? (
              <>
                {" "}
                · <b>🔥 {streak} dia{streak > 1 ? "s" : ""} seguidos</b>
              </>
            ) : null}
          </p>
        </div>
      </Card>

      <Button
        size="lg"
        className="w-full font-bold"
        onClick={() => void share(buildShareText(run, streak), (m) => toast(m, "success"))}
      >
        Compartilhar no WhatsApp 📲
      </Button>

      {!user && (
        <Card className="p-4 text-center">
          <p className="text-sm">
            Jogando sem conta — seu resultado <b>não entra no ranking</b>.
          </p>
          <Button variant="outline" className="mt-2" onClick={openLogin}>
            Entrar com Google e competir
          </Button>
        </Card>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onPlayTraining}>
          Jogar Treino agora
        </Button>
        <Button variant="ghost" className="flex-1" onClick={onBackHome}>
          Voltar ao início
        </Button>
      </div>
    </div>
  );
}
