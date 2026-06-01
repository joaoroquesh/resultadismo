import dayjs from "dayjs";
import "dayjs/locale/pt-br";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import isToday from "dayjs/plugin/isToday";
import isTomorrow from "dayjs/plugin/isTomorrow";

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isToday);
dayjs.extend(isTomorrow);
dayjs.locale("pt-br");

export { dayjs };

/** "Hoje, 16:30" · "Amanhã, 09:00" · "ter, 14 jun · 16:30" */
export function formatKickoff(iso: string | null): string {
  if (!iso) return "A definir";
  const d = dayjs(iso);
  const hora = d.format("HH:mm");
  if (d.isToday()) return `Hoje, ${hora}`;
  if (d.isTomorrow()) return `Amanhã, ${hora}`;
  return `${d.format("ddd, DD MMM")} · ${hora}`;
}

export function formatDayLabel(iso: string | null): string {
  if (!iso) return "A definir";
  const d = dayjs(iso);
  if (d.isToday()) return "Hoje";
  if (d.isTomorrow()) return "Amanhã";
  return d.format("dddd, DD [de] MMMM");
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return dayjs(iso).format("DD/MM");
}

export function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  return dayjs(iso).format("HH:mm");
}

export function fromNow(iso: string | null): string {
  if (!iso) return "";
  return dayjs(iso).fromNow();
}

export function isLocked(iso: string | null): boolean {
  if (!iso) return false;
  return dayjs(iso).isBefore(dayjs());
}

/* ------------------------------------------------------------------ */
/*  Rótulos de fase/grupo (vêm crus da API: "GROUP_A", "LAST_16"...)   */
/* ------------------------------------------------------------------ */
const STAGE_LABELS_PT: Record<string, string> = {
  GROUP_STAGE: "Fase de grupos",
  LEAGUE_STAGE: "Fase de liga",
  REGULAR_SEASON: "Temporada regular",
  PRELIMINARY_ROUND: "Preliminares",
  QUALIFICATION: "Eliminatórias",
  QUALIFICATION_ROUND_1: "Eliminatórias",
  PLAYOFFS: "Repescagem",
  PLAYOFF_ROUND: "Repescagem",
  LAST_64: "32 avos de final",
  LAST_32: "16 avos de final",
  LAST_16: "Oitavas de final",
  QUARTER_FINAL: "Quartas de final",
  QUARTER_FINALS: "Quartas de final",
  SEMI_FINAL: "Semifinal",
  SEMI_FINALS: "Semifinal",
  THIRD_PLACE: "Disputa de 3º lugar",
  FINAL: "Final",
};

/** "GROUP_A" → "Grupo A". null se não houver grupo. */
export function formatGroup(group: string | null | undefined): string | null {
  if (!group) return null;
  const tail = group.match(/([A-Za-z0-9]+)\s*$/);
  return `Grupo ${(tail ? tail[1] : group).toUpperCase()}`;
}

/** "LAST_16" → "Oitavas de final". Fallback legível para valores desconhecidos. */
export function formatStage(stage: string | null | undefined): string | null {
  if (!stage) return null;
  const key = stage.trim().toUpperCase().replace(/\s+/g, "_");
  if (STAGE_LABELS_PT[key]) return STAGE_LABELS_PT[key];
  const pretty = stage.replace(/_/g, " ").toLowerCase().trim();
  return pretty ? pretty.charAt(0).toUpperCase() + pretty.slice(1) : null;
}

/** Rótulo de fase para o card: grupo tem prioridade; senão a fase do mata-mata. */
export function matchPhaseLabel(m: {
  group_name?: string | null;
  stage?: string | null;
}): string | null {
  return formatGroup(m.group_name) ?? formatStage(m.stage);
}

/** "fecha em 2h" · "fecha em 45min" · "fecha já" — para o prazo do palpite. */
export function formatDeadline(iso: string | null): { text: string; urgent: boolean } | null {
  if (!iso) return null;
  const diffMin = dayjs(iso).diff(dayjs(), "minute");
  if (diffMin < 0) return null;
  if (diffMin < 60) return { text: `fecha em ${diffMin}min`, urgent: true };
  const h = Math.floor(diffMin / 60);
  if (h < 24) return { text: `fecha em ${h}h`, urgent: h < 3 };
  const d = Math.floor(h / 24);
  return { text: `fecha em ${d}d`, urgent: false };
}
