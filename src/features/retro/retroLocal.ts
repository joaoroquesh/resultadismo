// Estado local do Retrô (sem conta): credencial anônima + anti-repetição do Treino.
// O anônimo joga 100% via RPC (o gabarito nunca desce) — o localStorage guarda só
// a identidade efêmera da run e os últimos jogos vistos (D17/D9 da espec).

const TOKEN_KEY = "rd_retro_anon";
const SEEN_KEY = "rd_retro_seen";
const SEEN_MAX = 30;

export function retroAnonToken(): string {
  try {
    const cur = localStorage.getItem(TOKEN_KEY);
    if (cur) return cur;
    const fresh = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

export function retroSeen(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.slice(0, SEEN_MAX) : [];
  } catch {
    return [];
  }
}

export function retroMarkSeen(matchId: string | null | undefined) {
  if (!matchId) return;
  try {
    const next = [matchId, ...retroSeen().filter((id) => id !== matchId)].slice(0, SEEN_MAX);
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    /* sem storage, sem anti-repeat — o jogo segue */
  }
}

// Pré-aquece o cache das 85 bandeiras do jogo (feedback: "escudos demoram").
// Roda 1x por sessão, em idle, na home do Retrô — na rodada, tudo já está no cache.
let warmed = false;
export function warmRetroFlags(resolve: (slug: string) => string | null) {
  if (warmed) return;
  warmed = true;
  const go = async () => {
    const { RETRO_FLAG_SLUGS } = await import("./retroFlagSlugs");
    for (const slug of RETRO_FLAG_SLUGS) {
      const src = resolve(slug);
      if (src) new Image().src = src;
    }
  };
  if ("requestIdleCallback" in window) requestIdleCallback(() => void go());
  else setTimeout(() => void go(), 800);
}
