import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Shield, Users, ChevronRight, Ticket, Clock, Trophy, Globe2 } from "lucide-react";
import { Escudo } from "@/components/ui/Escudo";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { useMyLeagues, useJoinByCode } from "./api";
import { useGlobalStandings, useMyGlobalRank } from "@/features/ranking/api";

export function LigasPage() {
  const { data: leagues, isLoading } = useMyLeagues();
  const join = useJoinByCode();
  const { toast } = useToast();
  const [code, setCode] = useState("");

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    try {
      await join.mutateAsync(code.trim());
      toast("Você entrou no grupo!", "success");
      setCode("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Não foi possível entrar.", "error");
    }
  }

  const hasGroups = !!leagues && leagues.length > 0;

  return (
    <Page
      title="Grupos"
      action={
        <Link to="/grupos/nova">
          <Button size="sm">
            <Plus className="size-4" /> Criar
          </Button>
        </Link>
      }
    >
      {/* RTB hero — sempre visível, motiva quem tem 0 grupos a jogar mesmo assim */}
      <RTBHero compact={hasGroups} />

      {/* Form "Entrar com código" — quem já tem grupos vê discreto; quem não tem, mais à mão */}
      <form
        onSubmit={handleJoin}
        className={hasGroups ? "mb-4 mt-6 flex items-end gap-2" : "mb-5 flex items-end gap-2"}
      >
        <Input
          label={hasGroups ? "Entrar em outro grupo (código)" : "Entrar com código de convite"}
          placeholder="Ex.: CRAQUE"
          icon={<Ticket className="size-4" />}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <Button type="submit" variant="secondary" loading={join.isPending} disabled={!code.trim()}>
          Entrar
        </Button>
      </form>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !hasGroups ? (
        // Empty state ENSINA: aqui ficam os SEUS grupos. CTA + recados do produto.
        <Card className="space-y-4 p-5 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-500/10 text-brand-600">
            <Shield className="size-6" strokeWidth={2.2} />
          </span>
          <div>
            <h3 className="text-base font-extrabold text-ink-950">Aqui ficam seus grupos</h3>
            <p className="mx-auto mt-1 max-w-xs text-sm text-ink-500">
              Crie um grupo e chame a galera no WhatsApp, ou entre num grupo da turma com um código
              de convite.
            </p>
          </div>
          <Link to="/grupos/nova">
            <Button size="lg">
              <Plus className="size-4" /> Criar grupo grátis
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-ink-400">
            Seus grupos
          </h2>
          {leagues.map((l) => (
            <Link key={l.id} to={`/grupos/${l.slug}`}>
              <Card className="flex items-center gap-3 p-4 transition active:scale-[0.99]">
                <Escudo src={l.logo_url} name={l.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-bold text-ink-900">{l.name}</h3>
                    {l.my_role !== "member" && (
                      <Badge tone="brand">{l.my_role === "owner" ? "Dono" : "Admin"}</Badge>
                    )}
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-ink-500">
                    {l.status === "pending" ? (
                      <span className="flex items-center gap-1 text-gold-700">
                        <Clock className="size-3.5" /> aguardando aprovação
                      </span>
                    ) : l.my_status === "pending" ? (
                      <span className="text-gold-700">solicitação pendente</span>
                    ) : (
                      <>
                        <Users className="size-3.5" /> {l.visibility === "public" ? "Pública" : "Privada"}
                      </>
                    )}
                  </p>
                </div>
                <ChevronRight className="size-5 text-ink-300" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Resultadismo The Best — hero de classificação geral, sempre na /grupos     */
/* ────────────────────────────────────────────────────────────────────────── */
function RTBHero({ compact }: { compact: boolean }) {
  const { data: myRank } = useMyGlobalRank({});
  const { data: top, isLoading } = useGlobalStandings({}, 3);

  return (
    <Card className="overflow-hidden p-0">
      {/* faixa de marca: turquesa contém o título */}
      <div className="flex items-center justify-between gap-3 bg-brand-600 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <Globe2 className="size-4" strokeWidth={2.4} />
          <span className="text-sm font-extrabold tracking-tight">Resultadismo The Best</span>
        </div>
        <Link
          to="/ranking"
          className="rounded-pill bg-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-white/25"
        >
          ver ranking
        </Link>
      </div>

      {/* posição do user — sempre primeira coisa */}
      <div className="border-b border-border bg-surface-2 px-4 py-3">
        {myRank ? (
          <p className="text-sm leading-snug text-ink-700">
            Você é o{" "}
            <span className="font-extrabold text-ink-950 tabular-nums">{myRank.rank}º</span>{" "}
            <span className="text-ink-500">Resultadista</span>{" "}
            <span className="text-ink-300">·</span>{" "}
            <span className="font-bold tabular-nums text-ink-950">{myRank.pontos} pts</span>{" "}
            <span className="text-ink-400">de {myRank.total_resultadistas}</span>
          </p>
        ) : (
          <p className="text-sm text-ink-600">
            Faça seu primeiro palpite e entre na disputa geral.{" "}
            <Link to="/" className="font-semibold text-brand-700 underline">
              Ver jogos →
            </Link>
          </p>
        )}
      </div>

      {/* top 3 mundial — só no modo expandido (quem não tem grupos vê isso) */}
      {!compact && (
        <div className="divide-y divide-border">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : top && top.length > 0 ? (
            top.map((r) => {
              const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : "🥉";
              return (
                <div key={r.user_id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-6 text-center text-base">{medal}</span>
                  <Avatar src={r.avatar_url} name={r.display_name} size="sm" />
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900">
                    {r.display_name || "Resultadista"}
                  </p>
                  <p className="text-sm font-extrabold tabular-nums text-ink-950">{r.pontos}</p>
                </div>
              );
            })
          ) : (
            <p className="px-4 py-3 text-xs text-ink-500">
              Sem Resultadistas pontuados ainda. Você pode ser o primeiro.
            </p>
          )}
          <Link
            to="/ranking"
            className="flex items-center justify-center gap-1.5 bg-surface px-4 py-2.5 text-xs font-semibold text-ink-600 transition hover:bg-ink-50 hover:text-ink-900"
          >
            <Trophy className="size-3.5" /> ver ranking completo
          </Link>
        </div>
      )}
    </Card>
  );
}
