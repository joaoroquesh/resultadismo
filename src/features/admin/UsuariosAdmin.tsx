import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { useAllProfiles, useSetAppAdmin } from "./api";

export function UsuariosAdmin() {
  const { data: profiles, isLoading } = useAllProfiles();
  const setAdmin = useSetAppAdmin();
  const { user } = useAuth();
  const { toast } = useToast();

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-2">
      {profiles?.map((p) => (
        <Card key={p.id} className="flex items-center gap-3 p-3">
          <Avatar src={p.avatar_url} name={p.display_name} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink-900">{p.display_name}</p>
            <p className="truncate text-xs text-ink-500">{p.email}</p>
          </div>
          {p.is_app_admin && <Badge tone="brand">admin</Badge>}
          {p.id !== user?.id && (
            <Button
              size="sm"
              variant={p.is_app_admin ? "outline" : "ghost"}
              onClick={() =>
                setAdmin.mutate(
                  { userId: p.id, value: !p.is_app_admin },
                  { onSuccess: () => toast("Papel atualizado.", "success") },
                )
              }
            >
              <ShieldCheck className="size-4" />
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}
