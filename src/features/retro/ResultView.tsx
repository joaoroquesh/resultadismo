import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import { useNavigate } from "react-router-dom";
import { track } from "@/lib/analytics";
import { CampaignTrail, type TrailSlot } from "./CampaignTrail";
import { Confetti } from "./RetroFx";
import { fmtMs, type FinishedRun } from "./share";
import { isPenaltyOut, stageEmoji, verdictHeadline } from "./verdict";
import { shareCampaign } from "./shareImage";

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
  const navigate = useNavigate();
  const champion = run.status === "champion";
  const trail: TrailSlot[] = run.slots.map((s) => ({ slot: s.slot, scoreType: s.scoreType }));
  const penalty = isPenaltyOut(run.status, run.slots);
  const v = { status: run.status, stageReached: run.stageReached, points: run.points, format: run.format };

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <Card className={champion ? "relative overflow-hidden border-2 border-gold-500 bg-gold-50 p-5" : "p-5"}>
        {champion && <Confetti tall />}
        <div className="space-y-3 text-center">
          <div className="animate-retro-stamp text-5xl">{stageEmoji(v)}</div>
          <h2 className="text-2xl font-bold">{verdictHeadline(v)}</h2>
          {penalty && (
            <p className="text-sm font-semibold text-aqua-700">
              Eliminado nos pênaltis 😬 — você acertou o vencedor, mas aqui só saldo ou cravada passa.
            </p>
          )}
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
        onClick={() => {
          track("retro_share", { status: run.status });
          void shareCampaign(run, streak, (m) => toast(m, "success"));
        }}
      >
        Compartilhar 📲
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

      {/* ponte pro jogo principal — depois do share, nunca antes (Q1: aquisição) */}
      <Card className="p-4 text-center">
        <p className="text-sm">
          Curtiu cravar placar? No <b>Resultadismo</b> você palpita nos jogos{" "}
          <b>de verdade</b> e disputa com os amigos.
        </p>
        <Button variant="outline" className="mt-2 w-full" onClick={() => navigate("/")}>
          Palpitar nos jogos de hoje →
        </Button>
      </Card>
    </div>
  );
}
