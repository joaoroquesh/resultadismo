import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// As tabelas/RPCs novas (app_settings, discount_codes, *_league_payment) ainda não
// estão nos tipos gerados. Mantemos os casts contidos aqui (e tipamos os resultados),
// evitando mexer no database.ts (menos superfície de conflito com outras sessões).
type LooseClient = {
  from: (t: string) => {
    select: (c?: string) => any;
    insert: (v: unknown) => any;
    update: (v: unknown) => any;
    delete: () => any;
  };
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};
const db = supabase as unknown as LooseClient;

export type PaymentMode = "disabled" | "test" | "live";

export type PaymentSettings = {
  payment_mode: PaymentMode;
  league_price_cents: number;
  /** Preço promocional (centavos). Se definido e dentro da validade, vale no lugar do base. */
  promo_price_cents: number | null;
  /** Promoção vale até este instante (ISO). */
  promo_until: string | null;
};

export type DiscountInfo = {
  valid: boolean;
  reason?: string;
  code?: string;
  percent_off?: number | null;
  amount_off_cents?: number | null;
};

export type DiscountCode = {
  id: string;
  code: string;
  percent_off: number | null;
  amount_off_cents: number | null;
  max_uses: number | null;
  used_count: number;
  active: boolean;
  expires_at: string | null;
  created_at: string;
};

const DEFAULT_SETTINGS: PaymentSettings = {
  payment_mode: "disabled",
  league_price_cents: 990,
  promo_price_cents: null,
  promo_until: null,
};

/** Promoção está valendo agora? (preço promocional definido e dentro da validade) */
export function isPromoActive(s?: PaymentSettings | null): boolean {
  if (!s || s.promo_price_cents == null || !s.promo_until) return false;
  return new Date(s.promo_until).getTime() > Date.now();
}

/** Preço vigente em centavos: promocional se a promo estiver valendo, senão o base. */
export function effectivePriceCents(s?: PaymentSettings | null): number {
  if (!s) return DEFAULT_SETTINGS.league_price_cents;
  return isPromoActive(s) ? (s.promo_price_cents as number) : s.league_price_cents;
}

export function usePaymentSettings() {
  return useQuery({
    queryKey: ["payment-settings"],
    staleTime: 30_000,
    queryFn: async (): Promise<PaymentSettings> => {
      const { data, error } = await db
        .from("app_settings")
        .select("payment_mode, league_price_cents, promo_price_cents, promo_until")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data as PaymentSettings | null) ?? DEFAULT_SETTINGS;
    },
  });
}

export function useUpdatePaymentSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      mode: PaymentMode;
      priceCents: number;
      promoPriceCents: number | null;
      promoUntil: string | null;
    }) => {
      // 1) modo + preço base
      const { error } = await db.rpc("admin_update_payment_settings", {
        p_mode: input.mode,
        p_price_cents: input.priceCents,
      });
      if (error) throw error;
      // 2) promoção (preço + validade); promo_price_cents null limpa a promo
      const { error: promoErr } = await db.rpc("admin_set_promo", {
        p_promo_price_cents: input.promoPriceCents,
        p_promo_until: input.promoUntil,
      });
      if (promoErr) throw promoErr;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-settings"] }),
  });
}

/** Calcula o preço final (em centavos) aplicando um desconto válido. */
export function applyDiscount(cents: number, info?: DiscountInfo | null): number {
  if (!info?.valid) return cents;
  let out = cents;
  if (info.percent_off) out = Math.round(cents * (1 - info.percent_off / 100));
  else if (info.amount_off_cents) out = cents - info.amount_off_cents;
  return Math.max(0, out);
}

export async function validateDiscount(code: string): Promise<DiscountInfo> {
  const { data, error } = await db.rpc("validate_discount_code", { p_code: code });
  if (error) throw error;
  return (data as DiscountInfo) ?? { valid: false, reason: "Código inválido." };
}

/** MODO TESTE: simula um pagamento aprovado (sem Mercado Pago) e ativa a federação. */
export function useSimulatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { leagueId: string; code?: string }) => {
      const { error } = await db.rpc("simulate_league_payment", {
        p_league_id: input.leagueId,
        p_discount_code: input.code ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league"] });
      qc.invalidateQueries({ queryKey: ["my-leagues"] });
    },
  });
}

/** ADMIN: libera uma federação sem pagamento (cortesia). */
export function useCompLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leagueId: string) => {
      const { error } = await db.rpc("admin_comp_league", { p_league_id: leagueId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league"] });
      qc.invalidateQueries({ queryKey: ["my-leagues"] });
    },
  });
}

/**
 * Reembolso self-service (direito de arrependimento — 7 dias). Chama a Edge
 * Function `cancel-league-refund`, que estorna no Mercado Pago e arquiva a
 * federação. A function responde sempre 200 com { ok, error? }.
 */
export function useRefundLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leagueId: string) => {
      const { data, error } = await supabase.functions.invoke("cancel-league-refund", {
        body: { leagueId },
      });
      if (error) throw new Error(error.message ?? "Falha ao processar o reembolso.");
      const res = (data as { ok?: boolean; error?: string } | null) ?? {};
      if (!res.ok) throw new Error(res.error ?? "Não foi possível processar o reembolso.");
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league"] });
      qc.invalidateQueries({ queryKey: ["my-leagues"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Admin · moderação do NOME (pago ativa na hora; só o nome fica em revisão)
// ---------------------------------------------------------------------------
export function useApproveName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leagueId: string) => {
      const { error } = await db.rpc("admin_approve_league_name", { p_league_id: leagueId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league"] });
      qc.invalidateQueries({ queryKey: ["name-review"] });
    },
  });
}

export function useNameReviewLeagues(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["name-review"],
    queryFn: async (): Promise<{ id: string; name: string; slug: string }[]> => {
      const { data, error } = await db
        .from("leagues")
        .select("id, name, slug")
        .eq("name_approved", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as { id: string; name: string; slug: string }[]) ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Admin · códigos de desconto
// ---------------------------------------------------------------------------
export function useDiscountCodes(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["discount-codes"],
    queryFn: async (): Promise<DiscountCode[]> => {
      const { data, error } = await db
        .from("discount_codes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as DiscountCode[]) ?? [];
    },
  });
}

export function useCreateDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      code: string;
      percentOff?: number | null;
      amountOffCents?: number | null;
      maxUses?: number | null;
      expiresAt?: string | null;
    }) => {
      const { error } = await db.from("discount_codes").insert({
        code: input.code.trim().toUpperCase(),
        percent_off: input.percentOff ?? null,
        amount_off_cents: input.amountOffCents ?? null,
        max_uses: input.maxUses ?? null,
        expires_at: input.expiresAt ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discount-codes"] }),
  });
}

export function useToggleDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; active: boolean }) => {
      const { error } = await db
        .from("discount_codes")
        .update({ active: input.active })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discount-codes"] }),
  });
}

export function useDeleteDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("discount_codes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discount-codes"] }),
  });
}
