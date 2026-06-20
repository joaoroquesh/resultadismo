import { useState } from "react";
import { AlertTriangle, Archive, EyeOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import {
  useCompetitionUsage,
  useDeleteCompetition,
  useSetCompetitionPublished,
} from "./competitions";
import { useArchiveCompetition } from "./competitionsAdmin";

export type CompetitionDanger = { id: string; name: string; action: "delete" | "unpublish" };

/**
 * Diálogo de ação perigosa em competição. Lê o uso real (admin_competition_usage):
 *  - EXCLUIR EM USO (palpites/grupos) → ARQUIVA preservando os placares: os jogos
 *    e o que cada fonte puxou (match_sources) FICAM no banco; nada de palpite some.
 *    Exige digitar o nome exato.
 *  - EXCLUIR só com jogos sincronizados (sem palpite/grupo) → apaga de vez, exige nome.
 *  - EXCLUIR vazia → confirmação simples.
 *  - DESPUBLICAR em uso → exige nome. Sem uso → confirmação simples.
 */
export function CompetitionDangerDialog({
  danger,
  onClose,
}: {
  danger: CompetitionDanger | null;
  onClose: () => void;
}) {
  const usage = useCompetitionUsage(danger?.id ?? null);
  const del = useDeleteCompetition();
  const setPub = useSetCompetitionPublished();
  const archive = useArchiveCompetition();
  const { toast } = useToast();
  const [typed, setTyped] = useState("");
  // Reseta o campo quando muda a competição/ação alvo (sem efeito; evita cascata).
  const dkey = danger ? `${danger.id}:${danger.action}` : "";
  const [seenKey, setSeenKey] = useState(dkey);
  if (dkey !== seenKey) {
    setSeenKey(dkey);
    setTyped("");
  }

  if (!danger) return null;

  const isDelete = danger.action === "delete";
  const u = usage.data;
  const loading = usage.isLoading;
  const inUse = !!u && (u.predictions > 0 || u.groups > 0);
  const archiveMode = isDelete && inUse; // excluir em uso = arquivar preservando
  const needsName = archiveMode || (isDelete ? !!u && u.matches > 0 : inUse);
  const pending = del.isPending || setPub.isPending || archive.isPending;
  const canConfirm = !loading && (!needsName || typed.trim() === danger.name.trim());

  const title = !isDelete
    ? "Despublicar competição"
    : archiveMode
      ? "Arquivar competição"
      : "Excluir competição";
  const Icon = !isDelete ? EyeOff : archiveMode ? Archive : Trash2;

  function confirm() {
    const d = danger;
    if (!d) return;
    const confirmName = needsName ? typed.trim() : undefined;
    const onError = (e: unknown) => toast(e instanceof Error ? e.message : "Não rolou.", "error");
    if (archiveMode) {
      archive.mutate(
        { id: d.id, confirmName: typed.trim() },
        {
          onSuccess: () => {
            toast(`"${d.name}" arquivada (placares preservados).`, "success");
            onClose();
          },
          onError,
        },
      );
    } else if (isDelete) {
      del.mutate(
        { id: d.id, confirmName },
        {
          onSuccess: () => {
            toast(`"${d.name}" excluída.`, "success");
            onClose();
          },
          onError,
        },
      );
    } else {
      setPub.mutate(
        { id: d.id, value: false, confirmName },
        {
          onSuccess: () => {
            toast(`"${d.name}" voltou para rascunho.`, "success");
            onClose();
          },
          onError,
        },
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink-950/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="animate-rise w-full max-w-sm rounded-lg bg-surface p-5 shadow-[var(--shadow-pop)] ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-3">
          <div
            className={
              archiveMode
                ? "grid size-10 shrink-0 place-items-center rounded-md bg-surface-2 text-gold-700"
                : isDelete
                  ? "grid size-10 shrink-0 place-items-center rounded-md bg-surface-2 text-flame-600"
                  : "grid size-10 shrink-0 place-items-center rounded-md bg-surface-2 text-brand-600"
            }
          >
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-ink-900">{title}</h3>
            <p className="mt-0.5 truncate text-sm text-ink-500">{danger.name}</p>
          </div>
        </div>

        {loading ? (
          <div className="h-16 animate-pulse rounded-md bg-ink-100" />
        ) : (
          <div className="space-y-3">
            {archiveMode ? (
              <div className="rounded-md bg-surface-2 p-3 text-sm text-ink-800">
                <p className="flex items-center gap-1.5 font-semibold text-gold-700">
                  <AlertTriangle className="size-4" /> Em uso: vai arquivar (não apaga)
                </p>
                <p className="mt-1 text-ink-600">
                  {u?.predictions ?? 0} palpite(s) e {u?.groups ?? 0} grupo(s) dependem dela. Em vez de
                  excluir, ela é <strong>arquivada</strong>: sai das listas e para de sincronizar, mas
                  os <strong>jogos e os placares já puxados ficam guardados</strong> no banco. Nenhum
                  palpite se perde. Dá pra restaurar depois.
                </p>
              </div>
            ) : (
              <p className="text-sm text-ink-600">
                {isDelete
                  ? u && u.matches > 0
                    ? `Vai remover ${u.matches} jogo(s) sincronizado(s) (sem palpites/grupos). Os jogos saem junto. Não dá pra desfazer.`
                    : "Esta competição não tem jogos, palpites nem grupos. Pode excluir."
                  : inUse
                    ? `Despublicar tira do ar pros usuários (não apaga nada). Ela tem ${u?.predictions ?? 0} palpite(s) / ${u?.groups ?? 0} grupo(s).`
                    : "Despublicar tira do ar pros usuários (volta a rascunho). Não apaga nada."}
              </p>
            )}

            {needsName && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="comp-confirm" className="text-xs font-medium text-ink-700">
                  Digite o nome exato para confirmar: <span className="font-semibold">{danger.name}</span>
                </label>
                <Input
                  id="comp-confirm"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={danger.name}
                  autoComplete="off"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
                Cancelar
              </Button>
              <Button
                variant={isDelete && !archiveMode ? "danger" : "primary"}
                size="sm"
                loading={pending}
                disabled={!canConfirm}
                onClick={confirm}
              >
                {archiveMode ? "Arquivar" : isDelete ? "Excluir" : "Despublicar"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
