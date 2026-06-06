import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  useNamePrefixes,
  useSetNamePrefixes,
  NAME_PREFIX_DEFAULTS,
} from "@/features/leagues/naming";

const FIELD =
  "mt-1 h-10 w-full rounded-md border border-ink-200 bg-surface px-3 text-sm outline-none focus:border-brand-500";

/** Admin: ajusta o prefixo obrigatório do nome de cada tipo de disputa. */
export function NameRulesCard() {
  const { data } = useNamePrefixes();
  const save = useSetNamePrefixes();
  const { toast } = useToast();
  const [cup, setCup] = useState("");
  const [liga, setLiga] = useState("");
  const [points, setPoints] = useState("");

  // popula o form quando os dados chegam/mudam — guarda a referência anterior e
  // ressincroniza no render, sem efeito ("you might not need an effect").
  const [prevData, setPrevData] = useState(data);
  if (data && data !== prevData) {
    setPrevData(data);
    setCup(data.cup);
    setLiga(data.liga);
    setPoints(data.points);
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="font-bold text-ink-900">Regras de nome das disputas</h3>
        <p className="text-xs leading-relaxed text-ink-500">
          Prefixo obrigatório no nome de cada tipo, na hora de criar a disputa. Ex.:{" "}
          <span className="font-semibold text-ink-600">"{cup || "Copa"} dos Amigos"</span>.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="text-xs font-semibold text-ink-600">
          Copa (mata-mata)
          <input value={cup} onChange={(e) => setCup(e.target.value)} className={FIELD} />
        </label>
        <label className="text-xs font-semibold text-ink-600">
          Liga (confronto)
          <input value={liga} onChange={(e) => setLiga(e.target.value)} className={FIELD} />
        </label>
        <label className="text-xs font-semibold text-ink-600">
          Pontos (campeonato)
          <input value={points} onChange={(e) => setPoints(e.target.value)} className={FIELD} />
        </label>
      </div>
      <Button
        size="sm"
        loading={save.isPending}
        onClick={() =>
          save.mutate(
            {
              cup: cup || NAME_PREFIX_DEFAULTS.cup,
              liga: liga || NAME_PREFIX_DEFAULTS.liga,
              points: points || NAME_PREFIX_DEFAULTS.points,
            },
            {
              onSuccess: () => toast("Regras de nome salvas.", "success"),
              onError: (e) => toast(e instanceof Error ? e.message : "Erro ao salvar.", "error"),
            },
          )
        }
      >
        Salvar regras de nome
      </Button>
    </Card>
  );
}
