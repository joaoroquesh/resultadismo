import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Heart,
  Flag,
  Trophy,
  ShieldHalf,
  Globe2,
  Ticket,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Combobox, type ComboOption } from "@/components/ui/Combobox";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useJoinByCode } from "@/features/leagues/api";
import {
  usePersonalizationState,
  useAllTeams,
  usePersonalizationCompetitions,
  useTeamsByCompetition,
  useSetPersonalization,
  useSkipPersonalization,
  type TeamLite,
  type PersoComp,
} from "./personalizationApi";

// Campeonatos de clube (entram no acordeão "times que acompanha"). Sem Série D.
const CLUB_LEAGUE_CODES = ["bra.1", "bra.2", "bra.3", "eng.1", "esp.1", "ita.1", "ger.1", "fra.1"];
const STEP_COUNT = 5;

function TeamCrest({ team, size = 22 }: { team: TeamLite; size?: number }) {
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

export function PersonalizationPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();

  const { data: state } = usePersonalizationState();
  const { data: allTeams } = useAllTeams();
  const { data: comps } = usePersonalizationCompetitions();
  const setPerso = useSetPersonalization();
  const skip = useSkipPersonalization();
  const join = useJoinByCode();

  // Copa do Mundo + seleções (pra "seleção que torce").
  const wc = comps?.find((c) => c.provider_code === "fifa.world");
  const { data: nationalTeams } = useTeamsByCompetition(wc?.id ?? null);
  const nationalIds = useMemo(
    () => new Set((nationalTeams ?? []).map((t) => t.id)),
    [nationalTeams],
  );
  // "Time do coração" = clubes (tudo menos seleções).
  const clubs = useMemo(
    () => (allTeams ?? []).filter((t) => !nationalIds.has(t.id)),
    [allTeams, nationalIds],
  );
  const clubLeagues = useMemo(
    () =>
      CLUB_LEAGUE_CODES.map((code) => comps?.find((c) => c.provider_code === code)).filter(
        Boolean,
      ) as PersoComp[],
    [comps],
  );

  const initialStep = Math.min(Math.max(Number(params.get("step") ?? 0) || 0, 0), STEP_COUNT - 1);
  const [step, setStep] = useState(initialStep);
  const [hydrated, setHydrated] = useState(false);
  const [wasEditing, setWasEditing] = useState(false);

  const [favoriteTeamId, setFavoriteTeamId] = useState<string>("");
  const [nationalId, setNationalId] = useState<string>("");
  const [followedComps, setFollowedComps] = useState<string[]>([]);
  const [followedTeams, setFollowedTeams] = useState<string[]>([]);
  const [participateRtb, setParticipateRtb] = useState(true);
  const [code, setCode] = useState("");

  // Hidrata o estado local a partir do que já está salvo (uma vez).
  useEffect(() => {
    if (hydrated || !state || !comps) return;
    setFavoriteTeamId(state.favorite_team_id ?? "");
    setNationalId(state.national_team_id ?? "");
    setFollowedComps(
      state.followed_competition_ids.length
        ? state.followed_competition_ids
        : wc?.id
          ? [wc.id]
          : [],
    );
    setFollowedTeams(state.followed_team_ids);
    setParticipateRtb(state.show_in_global_ranking);
    setWasEditing(state.personalization_done);
    setHydrated(true);
  }, [hydrated, state, comps, wc?.id]);

  // Default Brasil quando ainda não escolheu seleção.
  useEffect(() => {
    if (!hydrated || nationalId || state?.national_team_id) return;
    const brasil = (nationalTeams ?? []).find((t) => /bra[sz]il/i.test(t.name));
    if (brasil) setNationalId(brasil.id);
  }, [hydrated, nationalId, nationalTeams, state?.national_team_id]);

  function persist() {
    setPerso.mutate({
      favoriteTeamId: favoriteTeamId || null,
      nationalTeamId: nationalId || null,
      followedCompetitionIds: followedComps,
      followedTeamIds: followedTeams,
      showInRanking: participateRtb,
    });
  }

  function leave() {
    navigate(wasEditing ? "/perfil" : "/");
  }

  async function finish() {
    persist();
    if (code.trim()) {
      try {
        await join.mutateAsync(code.trim());
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
    if (step >= STEP_COUNT - 1) {
      void finish();
    } else {
      setStep((s) => s + 1);
    }
  }

  function skipAll() {
    if (wasEditing) {
      leave();
    } else {
      skip.mutate();
      leave();
    }
  }

  const teamOptions: ComboOption[] = clubs.map((t) => ({
    value: t.id,
    label: t.name,
    keywords: t.country ?? "",
    leading: <TeamCrest team={t} />,
  }));
  const nationalOptions: ComboOption[] = (nationalTeams ?? []).map((t) => ({
    value: t.id,
    label: t.name,
    leading: <TeamCrest team={t} />,
  }));

  const loadingBase = !state || !comps;

  return (
    <Page
      title="Personalização"
      action={
        <button
          type="button"
          onClick={skipAll}
          className="rounded-pill px-3 py-1.5 text-sm font-semibold text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
        >
          {wasEditing ? "Fechar" : "Pular tudo"}
        </button>
      }
    >
      {/* progresso */}
      <div className="mb-5 flex items-center gap-1.5">
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

      {loadingBase ? (
        <div className="space-y-3">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <div className="min-h-[46vh]">
          {/* 0 · Time do coração */}
          {step === 0 && (
            <ScreenShell
              icon={<Heart className="size-6" />}
              tone="bg-flame-500/12 text-flame-600"
              title="Qual é o seu time do coração?"
              subtitle="Pra deixar o Resultadismo com a sua cara. Pode mudar quando quiser."
            >
              <Combobox
                ariaLabel="Time do coração"
                value={favoriteTeamId}
                onChange={setFavoriteTeamId}
                options={teamOptions}
                placeholder="Escolher meu time…"
                searchPlaceholder="Buscar time…"
                allowClear
                emptyText="Os clubes aparecem quando os campeonatos começarem."
              />
              {clubs.length === 0 && (
                <p className="mt-2 text-xs leading-snug text-ink-500">
                  Ainda estamos trazendo os clubes dos campeonatos. Volta aqui depois pra escolher o
                  seu, Resultadista.
                </p>
              )}
            </ScreenShell>
          )}

          {/* 1 · Seleção que torce */}
          {step === 1 && (
            <ScreenShell
              icon={<Flag className="size-6" />}
              tone="bg-grass-500/12 text-grass-700"
              title="Pra que seleção você torce?"
              subtitle="É Copa do Mundo! Deixamos o Brasil marcado, mas a escolha é sua."
            >
              <Combobox
                ariaLabel="Seleção que torce"
                value={nationalId}
                onChange={setNationalId}
                options={nationalOptions}
                placeholder="Escolher seleção…"
                searchPlaceholder="Buscar seleção…"
                allowClear
              />
            </ScreenShell>
          )}

          {/* 2 · Campeonatos que deseja acompanhar */}
          {step === 2 && (
            <ScreenShell
              icon={<Trophy className="size-6" />}
              tone="bg-gold-500/12 text-gold-700"
              title="Quais campeonatos você quer acompanhar?"
              subtitle="A gente destaca os jogos deles pra você. Marque quantos quiser."
            >
              <div className="flex flex-wrap gap-2">
                {comps!.map((c) => {
                  const on = followedComps.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setFollowedComps((prev) =>
                          on ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                        )
                      }
                      className={cn(
                        "flex items-center gap-1.5 rounded-pill border px-3 py-2 text-sm font-semibold transition",
                        on
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-ink-200 bg-surface text-ink-700 hover:border-ink-300",
                      )}
                    >
                      {on && <Check className="size-3.5" />}
                      {c.display_name ?? c.name}
                    </button>
                  );
                })}
              </div>
            </ScreenShell>
          )}

          {/* 3 · Times que deseja acompanhar (acordeão por campeonato) */}
          {step === 3 && (
            <ScreenShell
              icon={<ShieldHalf className="size-6" />}
              tone="bg-aqua-500/12 text-aqua-700"
              title="E os times pra ficar de olho?"
              subtitle="Abra um campeonato e escolha os times. Dá pra marcar todos de uma vez."
            >
              <div className="space-y-2">
                {clubLeagues.length === 0 ? (
                  <p className="rounded-md bg-ink-50 px-3 py-4 text-center text-sm text-ink-500">
                    Os times entram quando os campeonatos começarem. Você escolhe depois.
                  </p>
                ) : (
                  clubLeagues.map((c) => (
                    <LeagueAccordion
                      key={c.id}
                      comp={c}
                      selected={followedTeams}
                      onChange={setFollowedTeams}
                    />
                  ))
                )}
              </div>
            </ScreenShell>
          )}

          {/* 4 · Resultadismo The Best + código */}
          {step === 4 && (
            <ScreenShell
              icon={<Globe2 className="size-6" />}
              tone="bg-brand-500/12 text-brand-600"
              title="Bora pro ranking geral?"
              subtitle="O Resultadismo The Best junta todo mundo numa classificação só."
            >
              <button
                type="button"
                onClick={() => setParticipateRtb((v) => !v)}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-ink-200 bg-surface p-4 text-left transition hover:border-ink-300"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-ink-900">
                    Participar do Resultadismo The Best
                  </span>
                  <span className="block text-xs leading-snug text-ink-500">
                    Você aparece na classificação geral. Pode desligar quando quiser.
                  </span>
                </span>
                <span
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-pill transition-colors",
                    participateRtb ? "bg-brand-600" : "bg-ink-300",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 size-5 rounded-full bg-white transition-all",
                      participateRtb ? "left-[22px]" : "left-0.5",
                    )}
                  />
                </span>
              </button>

              <div className="mt-4">
                <Input
                  label="Tem código de convite?"
                  placeholder="Ex.: CRAQUE"
                  icon={<Ticket className="size-4" />}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
                <p className="mt-1 text-xs text-ink-500">Já entra no grupo de quem te chamou.</p>
              </div>
            </ScreenShell>
          )}
        </div>
      )}

      {/* navegação */}
      <div className="mt-6 flex items-center gap-2">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
            <ChevronLeft className="size-4" /> Voltar
          </Button>
        ) : (
          <span className="flex-1" />
        )}
        <span className="flex-1" />
        {step < STEP_COUNT - 1 && (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="rounded-pill px-3 py-2 text-sm font-semibold text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
          >
            Pular
          </button>
        )}
        <Button onClick={next} loading={step === STEP_COUNT - 1 && (setPerso.isPending || join.isPending)}>
          {step === STEP_COUNT - 1 ? "Concluir" : "Próximo"}
          {step < STEP_COUNT - 1 && <ChevronRight className="size-4" />}
        </Button>
      </div>
    </Page>
  );
}

function ScreenShell({
  icon,
  tone,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className={cn("mb-4 grid size-12 place-items-center rounded-full", tone)}>{icon}</span>
      <h2 className="text-xl font-extrabold tracking-tight text-ink-950">{title}</h2>
      <p className="mb-5 mt-1 text-sm leading-relaxed text-ink-500">{subtitle}</p>
      {children}
    </div>
  );
}

// Campeonato no acordeão: abre → busca os times; "todos" + multi-seleção.
function LeagueAccordion({
  comp,
  selected,
  onChange,
}: {
  comp: PersoComp;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: teams, isLoading } = useTeamsByCompetition(open ? comp.id : null);
  const ids = useMemo(() => (teams ?? []).map((t) => t.id), [teams]);
  const countSel = (teams ?? []).filter((t) => selected.includes(t.id)).length;
  const allOn = ids.length > 0 && ids.every((id) => selected.includes(id));

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  function toggleAll() {
    if (allOn) onChange(selected.filter((id) => !ids.includes(id)));
    else onChange([...new Set([...selected, ...ids])]);
  }

  return (
    <div className="overflow-hidden rounded-md border border-ink-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 bg-surface px-3.5 py-3 text-left transition hover:bg-ink-50"
      >
        <span className="font-semibold text-ink-900">{comp.display_name ?? comp.name}</span>
        <span className="flex items-center gap-2">
          {countSel > 0 && (
            <span className="rounded-pill bg-brand-500/12 px-2 py-0.5 text-xs font-bold text-brand-700">
              {countSel}
            </span>
          )}
          <ChevronDown
            className={cn("size-4 text-ink-400 transition-transform", open && "rotate-180")}
          />
        </span>
      </button>

      {open && (
        <div className="border-t border-border bg-surface-2 p-2">
          {isLoading ? (
            <div className="space-y-1.5 p-1">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (teams ?? []).length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-ink-500">
              Os times deste campeonato entram quando a temporada começar.
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleAll}
                className="mb-1 flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm font-semibold text-brand-700 transition hover:bg-brand-500/8"
              >
                <span
                  className={cn(
                    "grid size-4 place-items-center rounded border",
                    allOn ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300",
                  )}
                >
                  {allOn && <Check className="size-3" />}
                </span>
                Selecionar todos
              </button>
              <ul className="space-y-0.5">
                {teams!.map((t) => {
                  const on = selected.includes(t.id);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => toggle(t.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm transition",
                          on ? "bg-brand-500/8 text-ink-950" : "text-ink-700 hover:bg-ink-100",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-4 shrink-0 place-items-center rounded border",
                            on ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300",
                          )}
                        >
                          {on && <Check className="size-3" />}
                        </span>
                        <TeamCrest team={t} size={20} />
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
