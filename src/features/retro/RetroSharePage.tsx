import { useNavigate, useParams } from "react-router-dom";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useRetroSummary } from "./api";
import { CampaignTrail, type TrailSlot } from "./CampaignTrail";
import { fmtMs } from "./share";

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
          <Card className={data.status === "champion" ? "border-gold-500 bg-gold-50 p-5" : "p-5"}>
            <div className="space-y-3 text-center">
              {data.status === "champion" && <div className="text-5xl">🏆</div>}
              <p className="text-sm text-ink-500">
                {data.player?.display_name ?? "Alguém"} jogou a{" "}
                {data.is_daily ? "Copa do Dia" : "Copa Retrô"}
                {data.mode === "cravada" && (
                  <>
                    {" "}
                    no modo <b>Vale Saldo</b>
                  </>
                )}
              </p>
              <h2 className="text-2xl font-bold">
                {data.status === "champion" ? "CAMPEÃO! 🏆" : data.stage_reached}
              </h2>
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
        )}

        <Card className="p-4 text-center">
          <p className="text-base font-bold">Acha que faz melhor? 😏</p>
          <p className="mt-1 text-sm text-ink-500">
            7 placares históricos, poucos segundos cada. Jogue de graça, sem cadastro.
          </p>
          <Button size="lg" className="mt-3 w-full font-bold" onClick={() => navigate("/retro")}>
            Jogar a minha Copa →
          </Button>
        </Card>
      </div>
    </Page>
  );
}
