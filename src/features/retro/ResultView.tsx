import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import { useNavigate } from "react-router-dom";
import { track } from "@/lib/analytics";
import { CampaignTrail, type TrailSlot } from "./CampaignTrail";
import { Confetti, RetroStripes } from "./RetroFx";
import { fmtMs, type FinishedRun } from "./share";
import { isPenaltyOut, stageEmoji, verdictHeadline } from "./verdict";
import { shareCampaign } from "./shareImage";

// Tela final: o "card" agora espelha a imagem do share (placar eletrônico escuro +
// listras retrô), pra ser igual ao que a pessoa compartilha. Embaixo, o convite pro
// bolão da Copa (logo do Resultadismo).
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
      {/* CARD = espelho do share: fundo escuro, listras, emoji, trilha, pontos */}
      <div className="retro-scanlines relative overflow-hidden rounded-2xl bg-[var(--retro-board)] p-6 text-center text-white shadow-pop">
        <RetroStripes className="absolute inset-x-0 top-0" />
        <RetroStripes className="absolute inset-x-0 bottom-0" />
        {champion && <Confetti tall />}
        <div className="relative space-y-3">
          <div className="animate-retro-stamp text-6xl">{stageEmoji(v)}</div>
          <h2 className={champion ? "text-2xl font-bold text-[var(--retro-board-digit)]" : "text-2xl font-bold"}>
            {verdictHeadline(v)}
          </h2>
          {penalty && (
            <p className="text-sm font-semibold text-aqua-400">
              Eliminado nos pênaltis 😬 — acertou o vencedor, mas aqui só saldo ou cravada passa.
            </p>
          )}
          <CampaignTrail slots={trail} currentSlot={null} format={run.format} />
          <p className="text-4xl font-bold tabular-nums text-[var(--retro-board-digit)]">{run.points} pts</p>
          <p className="text-sm text-white/75">
            tempo <b className="tabular-nums">{fmtMs(run.totalMs)}</b>
            {streak ? <> · 🔥 {streak} dia{streak > 1 ? "s" : ""} seguidos</> : null}
          </p>
        </div>
      </div>

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
        <Button variant="secondary" className="flex-1 font-bold" onClick={onPlayTraining}>
          Jogar de novo
        </Button>
        <Button variant="ghost" className="flex-1" onClick={onBackHome}>
          Voltar ao início
        </Button>
      </div>

      {/* convite pro bolão da Copa — no FIM da página, com a logo do Resultadismo */}
      <Card className="mt-2 p-5 text-center">
        <img src="/brand/Resultadismo.svg" alt="Resultadismo" className="mx-auto h-7" />
        <p className="mt-3 text-base font-bold text-ink-900">O bolão da Copa de verdade ⚽</p>
        <p className="mt-1 text-sm text-ink-600">
          Gostou de cravar placar? No <b>Resultadismo</b> você palpita nos jogos da{" "}
          <b>Copa que está acontecendo</b> e disputa em grupo com os amigos. De graça.
        </p>
        <Button className="mt-3 w-full font-bold" onClick={() => navigate("/")}>
          Fazer meu bolão da Copa →
        </Button>
      </Card>
    </div>
  );
}
