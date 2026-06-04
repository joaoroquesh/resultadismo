import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useCompetitions, findWorldCupCompetition } from "@/features/matches/api";
import { useAddLeagueCompetition, useDeleteLeagueCompetition } from "../api";
import { useNamePrefixes, requiredPrefix, NAME_PREFIX_DEFAULTS } from "../naming";
import type { LeagueMode } from "@/lib/types";

// Limite inicial: 1 competição por grupo. Quando a base de usuários crescer e
// os modos extras (Liga / Copa) estiverem prontos, soltamos o limite e habilitamos
// os outros modos de disputa.
const MAX_COMPETITIONS_PER_LEAGUE = 1;

export function CompeticoesTab({
  leagueId,
  comps,
  confrontoEnabled,
}: {
  leagueId: string;
  comps: { id: string; name: string; mode: string }[];
  confrontoEnabled: boolean;
}) {
  const { data: competitions } = useCompetitions();
  const add = useAddLeagueCompetition();
  const del = useDeleteLeagueCompetition();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [competitionId, setCompetitionId] = useState("");
  const [name, setName] = useState("");
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  // Grupo comum: modo fixo em "points" (Liga/Copa ficam como "em breve").
  // Grupo habilitada pelo admin (confronto_enabled): o admin escolhe Pontos ou
  // Confronto (Liga/Copa) e pode criar várias competições (sem o limite do MVP).
  const [tipo, setTipo] = useState<"pontos" | "confronto">("pontos");
  const [formato, setFormato] = useState<"liga" | "cup">("liga");
  const [participantMode, setParticipantMode] = useState<"admin" | "optin">("admin");
  const mode: LeagueMode = !confrontoEnabled || tipo === "pontos" ? "points" : formato;
  const isConfrontoNew = mode === "liga" || mode === "cup";

  // Prefixo do tipo (Bolão/Liga/Copa) entra como badge fixa — a pessoa digita só o resto.
  const { data: prefixesData } = useNamePrefixes();
  const prefixes = prefixesData ?? NAME_PREFIX_DEFAULTS;
  const prefix = requiredPrefix(mode, prefixes);

  // Pré-preenche um complemento sugerido ao abrir (o prefixo é a badge).
  useEffect(() => {
    if (!open || competitionId || !competitions?.length) return;
    const wc = findWorldCupCompetition(competitions);
    if (wc) {
      setCompetitionId(wc.id);
      setName((cur) => cur || "da Copa do Mundo 2026");
    }
  }, [open, competitions, competitionId]);

  // Grupos habilitadas (teste de Confronto) não têm limite de competições.
  const reachedLimit = !confrontoEnabled && comps.length >= MAX_COMPETITIONS_PER_LEAGUE;

  async function handleAdd() {
    if (!competitionId || !name.trim()) return;
    try {
      await add.mutateAsync({
        leagueId,
        competitionId,
        name: `${prefix} ${name.trim()}`.trim(),
        mode,
        participantMode: isConfrontoNew ? participantMode : undefined,
      });
      toast(
        isConfrontoNew
          ? "Disputa criada! Agora configure e libere o sorteio."
          : "Competição adicionada!",
        "success",
      );
      setOpen(false);
      setName("");
      setCompetitionId("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao adicionar.", "error");
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await del.mutateAsync({ leagueId, lcId: toDelete.id });
      toast(`Competição "${toDelete.name}" removida.`, "success");
      setToDelete(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao remover.", "error");
    }
  }

  return (
    <div className="space-y-3">
      {comps.map((c) => (
        <Card key={c.id} className="flex items-center gap-2 p-3.5">
          <span className="min-w-0 flex-1 truncate font-semibold text-ink-900">{c.name}</span>
          <Badge tone="neutral">
            {c.mode === "liga"
              ? "Liga"
              : c.mode === "cup"
                ? "Copa"
                : c.mode === "table"
                  ? "Tabela"
                  : "Pontos"}
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Remover competição"
            onClick={() => setToDelete({ id: c.id, name: c.name })}
          >
            <Trash2 className="size-4 text-flame-500" />
          </Button>
        </Card>
      ))}

      {reachedLimit ? (
        <p className="rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-500">
          Limite inicial de {MAX_COMPETITIONS_PER_LEAGUE} competição por grupo.
          Remova a atual para trocar por outra.
        </p>
      ) : open ? (
        <Card className="space-y-3 p-4">
          <select
            aria-label="Competição"
            value={competitionId}
            onChange={(e) => setCompetitionId(e.target.value)}
            className="h-11 w-full rounded-md border border-ink-200 bg-surface px-3 outline-none focus:border-brand-500"
          >
            <option value="">Escolher competição…</option>
            {competitions?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="flex items-stretch overflow-hidden rounded-md border border-ink-200 bg-surface focus-within:border-brand-500">
            <span className="flex shrink-0 items-center bg-ink-100 px-3 text-sm font-bold text-ink-600">
              {prefix}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="dos amigos"
              className="h-11 min-w-0 flex-1 bg-transparent px-3 outline-none"
            />
          </div>
          <p className="-mt-1.5 text-xs text-ink-400">
            O tipo (<span className="font-semibold text-ink-600">{prefix}</span>) já entra no nome — é
            só completar.
          </p>
          {confrontoEnabled ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-800">Tipo de disputa</label>
              <SegmentedControl<"pontos" | "confronto">
                value={tipo}
                onChange={setTipo}
                options={[
                  { value: "pontos", label: "Pontos" },
                  { value: "confronto", label: "Confronto" },
                ]}
              />
              {tipo === "confronto" && (
                <SegmentedControl<"liga" | "cup">
                  value={formato}
                  onChange={setFormato}
                  options={[
                    { value: "liga", label: "Liga" },
                    { value: "cup", label: "Copa" },
                  ]}
                />
              )}
              <p className="text-xs leading-snug text-ink-500">
                {tipo === "pontos"
                  ? "Corrida de pontos: todo mundo acumula, quem somou mais lidera."
                  : formato === "liga"
                    ? "Liga: todos contra todos; cada rodada vale 3/1/0 e forma uma tabela."
                    : "Copa: mata-mata; quem perde o confronto está fora."}
              </p>
              {tipo === "confronto" && (
                <div className="space-y-1 pt-1">
                  <label className="text-sm font-medium text-ink-800">Quem entra</label>
                  <SegmentedControl<"admin" | "optin">
                    value={participantMode}
                    onChange={setParticipantMode}
                    options={[
                      { value: "admin", label: "Admin escolhe" },
                      { value: "optin", label: "Cada um aceita" },
                    ]}
                  />
                  <p className="text-xs leading-snug text-ink-500">
                    {participantMode === "admin"
                      ? "No sorteio, você marca quais membros entram."
                      : "Cada membro confirma que quer jogar; você sorteia com quem topou."}
                  </p>
                </div>
              )}
              {tipo === "confronto" && (
                <p className="rounded-md bg-brand-500/10 px-3 py-2 text-[11px] leading-relaxed text-brand-700">
                  Depois de criar, você <span className="font-semibold">sorteia os confrontos</span>.
                  Isso trava os participantes: quem entrar depois não joga esta disputa.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-ink-700">Modo de disputa</p>
              <div className="flex gap-1 rounded-pill bg-ink-100 p-1">
                <button
                  type="button"
                  className="flex-1 rounded-pill bg-surface px-3 py-1.5 text-sm font-semibold text-ink-950 shadow-[var(--shadow-soft)]"
                >
                  Pontos
                </button>
                <button
                  type="button"
                  disabled
                  className="flex-1 cursor-not-allowed rounded-pill px-3 py-1.5 text-xs font-semibold text-ink-400"
                  title="Em breve"
                >
                  Liga · em breve
                </button>
                <button
                  type="button"
                  disabled
                  className="flex-1 cursor-not-allowed rounded-pill px-3 py-1.5 text-xs font-semibold text-ink-400"
                  title="Em breve"
                >
                  Copa · em breve
                </button>
              </div>
              <p className="text-xs leading-snug text-ink-500">
                Corrida de pontos: soma tudo numa classificação única. Os modos
                <strong> Liga </strong> (confronto direto) e <strong>Copa</strong> (mata-mata) chegam
                em breve.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button fullWidth loading={add.isPending} onClick={handleAdd}>
              {isConfrontoNew ? "Criar e configurar" : "Adicionar"}
            </Button>
          </div>
        </Card>
      ) : (
        <Button variant="outline" fullWidth onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Adicionar competição
        </Button>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Remover competição"
        message={`Remover "${toDelete?.name ?? ""}" do grupo? A classificação dela e o histórico de palpites somem junto.`}
        step2Message="Confirmação final: remover esta competição e o que está dentro?"
        confirmLabel="Remover competição"
        loading={del.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
