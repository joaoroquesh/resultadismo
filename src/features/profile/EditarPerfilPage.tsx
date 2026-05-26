import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User as UserIcon, Heart } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";

export function EditarPerfilPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, user, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [favoriteTeam, setFavoriteTeam] = useState(profile?.favorite_team ?? "");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name.trim(), favorite_team: favoriteTeam.trim() || null })
      .eq("id", user.id);
    setBusy(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    await refreshProfile();
    toast("Perfil atualizado!", "success");
    navigate("/perfil");
  }

  return (
    <Page
      title="Editar perfil"
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate("/perfil")} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="flex flex-col items-center gap-3 p-6">
          <Avatar src={profile?.avatar_url} name={name} size="xl" />
          <p className="text-sm text-ink-500">{user?.email}</p>
        </Card>

        <Card className="space-y-4 p-4">
          <Input
            label="Nome"
            icon={<UserIcon className="size-4" />}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
          />
          <Input
            label="Time do coração (opcional)"
            icon={<Heart className="size-4" />}
            value={favoriteTeam}
            onChange={(e) => setFavoriteTeam(e.target.value)}
            maxLength={40}
            placeholder="Ex.: Flamengo"
          />
        </Card>

        <Button type="submit" fullWidth loading={busy} disabled={!name.trim()}>
          Salvar
        </Button>
      </form>
    </Page>
  );
}
