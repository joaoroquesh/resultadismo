import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Escudo } from "@/components/ui/Escudo";
import { CrestEditor } from "@/components/ui/CrestEditor";
import { FLAMULA_SHAPES } from "@/lib/crest";
import { useToast } from "@/components/ui/Toast";
import { useUpdateLeagueLogo } from "../api";

/**
 * Editor da flâmula do grupo: forma (3 flâmulas) + cores (sólido/listras/
 * grade/bola) e rotação. Salvo como `crest:flamula:...` em `leagues.logo_url`,
 * então o mesmo renderer (`Escudo`) pinta em qualquer lugar do app.
 */
export function EscudoStudio({
  leagueId,
  leagueName,
  currentLogo,
  onClose,
}: {
  leagueId: string;
  leagueName: string;
  currentLogo: string | null;
  onClose: () => void;
}) {
  const update = useUpdateLeagueLogo();
  const { toast } = useToast();
  const [crest, setCrest] = useState<string>(currentLogo ?? "");

  async function handleSave() {
    try {
      await update.mutateAsync({ leagueId, logoUrl: crest || null });
      toast("Flâmula salva!", "success");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao salvar flâmula.", "error");
    }
  }

  async function handleReset() {
    try {
      await update.mutateAsync({ leagueId, logoUrl: null });
      toast("Flâmula voltou para o automático.", "info");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao resetar.", "error");
    }
  }

  return (
    <Card className="mb-4 space-y-4 p-4">
      <p className="text-sm font-semibold text-ink-800">Flâmula do grupo</p>

      {/* Preview ao vivo */}
      <div className="flex items-center gap-4 rounded-md bg-ink-50 p-3">
        <Escudo src={crest || null} name={leagueName} size="xl" />
        <div className="min-w-0">
          <p className="truncate font-bold text-ink-900">{leagueName}</p>
          <p className="text-xs text-ink-500">
            Pré-visualização — a flâmula aparece no grupo e na classificação.
          </p>
        </div>
      </div>

      <CrestEditor
        kind="flamula"
        name={leagueName}
        initial={currentLogo}
        shapes={FLAMULA_SHAPES}
        allowBall
        onChange={setCrest}
      />

      <div className="flex flex-wrap gap-2 pt-2">
        <Button fullWidth loading={update.isPending} onClick={handleSave}>
          Salvar flâmula
        </Button>
        <Button variant="ghost" onClick={handleReset} loading={update.isPending}>
          Voltar ao automático
        </Button>
      </div>
    </Card>
  );
}
