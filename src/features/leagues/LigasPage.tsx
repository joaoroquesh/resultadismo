import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Shield,
  Users,
  ChevronRight,
  Ticket,
  Clock,
  Globe2,
  Lock,
  Pencil,
  Share2,
  Search,
  Check,
  Star,
} from "lucide-react";
import { Escudo } from "@/components/ui/Escudo";
import { track } from "@/lib/analytics";
import { shareGroupInvite } from "./inviteShare";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { getStoredInvite, clearStoredInvite } from "@/lib/invite";
import {
  useMyLeagues,
  useJoinByCode,
  usePublicLeagues,
  useJoinPublicLeague,
  useMyLeaguePositions,
  useLeaguesMembersPreview,
  type MyLeague,
  type PublicLeague,
  type LeaguePosition,
  type MemberAvatar,
} from "./api";
import { useMyGlobalRank } from "@/features/ranking/api";
import {
  useFavoriteGroups,
  useToggleFavoriteGroup,
  useGroupRankWindows,
  type GroupRankRow,
} from "./favorites";

export function LigasPage() {
  const { data: leagues, isLoading } = useMyLeagues();
  const join = useJoinByCode();
  const { toast } = useToast();
  // Pré-preenche com o código capturado do link de convite (?convite=), se houver.
  const [code, setCode] = useState<string>(() => getStoredInvite());

  const leagueIds = useMemo(() => (leagues ?? []).map((l) => l.id), [leagues]);
  const { data: positions } = useMyLeaguePositions(leagueIds);
  const { data: membersPreview } = useLeaguesMembersPreview(leagueIds);
  const { data: favIds = [] } = useFavoriteGroups();
  const toggleFav = useToggleFavoriteGroup();
  const favSet = useMemo(() => new Set(favIds), [favIds]);

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    try {
      await join.mutateAsync(code.trim());
      clearStoredInvite();
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
      {/* Topo: prévia da classificação dos grupos favoritados (carrossel) +
          Resultadismo The Best compacto (sempre pequeno). */}
      <FavoriteGroupsPreview leagues={leagues ?? []} positions={positions} favIds={favIds} />
      <RTBMiniCard />

      {/* Recebeu convite? entre aqui */}
      <form onSubmit={handleJoin} className="mb-6 mt-6 flex items-end gap-2">
        <Input
          label="Recebeu um convite? Entre aqui"
          placeholder="Ex.: CRAQUE"
          icon={<Ticket className="size-4" />}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <Button type="submit" variant="secondary" loading={join.isPending} disabled={!code.trim()}>
          Entrar
        </Button>
      </form>

      {/* Seus grupos */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-ink-400">
          Seus grupos
        </h2>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : !hasGroups ? (
          <Card className="space-y-4 p-5 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-surface-2 text-brand-600">
              <Shield className="size-6" strokeWidth={2.2} />
            </span>
            <div>
              <h3 className="text-base font-extrabold text-ink-950">Você ainda não tem grupo</h3>
              <p className="mx-auto mt-1 max-w-xs text-sm text-ink-500">
                Crie o seu e chame a galera no WhatsApp, ou entre no grupo da turma com um código.
              </p>
            </div>
            <Link to="/grupos/nova">
              <Button size="lg">
                <Plus className="size-4" /> Criar grupo grátis
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-3">
            {leagues.map((l) => (
              <GroupCard
                key={l.id}
                league={l}
                position={positions?.[l.id]}
                preview={membersPreview?.[l.id]}
                isFavorite={favSet.has(l.id)}
                onToggleFavorite={() => toggleFav.mutate(l.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Grupos públicos — descobríveis por qualquer Resultadista */}
      <PublicGroupsSection />
    </Page>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Topo da /grupos: prévia dos grupos favoritados (carrossel) + RTB compacto   */
/* ────────────────────────────────────────────────────────────────────────── */
// Carrossel das prévias dos grupos FAVORITADOS (na ordem de favoritar). Só
// entram os grupos que já têm pontuação (rows não-vazio — gate do get_group_
// rank_window). Sem favoritos ou nenhum pontuado ainda → card-dica.
function FavoriteGroupsPreview({
  leagues,
  positions,
  favIds,
}: {
  leagues: MyLeague[];
  positions?: Record<string, LeaguePosition>;
  favIds: string[];
}) {
  // Plano (sem useMemo): o React Compiler memoiza o que dá; o resultado do
  // useQueries (windows) muda de referência a cada render, então um useMemo aqui
  // não se preservaria de qualquer forma.
  const byId = new Map(leagues.map((l) => [l.id, l]));
  const favLeagues = favIds.map((id) => byId.get(id)).filter((l): l is MyLeague => !!l);

  const windows = useGroupRankWindows(favLeagues.map((l) => l.id));
  const loading = windows.some((w) => w.isLoading);
  const slides = favLeagues
    .map((l, i) => ({ league: l, rows: windows[i]?.data?.rows ?? [] }))
    .filter((s) => s.rows.length > 0);

  const [active, setActive] = useState(0);
  const clampedActive = Math.min(active, Math.max(slides.length - 1, 0));

  if (loading && slides.length === 0 && favLeagues.length > 0) {
    return <Skeleton className="mb-1 h-40 w-full rounded-xl" />;
  }

  // sem favoritos OU nenhum favorito pontuou ainda → não some o topo: mostra dica
  if (slides.length === 0) {
    return (
      <Card className="mb-1 flex items-center gap-3 bg-surface-2 p-4 ring-1 ring-border">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-gold-500">
          <Star className="size-5" />
        </span>
        <p className="text-sm leading-snug text-ink-600">
          {favLeagues.length === 0 ? (
            <>
              Favorite um grupo na{" "}
              <Star className="inline size-3.5 -translate-y-px fill-gold-400 text-gold-500" /> pra ver
              a prévia da classificação dele aqui no topo.
            </>
          ) : (
            <>A prévia do seu grupo favorito aparece aqui assim que ele começar a pontuar.</>
          )}
        </p>
      </Card>
    );
  }

  return (
    <div className="mb-1">
      <div
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
          if (i !== clampedActive) setActive(i);
        }}
      >
        {slides.map((s) => (
          <div key={s.league.id} className="w-full shrink-0 snap-center">
            <FavoriteGroupSlide league={s.league} position={positions?.[s.league.id]} rows={s.rows} />
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {slides.map((s, i) => (
            <span
              key={s.league.id}
              className={cn(
                "h-1.5 rounded-pill transition-all",
                i === clampedActive ? "w-4 bg-brand-600" : "w-1.5 bg-ink-300",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FavoriteGroupSlide({
  league,
  position,
  rows,
}: {
  league: MyLeague;
  position?: LeaguePosition;
  rows: GroupRankRow[];
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-2.5">
        <Link to={`/grupos/${league.slug}`} className="flex min-w-0 items-center gap-2">
          <Escudo src={league.logo_url} name={league.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink-900">{league.name}</p>
            <p className="text-[11px] text-ink-500">
              {position ? `Você é o ${position.rank}º de ${position.total}` : "Classificação"}
            </p>
          </div>
        </Link>
        <Link
          to={`/grupos/${league.slug}`}
          className="flex shrink-0 items-center gap-0.5 rounded-pill bg-ink-100 px-2.5 py-1 text-[11px] font-bold text-ink-600 transition hover:bg-ink-200"
        >
          ver grupo <ChevronRight className="size-3.5" />
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <GroupRankRowMini key={r.user_id} row={r} />
        ))}
      </ul>
    </Card>
  );
}

function GroupRankRowMini({ row }: { row: GroupRankRow }) {
  const medal = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : null;
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-3 py-2",
        row.is_me && "bg-surface-2 ring-1 ring-inset ring-brand-600",
      )}
    >
      <span className="w-6 text-center text-sm font-bold tabular-nums text-ink-600">
        {medal ?? row.rank}
      </span>
      <Avatar src={row.avatar_url} name={row.display_name} size="sm" />
      <p className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm font-semibold text-ink-900">
        {row.display_name || "Resultadista"}
        {row.is_me && <Badge tone="brand" className="text-[10px]">você</Badge>}
      </p>
      <div className="shrink-0 text-right tabular-nums">
        <span className="text-base font-extrabold text-ink-950">{row.pontos}</span>
        <span className="ml-0.5 text-[10px] uppercase tracking-wide text-ink-400">pts</span>
      </div>
    </li>
  );
}

// Resultadismo The Best COMPACTO — só título + "ver ranking" + minha posição
// geral (sem pontuação, a pedido). A classificação completa fica em /ranking.
function RTBMiniCard() {
  const { data: myRank } = useMyGlobalRank({});
  return (
    <Card className="mb-2 mt-3 flex items-center justify-between gap-3 p-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
          <Globe2 className="size-4" strokeWidth={2.4} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-extrabold tracking-tight text-ink-950">Resultadismo The Best</p>
          <p className="truncate text-xs text-ink-500">
            {myRank ? (
              <>
                Você é o <span className="font-bold tabular-nums text-ink-800">{myRank.rank}º</span> de{" "}
                {myRank.total_resultadistas}
              </>
            ) : (
              "Faça seu primeiro palpite e entre na disputa."
            )}
          </p>
        </div>
      </div>
      <Link
        to="/ranking"
        className="shrink-0 rounded-pill bg-brand-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-brand-700"
      >
        ver ranking
      </Link>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Card de grupo — escudo + nome + posição + escudos de membros + ações        */
/* ────────────────────────────────────────────────────────────────────────── */
function GroupCard({
  league,
  position,
  preview,
  isFavorite,
  onToggleFavorite,
}: {
  league: MyLeague;
  position?: LeaguePosition;
  preview?: { avatars: MemberAvatar[]; count: number };
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const isAdmin = league.my_role === "owner" || league.my_role === "admin";
  const isPublic = league.visibility === "public";
  const pending = league.status === "pending" || league.my_status === "pending";
  const count = preview?.count ?? 0;

  function share() {
    track("share", { method: "whatsapp", content_type: "group_invite" });
    // Texto único do convite (pitch + "Entre no meu grupo" + código + link
    // parametrizado) — mesmo do botão da página do grupo. Público sem código
    // aponta a vitrine /grupos.
    shareGroupInvite(league.name, isPublic ? null : league.join_code);
  }

  return (
    <Card className="p-4">
      <Link to={`/grupos/${league.slug}`} className="flex items-start gap-3">
        <Escudo src={league.logo_url} name={league.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-bold text-ink-900">{league.name}</h3>
            {league.my_role !== "member" && (
              <Badge tone="brand">{league.my_role === "owner" ? "Dono" : "Admin"}</Badge>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
            {pending ? (
              <span className="flex items-center gap-1 text-gold-700">
                <Clock className="size-3.5" />
                {league.status === "pending" ? "aguardando aprovação" : "entrada pendente"}
              </span>
            ) : (
              <>
                {isPublic ? <Globe2 className="size-3.5" /> : <Lock className="size-3.5" />}
                {isPublic ? "Pública" : "Privada"}
                {count > 0 && (
                  <>
                    <span className="text-ink-300">·</span>
                    <Users className="size-3.5" /> {count}
                  </>
                )}
              </>
            )}
          </p>
        </div>
        {position && !pending && (
          <div className="shrink-0 rounded-md bg-brand-600 px-2 py-1 text-right leading-none">
            <span className="text-base font-extrabold tabular-nums text-white">
              {position.rank}º
            </span>
            <span className="ml-0.5 text-[10px] text-white/70">/{position.total}</span>
          </div>
        )}
      </Link>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <MemberStack avatars={preview?.avatars ?? []} count={count} />
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-label={isFavorite ? "Desfavoritar grupo" : "Favoritar grupo"}
            aria-pressed={isFavorite}
            className={cn(
              "grid size-9 place-items-center rounded-md transition hover:bg-ink-100",
              isFavorite ? "text-gold-500" : "text-ink-400 hover:text-gold-500",
            )}
          >
            <Star className={cn("size-4", isFavorite && "fill-gold-400")} />
          </button>
          <button
            type="button"
            onClick={share}
            aria-label="Convidar pelo WhatsApp"
            className="grid size-9 place-items-center rounded-md text-ink-400 transition hover:bg-ink-100 hover:text-grass-600"
          >
            <Share2 className="size-4" />
          </button>
          {isAdmin && (
            <Link
              to={`/grupos/${league.slug}?editar=1`}
              aria-label="Editar grupo"
              className="grid size-9 place-items-center rounded-md text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            >
              <Pencil className="size-4" />
            </Link>
          )}
          <Link
            to={`/grupos/${league.slug}`}
            aria-label="Abrir grupo"
            className="grid size-9 place-items-center rounded-md text-ink-300 transition hover:bg-ink-100 hover:text-ink-700"
          >
            <ChevronRight className="size-5" />
          </Link>
        </div>
      </div>
    </Card>
  );
}

// Escudos de membros sobrepostos, com "+N" e fade quando passa de 5.
function MemberStack({ avatars, count }: { avatars: MemberAvatar[]; count: number }) {
  if (avatars.length === 0) {
    return <span className="text-xs text-ink-400">Sem membros ativos</span>;
  }
  const shown = avatars.slice(0, 5);
  const extra = count - shown.length;
  return (
    <div className="flex items-center">
      <div className="relative flex items-center">
        {shown.map((m, i) => (
          <span
            key={m.id}
            className="relative rounded-md ring-2 ring-surface"
            style={{ marginLeft: i === 0 ? 0 : -8, zIndex: shown.length - i }}
          >
            <Avatar src={m.avatar_url} name={m.name} size="xs" />
          </span>
        ))}
        {extra > 0 && (
          <span className="-ml-2 grid size-6 place-items-center rounded-md bg-ink-100 text-[10px] font-bold text-ink-600 ring-2 ring-surface">
            +{extra}
          </span>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Grupos públicos — vitrine descobrível                                       */
/* ────────────────────────────────────────────────────────────────────────── */
function PublicGroupsSection() {
  const [search, setSearch] = useState("");
  const { data: groups, isLoading } = usePublicLeagues(search);
  const join = useJoinPublicLeague();
  const { toast } = useToast();

  const hasSearch = search.trim().length > 0;
  const isEmpty = !isLoading && (!groups || groups.length === 0);

  async function handleJoin(g: PublicLeague) {
    try {
      await join.mutateAsync(g.id);
      toast(
        g.join_policy === "approval" ? "Pedido enviado! Aguarde o admin aceitar." : "Você entrou no grupo!",
        "success",
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Não foi possível entrar.", "error");
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-ink-400">
        Grupos públicos
      </h2>
      <div className="mb-3">
        <Input
          placeholder="Buscar grupo público…"
          icon={<Search className="size-4" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : isEmpty ? (
        <p className="rounded-lg bg-ink-50 px-4 py-5 text-center text-sm text-ink-500">
          {hasSearch
            ? "Nenhum grupo público com esse nome."
            : "Ainda não há grupos públicos. Crie o seu e deixe-o público pra todo mundo entrar."}
        </p>
      ) : (
        <div className="space-y-2">
          {groups!.map((g) => (
            <div key={g.id} className="flex items-center gap-3 rounded-lg bg-surface p-3 ring-1 ring-border">
              <Link to={`/grupos/${g.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Escudo src={g.logo_url} name={g.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">{g.name}</p>
                  <p className="flex items-center gap-1 text-xs text-ink-500">
                    <Users className="size-3.5" /> {g.member_count}{" "}
                    {g.member_count === 1 ? "membro" : "membros"}
                  </p>
                </div>
              </Link>
              {g.is_member ? (
                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-grass-600">
                  <Check className="size-4" /> participando
                </span>
              ) : (
                <Button
                  size="sm"
                  variant={g.join_policy === "approval" ? "outline" : "secondary"}
                  loading={join.isPending && join.variables === g.id}
                  onClick={() => handleJoin(g)}
                >
                  {g.join_policy === "approval" ? "Pedir" : "Entrar"}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
