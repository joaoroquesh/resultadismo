/** Nome a EXIBIR de um grupo. Quando o nome foi sinalizado pela moderação
 * (name_approved=false), some e vira um genérico até o dono escolher outro
 * (moderação reativa — ADR 0010). O nome real continua no banco. */
export const FLAGGED_GROUP_NAME = "Grupo (nome em revisão)";

export function groupDisplayName(
  league: { name: string; name_approved?: boolean | null } | null | undefined,
): string {
  if (!league) return "";
  return league.name_approved === false ? FLAGGED_GROUP_NAME : league.name;
}
