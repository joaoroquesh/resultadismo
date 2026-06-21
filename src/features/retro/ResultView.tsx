import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import { useNavigate } from "react-router-dom";
import { track } from "@/lib/analytics";
import { CampaignTrail, type TrailSlot } from "./CampaignTrail";
import { Confetti, RetroStripes, ZerouFx } from "./RetroFx";
import { fmtMs, modeLabel, type FinishedRun } from "./share";
import { isPenaltyOut, stageEmoji, verdictBadge, verdictHeadline } from "./verdict";
import { shareCampaign } from "./shareImage";
import { useClaimAchievements, useRetroAchievements, useRetroRankEstimate, useRetroRunRecords, type RetroAchievement } from "./api";

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
  const { user, profile } = useAuth();
  const { open: openLogin } = useLoginModal();
  const { toast } = useToast();
  const navigate = useNavigate();
  const champion = run.status === "champion";
  const trail: TrailSlot[] = run.slots.map((s) => ({ slot: s.slot, scoreType: s.scoreType }));
  const penalty = isPenaltyOut(run.status, run.slots);
  const v = { status: run.status, stageReached: run.stageReached, points: run.points, format: run.format, level: run.level };
  const badge = verdictBadge(v);
  const mode = modeLabel(run);
  // gancho de login pro anônimo: "você seria ~Nº no ranking de hoje" (só Seleção do Dia)
  const rankEst = useRetroRankEstimate(
    !user && run.isDaily
      ? { stageRank: run.stageRank, points: run.points, totalMs: run.totalMs }
      : null,
  );

  // logado: concede conquistas merecidas (1x) e detecta recorde pessoal
  const claim = useClaimAchievements();
  const achCatalog = useRetroAchievements(false);
  const records = useRetroRunRecords(run.shareCode, !!user);
  const [newAch, setNewAch] = useState<RetroAchievement[]>([]);
  const claimed = useRef(false);
  useEffect(() => {
    if (!user || claimed.current) return;
    claimed.current = true;
    claim.mutate(undefined, {
      onSuccess: (res) => {
        const byCode = new Map(res.all.map((a) => [a.code, a]));
        setNewAch(res.new.map((c) => byCode.get(c)).filter((a): a is RetroAchievement => !!a));
        achCatalog.refetch?.();
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {/* CARD = espelho do share: fundo escuro, listras, emoji, trilha, pontos */}
      <div
        className={
          badge === "zerou"
            ? "retro-scanlines relative overflow-hidden rounded-2xl bg-[var(--retro-board)] p-6 text-center text-white shadow-pop ring-4 ring-gold-500"
            : "retro-scanlines relative overflow-hidden rounded-2xl bg-[var(--retro-board)] p-6 text-center text-white shadow-pop"
        }
      >
        <RetroStripes className="absolute inset-x-0 top-0" />
        <RetroStripes className="absolute inset-x-0 bottom-0" />
        {badge === "zerou" ? <ZerouFx /> : champion && <Confetti tall />}
        <div className="relative space-y-3">
          {mode && (
            <span className="inline-block rounded-pill bg-white/10 px-3 py-0.5 text-xs font-bold uppercase tracking-widest text-white/85">
              {mode}
            </span>
          )}
          <div className="animate-retro-stamp text-6xl">{stageEmoji(v)}</div>
          <h2
            className={
              badge === "zerou"
                ? "animate-retro-tense text-3xl font-bold tracking-tight text-[var(--retro-board-digit)]"
                : champion
                  ? "text-2xl font-bold text-[var(--retro-board-digit)]"
                  : "text-2xl font-bold"
            }
          >
            {verdictHeadline(v)}
          </h2>
          {badge === "zerou" && (
            <p className="text-sm font-bold text-gold-400">21 de 21 no modo Lenda. Perfeito. 🐐</p>
          )}
          {badge === "historico" && (
            <p className="animate-retro-stamp rounded-md bg-gold-500/15 px-3 py-1.5 text-sm font-bold text-gold-400 ring-1 ring-gold-500/40">
              📜 Campanha HISTÓRICA — mais de 15 pts no modo Lenda!
            </p>
          )}
          {penalty && (
            <p className="text-sm font-semibold text-aqua-400">
              Eliminado nos pênaltis 😬 — acertou o vencedor, mas aqui só saldo ou cravada passa.
            </p>
          )}
          <CampaignTrail slots={trail} currentSlot={null} />
          <p className="text-4xl font-bold tabular-nums text-[var(--retro-board-digit)]">{run.points} pts</p>
          <p className="text-sm text-white/75">
            tempo <b className="tabular-nums">{fmtMs(run.totalMs)}</b>
            {streak ? <> · 🔥 {streak} dia{streak > 1 ? "s" : ""} seguidos</> : null}
          </p>
        </div>
      </div>

      {records.data?.record && (
        <p className="animate-retro-stamp rounded-md bg-gold-500/15 px-3 py-2 text-center text-sm font-bold text-gold-700 ring-1 ring-gold-500/40">
          🏅 NOVO RECORDE pessoal!
        </p>
      )}

      {newAch.length > 0 && (
        <Card className="border-gold-300 bg-gold-50 p-3">
          <p className="text-center text-xs font-bold uppercase tracking-wide text-gold-700">
            Conquista{newAch.length > 1 ? "s" : ""} desbloqueada{newAch.length > 1 ? "s" : ""}!
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {newAch.map((a) => (
              <span key={a.code} className="inline-flex items-center gap-1 rounded-pill bg-white px-2.5 py-1 text-xs font-bold ring-1 ring-gold-300" title={a.description}>
                <span className="text-base leading-none">{a.emoji}</span> {a.label}
              </span>
            ))}
          </div>
        </Card>
      )}

      <Button
        size="lg"
        className="w-full font-bold"
        onClick={() => {
          track("retro_share", { status: run.status });
          const sharePlayer = profile
            ? { avatarUrl: profile.avatar_url, displayName: profile.display_name }
            : undefined;
          void shareCampaign(run, streak, (m) => toast(m, "success"), sharePlayer);
        }}
      >
        Compartilhar 📲
      </Button>

      {!user && (
        <Card className="p-4 text-center">
          {run.isDaily && rankEst.data ? (
            <p className="text-sm">
              Com essa campanha você seria <b className="text-brand-700">~{rankEst.data.pos}º</b> no
              ranking de hoje. <b>Entre pra valer</b> e guarde seu escudo e sua sequência 🔥
            </p>
          ) : (
            <p className="text-sm">
              Jogando sem conta — seu resultado <b>não entra no ranking</b>.
            </p>
          )}
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
