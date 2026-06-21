import { useNavigate, useParams } from "react-router-dom";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Escudo } from "@/components/ui/Escudo";
import { LEVEL_EMOJI, LEVEL_LABEL, useRetroSummary } from "./api";
import { CampaignTrail, type TrailSlot } from "./CampaignTrail";
import { dailyEdition, fmtMs } from "./share";
import { stageEmoji, verdictBadge, verdictHeadline } from "./verdict";

// O card da campanha compartilhada: veredito + modo + selos da Lenda + trilha.
function ShareCard({ data }: { data: NonNullable<ReturnType<typeof useRetroSummary>["data"]> }) {
  const v = { status: data.status, stageReached: data.stage_reached, points: data.points, format: data.format, level: data.level };
  const badge = verdictBadge(v);
  // modo só aparece no Jogo livre (a Seleção do Dia não tem escolha)
  const mode = !data.is_daily && data.level ? `${LEVEL_LABEL[data.level]} ${LEVEL_EMOJI[data.level]}` : null;
  return (
    <Card className={data.status === "champion" || badge ? "border-gold-500 bg-gold-50 p-5" : "p-5"}>
      <div className="space-y-3 text-center">
        <div className="text-5xl">{stageEmoji(v)}</div>
        {/* escudo do jogador (só quem jogou logado tem player) */}
        {data.player && (
          <div className="flex items-center justify-center gap-2">
            <Escudo src={data.player.avatar_url} name={data.player.display_name} size="sm" />
            <span className="font-semibold">{data.player.display_name}</span>
          </div>
        )}
        {data.is_daily && (
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">
            Seleção do Dia{dailyEdition(data.daily_date) ? ` #${dailyEdition(data.daily_date)}` : ""}
            {data.team_name_pt ? ` · ${data.team_name_pt}` : ""}
          </p>
        )}
        <p className="text-sm text-ink-500">
          {data.player?.display_name ?? "Alguém"} jogou{" "}
          {data.is_daily ? "a Seleção do Dia" : "o Jogo livre"}
          {mode && (
            <>
              {" "}
              no modo <b>{mode}</b>
            </>
          )}
          {data.format === "pontos" && (
            <>
              {" "}
              no modo <b>Pontos</b>
            </>
          )}
        </p>
        <h2 className="text-2xl font-bold">{verdictHeadline(v)}</h2>
        {badge === "zerou" && (
          <p className="text-sm font-bold text-gold-700">21 de 21 no modo Lenda. Perfeito. 🐐</p>
        )}
        {badge === "historico" && (
          <p className="rounded-md bg-gold-500/15 px-3 py-1.5 text-sm font-bold text-gold-700 ring-1 ring-gold-500/40">
            📜 Campanha HISTÓRICA — mais de 15 pts no modo Lenda!
          </p>
        )}
        <CampaignTrail
          slots={data.slots.map((s): TrailSlot => ({ slot: s.slot, scoreType: s.score_type }))}
          currentSlot={null}
        />
        <p className="text-sm text-ink-500">
          <b className="tabular-nums">{data.points} pts</b> ·{" "}
          <b className="tabular-nums">{fmtMs(data.total_ms)}</b>
        </p>
      </div>
    </Card>
  );
}

// /retro/r/:code — a página pública do share: a campanha de quem mandou o link e o
// CTA-desafio (lição do 7a0). Sem identidade dos jogos — zero spoiler da Copa do Dia.
export function RetroSharePage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useRetroSummary(code);

  return (
    <Page title="Resultadismo Retrô">
      <div className="mx-auto w-full max-w-md space-y-4">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !data ? (
          <EmptyState
            title="Campanha não encontrada"
            description="Esse link expirou ou não existe. Que tal jogar a sua própria Copa?"
          />
        ) : (
          <ShareCard
            data={data}
          />
        )}

        <Card className="p-4 text-center">
          <p className="text-base font-bold">Acha que faz melhor? 😏</p>
          <p className="mt-1 text-sm text-ink-500">
            {data?.is_daily
              ? "Encare a MESMA Seleção do Dia e veja se supera essa campanha. De graça, sem cadastro."
              : "7 placares históricos, poucos segundos cada. Jogue de graça, sem cadastro."}
          </p>
          <Button
            size="lg"
            className="mt-3 w-full font-bold"
            onClick={() => navigate(data?.is_daily ? `/retro?play=daily&vs=${code}` : "/retro")}
          >
            {data?.is_daily ? "Topar o desafio →" : "Jogar a minha Copa →"}
          </Button>
        </Card>

        {/* a isca traz pro bolão: o Resultadismo da Copa que está acontecendo */}
        <Card className="border-2 border-brand-500 p-4 text-center">
          <p className="text-base font-bold text-ink-900">E o bolão da Copa de verdade? ⚽</p>
          <p className="mt-1 text-sm text-ink-600">
            Esse é o <b>Resultadismo Retrô</b>, nosso joguinho rápido. No <b>Resultadismo</b> você
            crava o placar dos jogos da <b>Copa que está rolando</b> e disputa em grupo com os
            amigos. De graça.
          </p>
          <Button variant="outline" className="mt-3 w-full font-bold" onClick={() => navigate("/")}>
            Conhecer o bolão →
          </Button>
        </Card>
      </div>
    </Page>
  );
}
