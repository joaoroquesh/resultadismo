import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, Flag, ShieldHalf, Globe2, ChevronRight } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { Switch } from "@/components/ui/Switch";
import { CrestEditor } from "@/components/ui/CrestEditor";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { ESCUDO_SHAPES, legacyToCrest } from "@/lib/crest";
import { usePersonalizationState } from "@/features/onboarding/personalizationApi";
import { catalogClubs, catalogNations } from "@/features/onboarding/teamsCatalog";
import { useSetGlobalRankingVisibility } from "@/features/ranking/api";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

// Linha de preferência: ícone + label + preview do que foi escolhido → abre o
// editor focado (personalização em modo "editar um item"); Salvar volta pra cá.
function PrefRow({
  to,
  icon,
  label,
  crest,
  value,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  crest?: string | null;
  value?: string | null;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-md border border-ink-200 bg-surface px-3.5 py-3 transition hover:border-ink-300"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-600">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">{label}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
          {crest && <img src={crest} alt="" className="size-4 rounded-sm object-contain" />}
          <span className="truncate">{value || "Escolher"}</span>
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-ink-400" />
    </Link>
  );
}

export function EditarPerfilPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, user, refreshProfile } = useAuth();
  const { data: state } = usePersonalizationState();
  const setRtb = useSetGlobalRankingVisibility();

  const metaPhoto =
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.user_metadata?.picture as string | undefined) ||
    null;
  const saved = profile?.avatar_url ?? null;
  const googlePhoto =
    metaPhoto ||
    (saved && !saved.startsWith("gen:") && !saved.startsWith("crest:") ? saved : null);
  const initialCrest = legacyToCrest(saved);

  const [name, setName] = useState(profile?.display_name ?? "");
  const [uf, setUf] = useState(profile?.uf ?? "");
  const [crest, setCrest] = useState<string>(initialCrest ?? "");
  const [busy, setBusy] = useState(false);
  const [rtb, setRtbLocal] = useState<boolean>(true);
  const [rtbHydrated, setRtbHydrated] = useState(false);
  if (state && !rtbHydrated) {
    setRtbHydrated(true);
    setRtbLocal(state.show_in_global_ranking);
  }

  const clubs = useMemo(() => catalogClubs(), []);
  const nations = useMemo(() => catalogNations(), []);
  const favTeam = clubs.find((t) => t.id === state?.favorite_team_id);
  const natTeam = nations.find((t) => t.id === state?.national_team_id);
  const followCount =
    (state?.followed_competition_ids?.length ?? 0) +
    Object.keys(state?.followed_teams ?? {}).length;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name.trim(), avatar_url: crest || null, uf: uf || null })
      .eq("id", user.id);
    setBusy(false);
    if (error) return toast(error.message, "error");
    await refreshProfile();
    toast("Perfil atualizado!", "success");
    navigate("/perfil");
  }

  function toggleRtb(next: boolean) {
    setRtbLocal(next);
    setRtb.mutate(next);
  }

  return (
    <Page
      title="Editar perfil"
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate("/perfil")} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* topo: escudo + nome ao lado + email abaixo */}
        <Card className="flex items-center gap-4 p-4">
          <Avatar src={crest || null} name={name} size="xl" />
          <div className="min-w-0 flex-1 space-y-1">
            <Input
              label="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              required
            />
            <p className="truncate text-xs text-ink-500">{user?.email}</p>
          </div>
        </Card>

        {/* editor de escudo */}
        <Card className="space-y-4 p-4">
          <div>
            <p className="text-sm font-semibold text-ink-800">Seu escudo</p>
            <p className="text-xs text-ink-500">
              Escolha a forma e preencha com cores ou com a sua foto. Sem foto, entra a inicial do
              seu nome.
            </p>
          </div>
          <CrestEditor
            kind="escudo"
            name={name}
            initial={initialCrest}
            shapes={ESCUDO_SHAPES}
            allowPhoto
            photoUrl={googlePhoto}
            onChange={setCrest}
          />
        </Card>

        {/* UF em chips */}
        <Card className="p-4">
          <label className="mb-2 block text-sm font-semibold text-ink-800">
            Seu estado <span className="font-normal text-ink-400">· opcional</span>
          </label>
          <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-2 pb-1">
              {UFS.map((u) => {
                const on = uf === u;
                return (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUf(on ? "" : u)}
                    aria-pressed={on}
                    className={cn(
                      "shrink-0 rounded-pill border px-3.5 py-2 text-sm font-bold transition",
                      on
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-ink-200 bg-surface text-ink-700 hover:border-ink-300",
                    )}
                  >
                    {u}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        {/* preferências (preview → editar) */}
        <Card className="space-y-2 p-2">
          <PrefRow
            to="/perfil/personalizar?only=coracao"
            icon={<Heart className="size-4" />}
            label="Time do coração"
            crest={favTeam?.local_crest}
            value={favTeam?.name}
          />
          <PrefRow
            to="/perfil/personalizar?only=selecao"
            icon={<Flag className="size-4" />}
            label="Seleção que torce"
            crest={natTeam?.local_crest}
            value={natTeam?.name}
          />
          <PrefRow
            to="/perfil/personalizar?only=campeonatos"
            icon={<ShieldHalf className="size-4" />}
            label="Campeonatos e times"
            value={followCount ? `${followCount} selecionado(s)` : null}
          />
        </Card>

        {/* The Best — no FIM */}
        <Card className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <Globe2 className="size-4 text-brand-600" /> Resultadismo The Best
            </p>
            <p className="text-xs text-ink-500">Aparecer na classificação geral pública.</p>
          </div>
          <Switch checked={rtb} onChange={toggleRtb} label="Participar do Resultadismo The Best" />
        </Card>

        <Button type="submit" fullWidth loading={busy} disabled={!name.trim()}>
          Salvar
        </Button>
      </form>
    </Page>
  );
}
