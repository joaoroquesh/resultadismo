import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { SCORE_POINTS, type ScoreType } from "@/lib/types";

export type PlayerStats = {
  jogos: number;
  pontos: number;
  cravadas: number;
  saldos: number;
  acertos: number;
  erros: number;
  aproveitamento: number;
  acertividade: number;
  melhorSequencia: number;
  jokers: number;
};

export function usePlayerStats() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["player-stats", user?.id],
    queryFn: async (): Promise<PlayerStats> => {
      const { data, error } = await supabase
        .from("predictions")
        .select("score_type, is_joker, matches(kickoff_at)")
        .eq("user_id", user!.id)
        .not("score_type", "is", null);
      if (error) throw error;

      const rows = (data ?? []) as unknown as {
        score_type: ScoreType;
        is_joker: boolean;
        matches: { kickoff_at: string | null } | null;
      }[];

      rows.sort(
        (a, b) =>
          new Date(a.matches?.kickoff_at ?? 0).getTime() -
          new Date(b.matches?.kickoff_at ?? 0).getTime(),
      );

      let pontos = 0,
        cravadas = 0,
        saldos = 0,
        acertos = 0,
        erros = 0,
        jokers = 0,
        streak = 0,
        melhorSequencia = 0;

      for (const r of rows) {
        const base = SCORE_POINTS[r.score_type];
        pontos += base * (r.is_joker ? 2 : 1);
        if (r.is_joker) jokers++;
        if (r.score_type === "cravada") cravadas++;
        else if (r.score_type === "saldo") saldos++;
        else if (r.score_type === "acerto") acertos++;
        else erros++;

        if (r.score_type !== "erro") {
          streak++;
          melhorSequencia = Math.max(melhorSequencia, streak);
        } else {
          streak = 0;
        }
      }

      const jogos = rows.length;
      const acertou = cravadas + saldos + acertos;
      return {
        jogos,
        pontos,
        cravadas,
        saldos,
        acertos,
        erros,
        jokers,
        aproveitamento: jogos ? Math.round((pontos / (3 * jogos)) * 1000) / 10 : 0,
        acertividade: jogos ? Math.round((acertou / jogos) * 1000) / 10 : 0,
        melhorSequencia,
      };
    },
  });
}
