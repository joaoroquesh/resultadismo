import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldHalf, Flag, Ticket, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { useJoinByCode } from "@/features/leagues/api";

// Mostra UMA VEZ na entrada (controlado por profiles.personalization_done).
// 3 campos curtos: time do coração, seleção (default Brasil), código de convite.
// Pode pular.
export function PersonalizationModal() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const join = useJoinByCode();

  const { data: state } = useQuery({
    enabled: !!user,
    queryKey: ["profile-personalization", user?.id],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("personalization_done, favorite_team_id, national_team_id")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: teams } = useQuery({
    enabled: !!user && state?.personalization_done === false,
    queryKey: ["all-teams-personalization"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, country")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [teamId, setTeamId] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  // Default Brasil
  const brasil = useMemo(
    () =>
      teams?.find(
        (t) => t.name.toLowerCase() === "brasil" || t.name.toLowerCase() === "brazil",
      ),
    [teams],
  );
  const effectiveNational = nationalId || brasil?.id || "";

  const skip = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("skip_personalization");
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile-personalization", user?.id] }),
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_personalization", {
        p_favorite_team_id: teamId || undefined,
        p_national_team_id: effectiveNational || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile-personalization", user?.id] }),
  });

  if (!user || !state || state.personalization_done) return null;

  async function handleSave() {
    setBusy(true);
    try {
      // 1) salva personalização
      await save.mutateAsync();
      // 2) se tem código de convite, tenta entrar no grupo
      if (code.trim()) {
        try {
          await join.mutateAsync(code.trim());
          toast("Você entrou no grupo!", "success");
        } catch (err) {
          // Não derruba o flow — só avisa.
          toast(err instanceof Error ? err.message : "Código inválido.", "error");
        }
      }
      toast("Tudo pronto, Resultadista!", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao salvar.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/40 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-md overflow-hidden rounded-t-2xl bg-background shadow-2xl sm:rounded-2xl">
        {/* Header curto */}
        <div className="bg-brand-600 px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4" />
            <h2 className="text-base font-extrabold">Vamos personalizar?</h2>
          </div>
          <p className="mt-1 text-xs text-white/85">Em 30 segundos. Pode pular.</p>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* Time do coração */}
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
              <ShieldHalf className="size-4 text-brand-600" /> Time do coração
            </span>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="h-11 w-full rounded-md border border-ink-200 bg-surface px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">Não vou escolher agora</option>
              {teams?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.country ? ` (${t.country})` : ""}
                </option>
              ))}
            </select>
          </label>

          {/* Seleção */}
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
              <Flag className="size-4 text-brand-600" /> Seleção que torce
            </span>
            <select
              value={effectiveNational}
              onChange={(e) => setNationalId(e.target.value)}
              className="h-11 w-full rounded-md border border-ink-200 bg-surface px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">Sem preferência</option>
              {teams?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {brasil && !nationalId && (
              <span className="mt-1 block text-[11px] text-ink-500">
                Pré-selecionado: <span className="font-semibold text-ink-700">Brasil</span>
              </span>
            )}
          </label>

          {/* Código de convite */}
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
              <Ticket className="size-4 text-brand-600" /> Tem código de convite?
            </span>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ex.: CRAQUE"
              className="h-11 w-full rounded-md border border-ink-200 bg-surface px-3 text-sm uppercase outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
            <span className="mt-1 block text-[11px] text-ink-500">
              Já entra no grupo de quem te convidou.
            </span>
          </label>
        </div>

        {/* Ações */}
        <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-2 px-5 py-3">
          <button
            type="button"
            onClick={() => skip.mutate()}
            disabled={skip.isPending}
            className="text-sm font-medium text-ink-500 hover:text-ink-800 disabled:opacity-50"
          >
            Pular
          </button>
          <Button onClick={handleSave} loading={busy}>
            Salvar e jogar
          </Button>
        </div>
      </div>
    </div>
  );
}
