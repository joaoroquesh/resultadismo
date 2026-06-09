import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Heart,
  Flag,
  ShieldHalf,
  Globe2,
  Ticket,
  Check,
  Minus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  User as UserIcon,
  Bell,
  Download,
  Share,
  SquarePlus,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { CrestEditor } from "@/components/ui/CrestEditor";
import { cn } from "@/lib/utils";
import { ESCUDO_SHAPES, legacyToCrest } from "@/lib/crest";
import { getStoredInvite, clearStoredInvite } from "@/lib/invite";
import { getPushState, subscribePush, unsubscribePush } from "@/features/notifications/push";
import { useInstallState, promptInstall, isIOS } from "@/lib/pwa";
import { useAuth } from "@/features/auth/AuthProvider";
import { useJoinByCode } from "@/features/leagues/api";
import {
  usePersonalizationState,
  usePersonalizationCompetitions,
  useSetPersonalization,
  useSkipPersonalization,
  useSaveProfileBasics,
  type TeamLite,
  type PersoComp,
} from "./personalizationApi";
import { catalogClubs, catalogNations, teamsForCompetition } from "./teamsCatalog";

const STEP_COUNT = 6;
const WC_CODES = ["WC", "fifa.world"];
const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

// Grupos colapsáveis da tela "times e campeonatos".
const GROUPS = ["Seleções", "Ligas e estaduais", "Copas", "Alternativos"] as const;
type Group = (typeof GROUPS)[number];

const SELECOES_CODES = new Set([
  "WC", "fifa.world", "fifa.friendly", "conmebol.america", "uefa.euro", "uefa.nations",
  "fifa.worldq.conmebol", "fifa.worldq.uefa", "fifa.worldq.concacaf", "fifa.worldq.afc",
  "fifa.worldq.caf", "caf.nations",
]);
const ALTERNATIVOS_CODES = new Set([
  "usa.1", "mex.1", "ksa.1", "por.1", "ned.1", "tur.1", "bel.1", "sco.1", "gre.1",
]);

const ORDER: string[] = [
  "WC", "fifa.world", "fifa.friendly",
  "conmebol.america", "uefa.euro", "uefa.nations",
  "fifa.worldq.conmebol", "fifa.worldq.uefa", "fifa.worldq.concacaf", "fifa.worldq.afc", "fifa.worldq.caf",
  "caf.nations",
  "bra.1", "bra.2", "bra.3",
  "bra.camp.paulista", "bra.camp.carioca", "bra.camp.mineiro", "bra.camp.gaucho",
  "eng.1", "esp.1", "ita.1", "ger.1", "fra.1",
  "bra.copa_do_brazil", "conmebol.libertadores", "conmebol.sudamericana",
  "uefa.champions", "uefa.europa", "uefa.europa.conf",
  "usa.1", "mex.1", "ksa.1", "por.1", "ned.1", "tur.1", "bel.1", "sco.1", "gre.1",
];
function orderIdx(code: string | null) {
  const i = ORDER.indexOf(code ?? "");
  return i === -1 ? 999 : i;
}
function groupOf(c: PersoComp): Group {
  const code = c.provider_code ?? "";
  if (SELECOES_CODES.has(code)) return "Seleções";
  if (ALTERNATIVOS_CODES.has(code)) return "Alternativos";
  return c.type === "LEAGUE" ? "Ligas e estaduais" : "Copas";
}
function compLabel(c: PersoComp) {
  if (WC_CODES.includes(c.provider_code ?? "")) return "Copa do Mundo";
  return c.display_name || c.name || c.provider_code || "Campeonato";
}

function TeamCrest({ team, size = 24 }: { team: TeamLite; size?: number }) {
  const src = team.local_crest || team.crest_url;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="shrink-0 rounded-sm object-contain"
        style={{ width: size, height: size }}
        loading="lazy"
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-sm bg-ink-100 text-[10px] font-bold text-ink-500"
      style={{ width: size, height: size }}
    >
      {(team.name?.[0] ?? "?").toUpperCase()}
    </span>
  );
}

function RoundCheck({ state }: { state: "empty" | "checked" | "partial" }) {
  return (
    <span
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
        state === "empty" ? "border-ink-300 bg-transparent" : "border-brand-600 bg-brand-600 text-white",
      )}
    >
      {state === "checked" && <Check className="size-3" strokeWidth={3.5} />}
      {state === "partial" && <Minus className="size-3" strokeWidth={3.5} />}
    </span>
  );
}

// Cabeçalho de etapa: ÍCONE e TÍTULO lado a lado; descrição abaixo, alinhada à esquerda.
function StepHeader({
  icon,
  tone,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", tone)}>{icon}</span>
        <h2 className="min-w-0 text-xl font-extrabold leading-tight tracking-tight text-ink-950">
          {title}
        </h2>
      </div>
      {subtitle && <p className="mt-2 text-sm leading-relaxed text-ink-500">{subtitle}</p>}
    </div>
  );
}

// Tela rolável simples (perfil, ranking+convite, notificações+instalar).
function FormScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-4 py-5">{children}</div>
    </div>
  );
}

// Meia-tela com ícone+título+descrição (telas divididas).
function SplitSection({
  icon,
  tone,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", tone)}>{icon}</span>
        <h3 className="min-w-0 text-base font-bold text-ink-900">{title}</h3>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{desc}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

// Tela de escolha de time: CABEÇALHO + BUSCA fixos; só a LISTA (ul) rola.
function PickerScreen({
  icon,
  tone,
  title,
  subtitle,
  teams,
  value,
  onChange,
  searchPlaceholder,
  emptyText,
}: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  subtitle: string;
  teams: TeamLite[];
  value: string;
  onChange: (id: string) => void;
  searchPlaceholder: string;
  emptyText: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return teams;
    return teams.filter(
      (x) => x.name.toLowerCase().includes(t) || (x.country ?? "").toLowerCase().includes(t),
    );
  }, [teams, q]);

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-xl shrink-0 px-4 pt-5">
        <StepHeader icon={icon} tone={tone} title={title} subtitle={subtitle} />
        <div className="mt-4 flex items-center gap-2 rounded-md border border-ink-200 bg-surface px-3">
          <Search className="size-4 shrink-0 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-ink-400"
          />
          {q && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => setQ("")}
              className="grid size-6 shrink-0 place-items-center rounded text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <ul className="mx-auto w-full max-w-xl flex-1 space-y-0.5 overflow-y-auto px-4 pb-5 pt-2">
        {teams.length === 0 ? (
          <li className="rounded-md bg-ink-50 px-3 py-6 text-center text-sm text-ink-500">{emptyText}</li>
        ) : filtered.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-ink-400">Nada encontrado.</li>
        ) : (
          filtered.map((t) => {
            const sel = t.id === value;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onChange(t.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition",
                    sel
                      ? "bg-surface font-semibold text-ink-950 ring-2 ring-inset ring-brand-600"
                      : "text-ink-700 hover:bg-ink-100",
                  )}
                >
                  <TeamCrest team={t} />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  {sel && <Check className="size-4 shrink-0 text-brand-600" />}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

export function PersonalizationPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const { user, profile } = useAuth();

  const { data: state } = usePersonalizationState();
  const { data: comps } = usePersonalizationCompetitions();
  const setPerso = useSetPersonalization();
  const saveProfile = useSaveProfileBasics();
  const skip = useSkipPersonalization();
  const join = useJoinByCode();

  const clubs = useMemo(() => catalogClubs(), []);
  const nationals = useMemo(() => catalogNations(), []);
  const codeToId = useMemo(() => {
    const m = new Map<string, string>();
    (comps ?? []).forEach((c) => {
      if (c.provider_code) m.set(c.provider_code, c.id);
    });
    return m;
  }, [comps]);
  const orderedComps = useMemo(
    () => [...(comps ?? [])].sort((a, b) => orderIdx(a.provider_code) - orderIdx(b.provider_code)),
    [comps],
  );

  const initialStep = Math.min(Math.max(Number(params.get("step") ?? 0) || 0, 0), STEP_COUNT - 1);
  const [step, setStep] = useState(initialStep);
  const [hydrated, setHydrated] = useState(false);
  const [wasEditing, setWasEditing] = useState(false);

  // Perfil (tela 0)
  const [name, setName] = useState("");
  const [uf, setUf] = useState("");
  const [crest, setCrest] = useState<string>("");
  // Preferências
  const [favoriteTeamId, setFavoriteTeamId] = useState<string>("");
  const [nationalId, setNationalId] = useState<string>("");
  const [followedComps, setFollowedComps] = useState<string[]>([]);
  const [followedTeams, setFollowedTeams] = useState<Record<string, string[]>>({});
  const [participateRtb, setParticipateRtb] = useState(true);
  const [code, setCode] = useState<string>(() => getStoredInvite());

  // Foto do Google (pra opção "Foto" no escudo) — igual ao Editar Perfil.
  const metaPhoto =
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.user_metadata?.picture as string | undefined) ||
    null;
  const savedAvatar = profile?.avatar_url ?? null;
  const googlePhoto =
    metaPhoto ||
    (savedAvatar && !savedAvatar.startsWith("gen:") && !savedAvatar.startsWith("crest:")
      ? savedAvatar
      : null);
  const editorInitial = useMemo(() => legacyToCrest(savedAvatar), [savedAvatar]);

  // Hidrata UMA vez quando os dados chegam (padrão sem efeito, evita cascata).
  if (state && !hydrated) {
    setHydrated(true);
    setName(profile?.display_name ?? "");
    setUf(profile?.uf ?? "");
    setCrest(editorInitial ?? "");
    setFavoriteTeamId(state.favorite_team_id ?? "");
    setNationalId(state.national_team_id ?? "");
    setFollowedComps(state.followed_competition_ids ?? []);
    setFollowedTeams(state.followed_teams ?? {});
    setParticipateRtb(state.show_in_global_ranking);
    setWasEditing(state.personalization_done);
  }

  function persist() {
    setPerso.mutate({
      favoriteTeamId: favoriteTeamId || null,
      nationalTeamId: nationalId || null,
      followedCompetitionIds: followedComps,
      followedTeams,
      showInRanking: participateRtb,
    });
    if (name.trim()) {
      saveProfile.mutate({ display_name: name.trim(), avatar_url: crest || null, uf: uf || null });
    }
  }
  function leave() {
    navigate(wasEditing ? "/perfil" : "/");
  }
  async function finish() {
    persist();
    if (code.trim()) {
      try {
        await join.mutateAsync(code.trim());
        clearStoredInvite();
        toast("Você entrou no grupo!", "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Código inválido.", "error");
      }
    }
    toast("Tudo pronto, Resultadista! 🎉", "success");
    leave();
  }
  function next() {
    persist();
    if (step >= STEP_COUNT - 1) void finish();
    else setStep((s) => s + 1);
  }
  function skipStep() {
    if (step >= STEP_COUNT - 1) {
      persist();
      leave();
    } else {
      setStep((s) => s + 1);
    }
  }
  function skipAll() {
    if (!wasEditing) skip.mutate();
    leave();
  }

  // ── seleção whole / parcial dos campeonatos ──────────────────────────────
  function toggleWhole(compId: string) {
    const isWhole = followedComps.includes(compId);
    if (isWhole) {
      setFollowedComps((p) => p.filter((x) => x !== compId));
    } else {
      setFollowedComps((p) => [...p, compId]);
      setFollowedTeams((p) => {
        const n = { ...p };
        delete n[compId];
        return n;
      });
    }
  }
  function toggleTeam(compId: string, teamId: string, allIds: string[]) {
    const isWhole = followedComps.includes(compId);
    const base = isWhole ? allIds : followedTeams[compId] ?? [];
    const nextSel = base.includes(teamId) ? base.filter((x) => x !== teamId) : [...base, teamId];
    const becomesWhole = allIds.length > 0 && nextSel.length === allIds.length;

    setFollowedComps((p) => {
      const without = p.filter((x) => x !== compId);
      return becomesWhole ? [...without, compId] : without;
    });
    setFollowedTeams((p) => {
      const n = { ...p };
      if (nextSel.length === 0 || becomesWhole) delete n[compId];
      else n[compId] = nextSel;
      return n;
    });
  }
  function followTeamEverywhere(teamId: string, compIds: string[]) {
    setFollowedTeams((p) => {
      const n = { ...p };
      compIds.forEach((cid) => {
        if (followedComps.includes(cid)) return;
        const cur = n[cid] ?? [];
        if (!cur.includes(teamId)) n[cid] = [...cur, teamId];
      });
      return n;
    });
  }

  const allCompIds = orderedComps.map((c) => c.id);
  const allWhole = allCompIds.length > 0 && allCompIds.every((id) => followedComps.includes(id));
  const anyFollow =
    followedComps.length > 0 || Object.values(followedTeams).some((a) => a.length > 0);
  function toggleAll() {
    if (allWhole) {
      setFollowedComps([]);
      setFollowedTeams({});
    } else {
      setFollowedComps(allCompIds);
      setFollowedTeams({});
    }
  }
  function selectGroup(ids: string[], whole: boolean) {
    setFollowedComps((p) => (whole ? [...new Set([...p, ...ids])] : p.filter((x) => !ids.includes(x))));
    setFollowedTeams((p) => {
      const n = { ...p };
      ids.forEach((id) => delete n[id]);
      return n;
    });
  }

  // gating do "Próximo" por tela: 0 perfil(nome) · 1 coração · 2 seleção · 3 acompanhar · 4/5 livres
  const canNext =
    step === 0
      ? !!name.trim()
      : step === 1
        ? !!favoriteTeamId
        : step === 2
          ? !!nationalId
          : step === 3
            ? anyFollow
            : true;

  const loadingBase = !state || !comps;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* topo: progresso + sair */}
      <div className="shrink-0 border-b border-border px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="flex flex-1 items-center gap-1.5">
            {Array.from({ length: STEP_COUNT }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-pill transition-colors",
                  i <= step ? "bg-brand-600" : "bg-ink-200",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={skipAll}
            className="shrink-0 rounded-pill px-2.5 py-1 text-sm font-semibold text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
          >
            {wasEditing ? "Fechar" : "Pular tudo"}
          </button>
        </div>
      </div>

      {/* meio: cada tela controla o próprio scroll */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {loadingBase ? (
          <div className="mx-auto max-w-xl space-y-3 px-4 py-5">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : step === 0 ? (
          <FormScreen>
            <StepHeader
              icon={<UserIcon className="size-5" />}
              tone="bg-surface-2 text-brand-600"
              title="Seu perfil"
              subtitle="Seu nome, estado e escudo — é como a galera te vê no Resultadismo."
            />
            <div className="mt-5 space-y-4">
              <div className="rounded-lg border border-border bg-surface p-4">
                <CrestEditor
                  key={hydrated ? "ready" : "loading"}
                  kind="escudo"
                  name={name}
                  initial={editorInitial}
                  shapes={ESCUDO_SHAPES}
                  allowPhoto
                  photoUrl={googlePhoto}
                  onChange={setCrest}
                />
              </div>
              <Input
                label="Nome"
                icon={<UserIcon className="size-4" />}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                required
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700" htmlFor="uf">
                  Estado (UF)
                </label>
                <select
                  id="uf"
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                  className="h-11 w-full rounded-md border border-ink-200 bg-surface px-3 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/40"
                >
                  <option value="">Prefiro não dizer</option>
                  {UFS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </FormScreen>
        ) : step === 1 ? (
          <PickerScreen
            key="pick-clubs"
            icon={<Heart className="size-5" />}
            tone="bg-surface-2 text-flame-600"
            title="Qual é o seu time do coração?"
            subtitle="Escolha um. Pra deixar o Resultadismo com a sua cara — muda quando quiser."
            teams={clubs}
            value={favoriteTeamId}
            onChange={setFavoriteTeamId}
            searchPlaceholder="Buscar time…"
            emptyText="Os clubes entram quando os campeonatos começarem. Você escolhe depois."
          />
        ) : step === 2 ? (
          <PickerScreen
            key="pick-nationals"
            icon={<Flag className="size-5" />}
            tone="bg-surface-2 text-grass-700"
            title="Pra que seleção você torce?"
            subtitle="É Copa do Mundo! Escolha a sua — o Brasil abre a lista."
            teams={nationals}
            value={nationalId}
            onChange={setNationalId}
            searchPlaceholder="Buscar seleção…"
            emptyText="As seleções entram quando a Copa for sincronizada."
          />
        ) : step === 3 ? (
          <div className="flex h-full flex-col">
            <div className="mx-auto w-full max-w-xl shrink-0 px-4 pb-2 pt-5">
              <StepHeader
                icon={<ShieldHalf className="size-5" />}
                tone="bg-surface-2 text-aqua-700"
                title="Quais times e campeonatos você quer acompanhar?"
                subtitle="Marque o campeonato inteiro ou abra pra escolher só alguns times. Dá pra seguir um time numa liga e não numa copa."
              />
            </div>
            <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-4 pb-5">
              <button
                type="button"
                onClick={toggleAll}
                className="mb-2 flex w-full items-center gap-3 rounded-md border border-ink-200 bg-surface px-3.5 py-3 text-left transition hover:border-ink-300"
              >
                <span className="flex-1 text-sm font-bold text-ink-900">Selecionar todos</span>
                <RoundCheck state={allWhole ? "checked" : anyFollow ? "partial" : "empty"} />
              </button>
              <div className="space-y-2">
                {GROUPS.map((g) => {
                  const groupComps = orderedComps.filter((c) => groupOf(c) === g);
                  if (groupComps.length === 0) return null;
                  return (
                    <GroupSection
                      key={g}
                      title={g}
                      comps={groupComps}
                      codeToId={codeToId}
                      followedComps={followedComps}
                      followedTeams={followedTeams}
                      defaultOpen={g === "Seleções"}
                      onSelectGroup={selectGroup}
                      onToggleWhole={toggleWhole}
                      onToggleTeam={toggleTeam}
                      onFollowEverywhere={followTeamEverywhere}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        ) : step === 4 ? (
          <FormScreen>
            <SplitSection
              icon={<Globe2 className="size-5" />}
              tone="bg-surface-2 text-brand-600"
              title="Bora pro ranking geral?"
              desc="O Resultadismo The Best junta todo mundo numa classificação só."
            >
              <div className="flex w-full items-center justify-between gap-3 rounded-md border border-ink-200 bg-surface p-4">
                <div className="min-w-0">
                  <span className="block text-sm font-bold text-ink-900">
                    Participar do Resultadismo The Best
                  </span>
                  <span className="block text-xs leading-snug text-ink-500">
                    Você aparece na classificação geral. Pode desligar quando quiser.
                  </span>
                </div>
                <Switch
                  checked={participateRtb}
                  onChange={setParticipateRtb}
                  label="Participar do Resultadismo The Best"
                />
              </div>
            </SplitSection>

            <hr className="my-6 border-border" />

            <SplitSection
              icon={<Ticket className="size-5" />}
              tone="bg-surface-2 text-gold-600"
              title="Recebeu o código de convite de alguém?"
              desc="Coloque aqui pra já entrar no grupo de quem te chamou."
            >
              <Input
                label="Código de convite"
                placeholder="Ex.: CRAQUE"
                icon={<Ticket className="size-4" />}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </SplitSection>
          </FormScreen>
        ) : (
          <FormScreen>
            <NotifSection userId={user?.id ?? null} onToast={toast} />
            <hr className="my-6 border-border" />
            <InstallSection />
          </FormScreen>
        )}
      </div>

      {/* baixo: nav colada */}
      <div className="shrink-0 border-t border-border bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              <ChevronLeft className="size-4" /> Voltar
            </Button>
          ) : (
            <span className="flex-1" />
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={skipStep}
            className="rounded-pill px-3 py-2 text-sm font-semibold text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
          >
            Pular
          </button>
          <Button
            onClick={next}
            disabled={!canNext}
            loading={step === STEP_COUNT - 1 && (setPerso.isPending || join.isPending)}
          >
            {step === STEP_COUNT - 1 ? "Concluir" : "Próximo"}
            {step < STEP_COUNT - 1 && <ChevronRight className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── tela final: notificações ────────────────────────────────────────────────
function NotifSection({
  userId,
  onToast,
}: {
  userId: string | null;
  onToast: (msg: string, kind?: "success" | "error" | "info") => void;
}) {
  const qc = useQueryClient();
  const { data: push } = useQuery({
    queryKey: ["onboarding-push"],
    queryFn: getPushState,
    staleTime: 10_000,
  });
  const [busy, setBusy] = useState(false);
  const on = !!push?.subscribed;

  async function toggle(next: boolean) {
    if (!userId) return;
    setBusy(true);
    const res = next ? await subscribePush(userId) : await unsubscribePush();
    setBusy(false);
    if (!res.ok) onToast(res.error ?? "Não foi possível agora.", "error");
    else onToast(next ? "Notificações ativadas!" : "Notificações desativadas.", "info");
    qc.invalidateQueries({ queryKey: ["onboarding-push"] });
  }

  return (
    <SplitSection
      icon={<Bell className="size-5" />}
      tone="bg-surface-2 text-brand-600"
      title="Ative as notificações"
      desc="Pra não esquecer de palpitar — a gente te lembra antes dos jogos."
    >
      {push?.supported ? (
        <div className="flex w-full items-center justify-between gap-3 rounded-md border border-ink-200 bg-surface p-4">
          <span className="min-w-0 text-sm font-bold text-ink-900">Receber lembretes e avisos</span>
          <Switch checked={on} onChange={toggle} disabled={busy} label="Ativar notificações" />
        </div>
      ) : (
        <p className="rounded-md border border-ink-200 bg-surface p-4 text-sm leading-relaxed text-ink-500">
          {isIOS()
            ? "No iPhone, instale o app na tela inicial primeiro (abaixo) — aí as notificações funcionam."
            : "Seu navegador não suporta notificações por aqui. Tente pelo Chrome do celular."}
        </p>
      )}
    </SplitSection>
  );
}

// ── tela final: instalar o app ──────────────────────────────────────────────
function InstallSection() {
  const state = useInstallState();
  return (
    <SplitSection
      icon={<Download className="size-5" />}
      tone="bg-surface-2 text-grass-700"
      title="Instale o app"
      desc="Abre num toque na tela inicial e garante os lembretes dos seus palpites."
    >
      {state === "installable" ? (
        <Button onClick={() => void promptInstall()}>
          <Download className="size-4" /> Instalar app
        </Button>
      ) : state === "installed" ? (
        <p className="rounded-md border border-brand-600 bg-surface p-4 text-sm font-semibold text-brand-700">
          App já instalado ✓
        </p>
      ) : state === "ios" ? (
        <p className="rounded-md border border-ink-200 bg-surface p-4 text-sm leading-relaxed text-ink-600">
          Toque em
          <Share className="mx-1 inline size-3.5 -translate-y-px text-brand-600" aria-label="Compartilhar" />
          <span className="font-semibold">Compartilhar</span> e depois em{" "}
          <span className="inline-flex translate-y-px items-center gap-0.5 font-semibold">
            <SquarePlus className="size-3.5" /> Adicionar à Tela de Início
          </span>
          .
        </p>
      ) : (
        <p className="rounded-md border border-ink-200 bg-surface p-4 text-sm leading-relaxed text-ink-500">
          Abra no Chrome (Android) ou no Safari (iPhone) do celular pra instalar.
        </p>
      )}
    </SplitSection>
  );
}

// Grupo colapsável (Seleções / Ligas / Copas / Alternativos) com seleção do
// grupo inteiro (checkbox tri-state à direita) + lista de campeonatos dentro.
function GroupSection({
  title,
  comps,
  codeToId,
  followedComps,
  followedTeams,
  defaultOpen,
  onSelectGroup,
  onToggleWhole,
  onToggleTeam,
  onFollowEverywhere,
}: {
  title: string;
  comps: PersoComp[];
  codeToId: Map<string, string>;
  followedComps: string[];
  followedTeams: Record<string, string[]>;
  defaultOpen: boolean;
  onSelectGroup: (ids: string[], whole: boolean) => void;
  onToggleWhole: (compId: string) => void;
  onToggleTeam: (compId: string, teamId: string, allIds: string[]) => void;
  onFollowEverywhere: (teamId: string, compIds: string[]) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const ids = comps.map((c) => c.id);
  const allWhole = ids.length > 0 && ids.every((id) => followedComps.includes(id));
  const selCount = comps.filter(
    (c) => followedComps.includes(c.id) || (followedTeams[c.id]?.length ?? 0) > 0,
  ).length;
  const state: "empty" | "checked" | "partial" =
    allWhole ? "checked" : selCount > 0 ? "partial" : "empty";

  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-border">
      <div className="flex items-center bg-ink-100">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-left"
        >
          <ChevronDown
            className={cn("size-4 shrink-0 text-ink-500 transition-transform", open && "rotate-180")}
          />
          <span className="min-w-0 flex-1 truncate text-sm font-bold uppercase tracking-wide text-ink-700">
            {title}
          </span>
          {selCount > 0 && (
            <span className="rounded-pill bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">
              {selCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onSelectGroup(ids, !allWhole)}
          aria-label={`Selecionar ${title} inteiro`}
          className="grid place-items-center px-3 py-3"
        >
          <RoundCheck state={state} />
        </button>
      </div>
      {open && (
        <div className="space-y-2 bg-surface-2 p-2">
          {comps.map((c) => (
            <CompetitionItem
              key={c.id}
              label={compLabel(c)}
              providerCode={c.provider_code ?? ""}
              codeToId={codeToId}
              whole={followedComps.includes(c.id)}
              selectedTeamIds={followedTeams[c.id] ?? []}
              onToggleWhole={() => onToggleWhole(c.id)}
              onToggleTeam={(teamId, allIds) => onToggleTeam(c.id, teamId, allIds)}
              onFollowEverywhere={onFollowEverywhere}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Campeonato: seta à esquerda + nome; checkbox redondo à direita (inteiro/
// parcial). Abre pra escolher times individuais (checkbox redondo cada).
function CompetitionItem({
  label,
  providerCode,
  codeToId,
  whole,
  selectedTeamIds,
  onToggleWhole,
  onToggleTeam,
  onFollowEverywhere,
}: {
  label: string;
  providerCode: string;
  codeToId: Map<string, string>;
  whole: boolean;
  selectedTeamIds: string[];
  onToggleWhole: () => void;
  onToggleTeam: (teamId: string, allIds: string[]) => void;
  onFollowEverywhere: (teamId: string, compIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState<string | null>(null);
  const teams = useMemo(
    () => (open ? teamsForCompetition(providerCode, codeToId) : []),
    [open, providerCode, codeToId],
  );
  const allIds = useMemo(() => teams.map((t) => t.id), [teams]);
  const parentState: "empty" | "checked" | "partial" = whole
    ? "checked"
    : selectedTeamIds.length > 0
      ? "partial"
      : "empty";
  const countLabel = whole ? null : selectedTeamIds.length > 0 ? `${selectedTeamIds.length}` : null;

  return (
    <div className="overflow-hidden rounded-md border border-ink-200">
      <div className="flex items-center bg-surface">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-left transition hover:bg-ink-50"
        >
          <ChevronDown
            className={cn("size-4 shrink-0 text-ink-400 transition-transform", open && "rotate-180")}
          />
          <span className="min-w-0 flex-1 truncate font-semibold text-ink-900">{label}</span>
          {countLabel && (
            <span className="rounded-pill bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">
              {countLabel}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onToggleWhole}
          aria-label={`Acompanhar ${label} inteiro`}
          className="grid h-full place-items-center px-3 py-3"
        >
          <RoundCheck state={parentState} />
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-surface-2 p-2">
          {teams.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-ink-500">
              Os times deste campeonato entram quando a lista for preenchida.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {teams.map((t) => {
                const on = whole || selectedTeamIds.includes(t.id);
                const nComps = t.in_competitions?.length ?? 0;
                const multi = nComps > 1;
                const isChoosing = choosing === t.id;
                const handleTap = () => {
                  if (on) {
                    onToggleTeam(t.id, allIds);
                  } else if (multi) {
                    setChoosing((c) => (c === t.id ? null : t.id));
                  } else {
                    onToggleTeam(t.id, allIds);
                  }
                };
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={handleTap}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm transition",
                        on
                          ? "bg-surface text-ink-950 ring-2 ring-inset ring-brand-600"
                          : "text-ink-700 hover:bg-ink-100",
                      )}
                    >
                      <TeamCrest team={t} size={22} />
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      {multi && !on && (
                        <span className="shrink-0 rounded-pill bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">
                          {nComps} camp.
                        </span>
                      )}
                      <RoundCheck state={on ? "checked" : isChoosing ? "partial" : "empty"} />
                    </button>
                    {isChoosing && (
                      <div className="mb-1 ml-9 mr-1 mt-1 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            onToggleTeam(t.id, allIds);
                            setChoosing(null);
                          }}
                          className="flex-1 rounded-md border border-ink-200 bg-surface px-2 py-1.5 text-xs font-semibold text-ink-700 transition hover:border-ink-300"
                        >
                          Só neste
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onFollowEverywhere(t.id, t.in_competitions ?? []);
                            setChoosing(null);
                          }}
                          className="flex-1 rounded-md bg-brand-600 px-2 py-1.5 text-xs font-bold text-white transition hover:bg-brand-700"
                        >
                          Em todos ({nComps})
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
