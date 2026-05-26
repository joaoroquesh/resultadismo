import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Shield, Users, ChevronRight, Ticket, Clock } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useMyLeagues, useJoinByCode } from "./api";

export function LigasPage() {
  const { data: leagues, isLoading } = useMyLeagues();
  const join = useJoinByCode();
  const { toast } = useToast();
  const [code, setCode] = useState("");

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    try {
      await join.mutateAsync(code.trim());
      toast("Você entrou na liga!", "success");
      setCode("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Não foi possível entrar.", "error");
    }
  }

  return (
    <Page
      title="Ligas"
      action={
        <Link to="/ligas/nova">
          <Button size="sm">
            <Plus className="size-4" /> Criar
          </Button>
        </Link>
      }
    >
      <form onSubmit={handleJoin} className="mb-5 flex items-end gap-2">
        <Input
          label="Entrar com código"
          placeholder="Ex.: CRAQUE"
          icon={<Ticket className="size-4" />}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <Button type="submit" variant="secondary" loading={join.isPending} disabled={!code.trim()}>
          Entrar
        </Button>
      </form>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !leagues || leagues.length === 0 ? (
        <EmptyState
          icon={<Shield className="size-7" />}
          title="Nenhuma liga ainda"
          description="Crie sua liga e convide os amigos, ou entre numa liga existente com um código."
          action={
            <Link to="/ligas/nova">
              <Button>
                <Plus className="size-4" /> Criar liga
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {leagues.map((l) => (
            <Link key={l.id} to={`/ligas/${l.slug}`}>
              <Card className="flex items-center gap-3 p-4 transition active:scale-[0.99]">
                <div className="flex size-11 items-center justify-center rounded-md bg-brand-100 text-brand-700">
                  <Shield className="size-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-bold text-ink-900">{l.name}</h3>
                    {l.my_role !== "member" && (
                      <Badge tone="brand">{l.my_role === "owner" ? "Dono" : "Admin"}</Badge>
                    )}
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-ink-500">
                    {l.status === "pending" ? (
                      <span className="flex items-center gap-1 text-gold-700">
                        <Clock className="size-3.5" /> aguardando aprovação
                      </span>
                    ) : l.my_status === "pending" ? (
                      <span className="text-gold-700">solicitação pendente</span>
                    ) : (
                      <>
                        <Users className="size-3.5" /> {l.visibility === "public" ? "Pública" : "Privada"}
                      </>
                    )}
                  </p>
                </div>
                <ChevronRight className="size-5 text-ink-300" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}
