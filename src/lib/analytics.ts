// Resultadismo · analytics — eventos GA4 (gtag).
//
// O index.html sobe o gtag em Consent Mode v2 (default "denied", LGPD). Aqui só
// DISPARAMOS eventos — o Google ajusta a coleta conforme o consentimento (pings
// cookieless quando negado, completo quando concedido). Por isso não há gate de
// consent aqui: chamar é seguro em qualquer estado.
//
// REGRA: nunca enviar PII nos parâmetros (e-mail, nome, telefone). Só ids
// opacos/contagens/rótulos de UI. Mantemos o conjunto de eventos pequeno e
// nomeado (sem typos) — é o tagueamento do funil, não um firehose.

type Primitive = string | number | boolean | undefined;

/** Eventos do funil/engajamento. Onde faz sentido, usamos os nomes recomendados
 *  do GA4 (login, sign_up, share, select_content). */
export type AnalyticsEvent =
  | "login" // { method }
  | "sign_up" // { method }
  | "cta_click" // { location, label? } — CTAs de marketing/topo de funil
  | "save_prediction" // { mode: "create" | "update" }
  | "set_joker" // { enabled: boolean }
  | "create_group" // { visibility?: string }
  | "join_group" // { method?: "code" | "link" }
  | "share" // { method, content_type } — recomendado GA4
  | "copy_invite" // { content_type: "group_invite" }
  | "nudge_sent" // {}
  | "feedback_submit" // { kind: "bug" | "idea" }
  | "consent_set" // { choice: "granted" | "denied" }
  | "retro_run_start" // { mode, pace, daily: boolean } — mini-jogo Retrô
  | "retro_guess" // { slot, score_type, timeout: boolean }
  | "retro_run_end" // { status, stage_rank, points, daily: boolean }
  | "retro_share"; // { status } — share da campanha (WhatsApp/clipboard)

/** Dispara um evento no GA4. No-op se o gtag ainda não carregou (ou foi bloqueado). */
export function track(event: AnalyticsEvent, params?: Record<string, Primitive>): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", event, params);
  } catch {
    /* analytics nunca pode quebrar a UI */
  }
}
