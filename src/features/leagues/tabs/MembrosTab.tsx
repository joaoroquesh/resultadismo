import { Check, ShieldCheck, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useLeagueMembers, useUpdateMember, useRemoveMember } from "../api";

export function MembrosTab({
  members,
  isAdmin,
}: {
  members: ReturnType<typeof useLeagueMembers>["data"] & object;
  isAdmin: boolean;
}) {
  const update = useUpdateMember();
  const remove = useRemoveMember();
  const { toast } = useToast();
  const list = members ?? [];

  return (
    <ul className="space-y-2">
      {list.map((m) => (
        <Card key={m.id} className="flex items-center gap-3 p-3">
          <Avatar src={m.profile?.avatar_url} name={m.profile?.display_name} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink-900">{m.profile?.display_name}</p>
            <div className="flex items-center gap-1.5">
              {m.role !== "member" && (
                <Badge tone="brand">{m.role === "owner" ? "Dono" : "Admin"}</Badge>
              )}
              {m.status === "pending" && <Badge tone="gold">pendente</Badge>}
            </div>
          </div>
          {isAdmin && m.role !== "owner" && (
            <div className="flex gap-1">
              {m.status === "pending" && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Aprovar"
                  onClick={() =>
                    update.mutate(
                      { memberId: m.id, status: "active" },
                      { onSuccess: () => toast("Membro aprovado!", "success") },
                    )
                  }
                >
                  <Check className="size-4 text-grass-600" />
                </Button>
              )}
              {m.status === "active" && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={m.role === "admin" ? "Rebaixar" : "Promover a admin"}
                  onClick={() =>
                    update.mutate({
                      memberId: m.id,
                      role: m.role === "admin" ? "member" : "admin",
                    })
                  }
                >
                  <ShieldCheck
                    className={cn("size-4", m.role === "admin" ? "text-brand-600" : "text-ink-300")}
                  />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remover"
                onClick={() =>
                  remove.mutate(m.id, { onSuccess: () => toast("Membro removido.", "info") })
                }
              >
                <Trash2 className="size-4 text-flame-500" />
              </Button>
            </div>
          )}
        </Card>
      ))}
    </ul>
  );
}
