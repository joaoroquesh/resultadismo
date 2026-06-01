import { useEffect, useState } from "react";
import { Plus, Trash2, Ticket } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { formatBRL } from "@/lib/pricing";
import {
  usePaymentSettings,
  useUpdatePaymentSettings,
  useDiscountCodes,
  useCreateDiscount,
  useToggleDiscount,
  useDeleteDiscount,
  type PaymentMode,
  type DiscountCode,
} from "@/features/payments/api";

export function PaymentAdmin() {
  return (
    <div className="space-y-4">
      <PaymentSettingsCard />
      <DiscountCodesCard />
    </div>
  );
}

function PaymentSettingsCard() {
  const { data: settings, isLoading } = usePaymentSettings();
  const update = useUpdatePaymentSettings();
  const { toast } = useToast();
  const [mode, setMode] = useState<PaymentMode>("disabled");
  const [priceReais, setPriceReais] = useState("9,90");

  useEffect(() => {
    if (settings) {
      setMode(settings.payment_mode);
      setPriceReais((settings.league_price_cents / 100).toFixed(2).replace(".", ","));
    }
  }, [settings]);

  if (isLoading) return <Skeleton className="h-44 w-full" />;

  function save() {
    const cents = Math.round(parseFloat(priceReais.replace(",", ".")) * 100);
    update.mutate(
      { mode, priceCents: Number.isFinite(cents) ? cents : 990 },
      {
        onSuccess: () => toast("Configuração de pagamento salva.", "success"),
        onError: (e) => toast(e instanceof Error ? e.message : "Erro ao salvar.", "error"),
      },
    );
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-sm font-bold text-ink-900">Pagamento de federações</h2>
        <p className="text-xs text-ink-500">Controla a cobrança para criar uma federação.</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-ink-800">Modo</label>
        <SegmentedControl<PaymentMode>
          value={mode}
          onChange={setMode}
          options={[
            { value: "disabled", label: "Desativado" },
            { value: "test", label: "Teste" },
            { value: "live", label: "Mercado Pago" },
          ]}
        />
        <p className="text-xs leading-snug text-ink-500">
          {mode === "disabled"
            ? "Criar federação é grátis (passa pela aprovação do admin, como antes)."
            : mode === "test"
              ? "Cobrança simulada (sem dinheiro real) — para testar o fluxo de ponta a ponta."
              : "Cobrança real via Mercado Pago (Pix/cartão). Requer os secrets configurados."}
        </p>
      </div>

      {mode !== "disabled" && (
        <Input
          label="Preço da federação (R$)"
          value={priceReais}
          onChange={(e) => setPriceReais(e.target.value)}
          inputMode="decimal"
          placeholder="9,90"
        />
      )}

      <Button fullWidth loading={update.isPending} onClick={save}>
        Salvar
      </Button>
    </Card>
  );
}

function DiscountCodesCard() {
  const { data: codes, isLoading } = useDiscountCodes();
  const create = useCreateDiscount();
  const toggle = useToggleDiscount();
  const del = useDeleteDiscount();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [maxUses, setMaxUses] = useState("");

  function handleCreate() {
    const v = parseFloat(value.replace(",", "."));
    if (!code.trim() || !Number.isFinite(v) || v <= 0) {
      toast("Preencha o código e um valor válido.", "error");
      return;
    }
    create.mutate(
      {
        code: code.trim(),
        percentOff: kind === "percent" ? Math.round(v) : null,
        amountOffCents: kind === "amount" ? Math.round(v * 100) : null,
        maxUses: maxUses.trim() ? Math.round(Number(maxUses)) : null,
      },
      {
        onSuccess: () => {
          toast("Cupom criado!", "success");
          setOpen(false);
          setCode("");
          setValue("");
          setMaxUses("");
        },
        onError: (e) => toast(e instanceof Error ? e.message : "Erro ao criar cupom.", "error"),
      },
    );
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-ink-900">
          <Ticket className="size-4 text-brand-600" /> Cupons de desconto
        </div>
        {!open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Novo
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-3 rounded-md border border-border p-3">
          <Input
            label="Código"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="COPA10"
            maxLength={24}
          />
          <SegmentedControl<"percent" | "amount">
            value={kind}
            onChange={setKind}
            options={[
              { value: "percent", label: "% desconto" },
              { value: "amount", label: "R$ desconto" },
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              label={kind === "percent" ? "Percentual" : "Valor (R$)"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              placeholder={kind === "percent" ? "10" : "5,00"}
            />
            <Input
              label="Usos (opcional)"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              inputMode="numeric"
              placeholder="∞"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button fullWidth loading={create.isPending} onClick={handleCreate}>
              Criar cupom
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (codes ?? []).length === 0 ? (
        <p className="py-2 text-center text-sm text-ink-400">Nenhum cupom ainda.</p>
      ) : (
        <ul className="space-y-2">
          {(codes ?? []).map((d: DiscountCode) => (
            <li key={d.id} className="flex items-center gap-2 rounded-md border border-border p-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-mono font-bold tracking-wide text-ink-900">{d.code}</p>
                <p className="text-xs text-ink-500">
                  {d.percent_off ? `${d.percent_off}% off` : `${formatBRL(d.amount_off_cents ?? 0)} off`}
                  {d.max_uses != null ? ` · ${d.used_count}/${d.max_uses} usos` : ` · ${d.used_count} usos`}
                </p>
              </div>
              {!d.active && <Badge tone="neutral">inativo</Badge>}
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  toggle.mutate(
                    { id: d.id, active: !d.active },
                    { onError: (e) => toast(e instanceof Error ? e.message : "Erro.", "error") },
                  )
                }
              >
                {d.active ? "Desativar" : "Ativar"}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Excluir cupom"
                onClick={() => del.mutate(d.id)}
              >
                <Trash2 className="size-4 text-flame-500" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
