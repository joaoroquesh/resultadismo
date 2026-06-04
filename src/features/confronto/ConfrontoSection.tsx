import { ScheduledView } from "./ScheduledView";
import { SorteioPanel } from "./SorteioPanel";
import { DrawnView } from "./DrawnView";
import type { ConfrontoFormato } from "./api";

export function ConfrontoSection({
  lcId,
  leagueId,
  competitionId,
  mode,
  state,
  memberCount,
  isAdmin,
  currentUserId,
  participantMode = "admin",
  ligaFormat = "partial",
  scheduledDrawAt = null,
}: {
  lcId: string;
  leagueId: string;
  competitionId: string;
  mode: string; // 'liga' | 'cup'
  state: string; // 'draft' | 'scheduled' | 'drawn' | 'finished'
  memberCount: number;
  isAdmin: boolean;
  currentUserId?: string;
  participantMode?: string; // 'admin' | 'optin'
  ligaFormat?: string; // 'partial' | 'swiss'
  scheduledDrawAt?: string | null;
}) {
  const formato: ConfrontoFormato = mode === "cup" ? "cup" : "liga";

  if (state === "scheduled") {
    return (
      <ScheduledView
        lcId={lcId}
        leagueId={leagueId}
        scheduledDrawAt={scheduledDrawAt}
        formato={formato}
        isAdmin={isAdmin}
      />
    );
  }
  if (state !== "drawn" && state !== "finished") {
    return (
      <SorteioPanel
        lcId={lcId}
        leagueId={leagueId}
        competitionId={competitionId}
        formato={formato}
        memberCount={memberCount}
        isAdmin={isAdmin}
        participantMode={participantMode}
        currentUserId={currentUserId}
      />
    );
  }
  return (
    <DrawnView
      lcId={lcId}
      leagueId={leagueId}
      competitionId={competitionId}
      formato={formato}
      ligaFormat={ligaFormat}
      isAdmin={isAdmin}
      currentUserId={currentUserId}
    />
  );
}
