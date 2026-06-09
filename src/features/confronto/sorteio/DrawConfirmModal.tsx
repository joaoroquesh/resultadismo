import { Dices } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

type DrawWhen = "now" | "datetime" | "first";

/** Modal de confirmação do sorteio: trava participantes, escolhe quando sortear
 * (agora / no 1º jogo / agendado) e dispara. A ação real vive no SorteioPanel. */
export function DrawConfirmModal({
  open,
  onClose,
  playersLen,
  isLiga,
  rounds,
  drawWhen,
  setDrawWhen,
  drawAt,
  setDrawAt,
  drawPending,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  playersLen: number;
  isLiga: boolean;
  rounds: number;
  drawWhen: DrawWhen;
  setDrawWhen: (w: DrawWhen) => void;
  drawAt: string;
  setDrawAt: (v: string) => void;
  drawPending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} label="Sortear confrontos?">
      <div className="space-y-4 p-5">
        <h2 className="pr-8 text-lg font-extrabold tracking-tight text-ink-950">Sortear confrontos?</h2>
        <p className="text-sm leading-relaxed text-ink-600">
          Vou travar os <span className="font-bold text-ink-900">{playersLen} participantes</span> e
          montar{" "}
          {isLiga ? (
            <>
              <span className="font-bold text-ink-900">{rounds} rodadas</span> de Liga
            </>
          ) : (
            "o chaveamento da Copa"
          )}
          . Quem entrar no grupo depois <span className="font-semibold">não joga</span> esta{" "}
          {isLiga ? "Liga" : "Copa"}.
        </p>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink-800">Quando sortear?</p>
          <div className="flex flex-col gap-1">
            {(
              [
                { v: "now", label: "Agora (instantâneo)" },
                { v: "first", label: "No 1º jogo do campeonato" },
                { v: "datetime", label: "Agendar data e hora" },
              ] as const
            ).map((o) => (
              <label
                key={o.v}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm text-ink-700"
              >
                <input
                  type="radio"
                  name="drawWhen"
                  checked={drawWhen === o.v}
                  onChange={() => setDrawWhen(o.v)}
                  className="size-4 accent-brand-600"
                />
                {o.label}
              </label>
            ))}
          </div>
          {drawWhen === "datetime" && (
            <input
              type="datetime-local"
              value={drawAt}
              onChange={(e) => setDrawAt(e.target.value)}
              className="h-10 w-full rounded-md border border-ink-200 bg-surface px-3 text-sm outline-none focus:border-brand-500"
            />
          )}
          {drawWhen !== "now" && (
            <p className="rounded-md bg-brand-500/10 px-3 py-2 text-xs text-brand-700">
              A disputa aparece como <span className="font-semibold">"sorteio agendado"</span> e é
              revelada automaticamente no horário.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" fullWidth onClick={onClose}>
            Cancelar
          </Button>
          <Button
            fullWidth
            loading={drawPending}
            disabled={drawWhen === "datetime" && !drawAt}
            onClick={onConfirm}
          >
            <Dices className="size-4" /> {drawWhen === "now" ? "Sortear" : "Agendar sorteio"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
