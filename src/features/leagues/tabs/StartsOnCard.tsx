import { useState } from "react";
import { CalendarClock, Lock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { StartsOnPicker } from "../StartsOnPicker";
import { clampDate, fmtDMY, todayLocal } from "../startsOn";
import { useStartsOnWindow, useUpdateStartsOn, type StartsOnWindow } from "../api";

/** Card "A pontuação conta a partir de" do bolão (aba Competições, admin do
 * grupo). Editável enquanto a Copa não terminou; depois trava (o banco enforça
 * via trigger; aqui só espelhamos a janela). A data fica à mostra pra todos na
 * aba Classificação. */
export function StartsOnCard({
  leagueId,
  lcId,
  savedStartsOn,
}: {
  leagueId: string;
  lcId: string;
  savedStartsOn: string | null;
}) {
  const window_ = useStartsOnWindow(lcId);
  if (window_.isLoading) {
    return (
      <Card className="space-y-3 p-4">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-11 w-full" />
      </Card>
    );
  }
  if (!window_.data) return null;
  return <StartsOnCardInner leagueId={leagueId} lcId={lcId} saved={savedStartsOn} w={window_.data} />;
}

function StartsOnCardInner({
  leagueId,
  lcId,
  saved,
  w,
}: {
  leagueId: string;
  lcId: string;
  saved: string | null;
  w: StartsOnWindow;
}) {
  const { toast } = useToast();
  const update = useUpdateStartsOn();
  const min = w.data_min;
  const max = w.data_max;
  // baseline = a data salva, ou (legado null) o início da Copa = "conta tudo".
  const baseline = saved ?? min ?? todayLocal();
  const [value, setValue] = useState<string>(baseline);
  const dirty = !!value && value !== baseline;
  const editable = w.editable && !!min && !!max;

  function save() {
    update.mutate(
      { leagueId, lcId, startsOn: clampDate(value, min, max) },
      {
        onSuccess: () => toast("Data de início atualizada!", "success"),
        onError: (e) => toast(e instanceof Error ? e.message : "Erro ao salvar.", "error"),
      },
    );
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 shrink-0 text-brand-600" />
        <p className="min-w-0 flex-1 text-sm font-semibold text-ink-800">
          A pontuação conta a partir de
        </p>
        {!editable && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-500">
            <Lock className="size-3" /> travado
          </span>
        )}
      </div>

      {editable ? (
        <>
          <StartsOnPicker value={value} onChange={setValue} min={min} max={max} />
          <p className="text-xs leading-snug text-ink-400">
            Qualquer dia dentro da Copa, pra trás ou pra frente. Essa data fica à mostra pra todos na
            Classificação.
          </p>
          {dirty && (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-xs leading-snug text-brand-700">
              Mudar a data <strong>recalcula a classificação</strong> do grupo: passam a contar os
              jogos a partir de {fmtDMY(value)}.
            </p>
          )}
          {dirty && (
            <Button size="sm" fullWidth loading={update.isPending} onClick={save}>
              Salvar data de início
            </Button>
          )}
        </>
      ) : (
        <p className="text-xs leading-relaxed text-ink-500">
          A pontuação conta a partir de{" "}
          <span className="font-semibold text-ink-700">{fmtDMY(baseline)}</span>. {w.reason ?? ""}
        </p>
      )}
    </Card>
  );
}
