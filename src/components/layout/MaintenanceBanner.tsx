import { useQuery } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";

/**
 * Faixa global de manutenção. O admin liga/desliga pelo painel (Visão →
 * Manutenção). Lê app_settings (policy de leitura é `authenticated`), então
 * aparece pra quem está logado. Atualiza sozinha a cada minuto.
 */
export function MaintenanceBanner() {
  const { data } = useQuery({
    queryKey: ["maintenance"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("maintenance_mode, maintenance_message")
        .eq("id", 1)
        .maybeSingle();
      return data ?? null;
    },
  });

  if (!data?.maintenance_mode) return null;

  return (
    <div className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-gold-500 px-4 py-2 text-center text-sm font-semibold text-ink-950">
      <Wrench className="size-4 shrink-0" />
      <span>{data.maintenance_message || "Estamos em manutenção rápida. Já voltamos! ⚽"}</span>
    </div>
  );
}
