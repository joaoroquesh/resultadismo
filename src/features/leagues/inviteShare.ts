// Convite de grupo: texto único (material de divulgação aprovado pelo PO) +
// share com Web Share API. Usado no card do grupo (LigasPage) e na página do
// grupo (LigaDetailPage) — regra 9 do MESTRE: o app inteiro fala a mesma coisa.

/**
 * Monta o texto do convite. Com `joinCode`, fecha com "Entre no meu grupo" +
 * código + link parametrizado (?convite= é capturado no boot e preenche o campo
 * sozinho). Sem código (grupo público compartilhado da vitrine), aponta /grupos.
 */
export function buildGroupInviteText(name: string, joinCode?: string | null): string {
  const pitch = `🏆 Achei o melhor bolão pra Copa do Mundo!

No Resultadismo você:
✅ palpita no placar dos jogos
✅ ganha pontos cada vez que acerta
✅ enfrenta os amigos no ranking ao vivo

📲 Abre pelo celular e instala como app em 10 segundos. ⚽`;

  if (joinCode) {
    return `${pitch}

Bora jogar junto? Entre no meu grupo "${name}":
Código: ${joinCode}
👉 https://www.resultadismo.com/?convite=${encodeURIComponent(joinCode)}`;
  }
  return `${pitch}

Bora jogar junto? Entre no meu grupo "${name}":
👉 https://www.resultadismo.com/grupos`;
}

/**
 * Compartilha o convite. Tenta a Web Share API primeiro porque ela passa o texto
 * NATIVO (sem URL-encoding), preservando emojis multi-byte que o wa.me/?text=
 * corrompe em alguns clientes WhatsApp (🏆 ✅ 📲 👉 viravam � pra alguns
 * destinatários). No mobile o sistema abre o "Compartilhar com…" com WhatsApp em
 * destaque (1 toque). No desktop sem Web Share, cai no wa.me como fallback.
 */
export function shareGroupInvite(name: string, joinCode?: string | null): void {
  const text = buildGroupInviteText(name, joinCode);
  const fallback = () =>
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    navigator.share({ text }).catch((err: unknown) => {
      // AbortError = usuário cancelou no share sheet; não cai no fallback.
      if ((err as { name?: string } | undefined)?.name !== "AbortError") fallback();
    });
    return;
  }
  fallback();
}
