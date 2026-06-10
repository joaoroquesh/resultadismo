import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useRetroConfig, useRetroSetConfig, type RetroConfig } from "./api";

type Min = "acerto" | "saldo" | "cravada";
const OPTS = [
  { value: "acerto" as Min, label: "Acerto" },
  { value: "saldo" as Min, label: "Saldo" },
  { value: "cravada" as Min, label: "Cravada" },
];

// Admin do Retrô: liga/desliga a exigência de saldo/cravada nas fases finais do
// modo Copa, pra testar com a galera (decisão do PO). Default: desligado.
export function RetroAdminPage() {
  const navigate = useNavigate();
  const cfg = useRetroConfig();
  return (
    <Page title="Admin · Retrô">
      <div className="mx-auto w-full max-w-md space-y-4">
        {cfg.data ? <ConfigForm initial={cfg.data} /> : <Skeleton className="h-48 w-full" />}
        <Button variant="ghost" className="w-full" onClick={() => navigate("/retro")}>
          ← Voltar ao Retrô
        </Button>
      </div>
    </Page>
  );
}

// estado inicial vem das props (montado só depois do fetch) — sem setState em effect
function ConfigForm({ initial }: { initial: RetroConfig }) {
  const { toast } = useToast();
  const save = useRetroSetConfig();
  const [enforce, setEnforce] = useState(initial.enforce_knockout_bar);
  const [semi, setSemi] = useState<Min>(initial.semi_min as Min);
  const [final, setFinal] = useState<Min>(initial.final_min as Min);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">Exigir saldo/cravada nas fases finais</p>
          <p className="text-xs text-ink-500">
            Modo Copa. Desligado = qualquer ponto avança em todas as fases (mais fácil).
          </p>
        </div>
        <Switch checked={enforce} onChange={setEnforce} label="Exigir barra nas finais" />
      </div>

      {enforce && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-500">Semifinal — mínimo</span>
            <SegmentedControl<Min> className="w-full" options={OPTS} value={semi} onChange={setSemi} />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-500">Final — mínimo</span>
            <SegmentedControl<Min> className="w-full" options={OPTS} value={final} onChange={setFinal} />
          </div>
        </div>
      )}

      <Button
        className="w-full font-bold"
        loading={save.isPending}
        onClick={() =>
          save.mutate(
            { enforce, semiMin: semi, finalMin: final },
            {
              onSuccess: () => toast("Config salva!", "success"),
              onError: (e) => toast(e.message, "error"),
            },
          )
        }
      >
        Salvar
      </Button>
    </Card>
  );
}
