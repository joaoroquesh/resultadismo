import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User as UserIcon, Heart, Check } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { cn } from "@/lib/utils";

const ESCUDOS = [
  "AdautoF", "AlanG", "BrunoL", "CaduB", "CayqueM", "Diogenes", "EliasR", "EmersonS",
  "FilipeA", "GabrielM", "GabrielR", "GabrielT", "GustavoS", "JoaoB", "JoaoR", "LuanH",
  "LuizG", "MateusP", "MatheusC", "NetoB", "RafaelL", "RafaelM", "RafaelP", "RamonA",
  "SaulN", "ThiagoC", "WellingtonD", "padrao",
].map((n) => `/avatars/${n}.png`);

export function EditarPerfilPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, user, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [favoriteTeam, setFavoriteTeam] = useState(profile?.favorite_team ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [busy, setBusy] = useState(false);

  const googlePhoto =
    profile?.avatar_url && !profile.avatar_url.startsWith("/avatars/") ? profile.avatar_url : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: name.trim(),
        favorite_team: favoriteTeam.trim() || null,
        avatar_url: avatarUrl,
      })
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
          <Avatar src={avatarUrl} name={name} size="xl" />
          <p className="text-sm text-ink-500">{user?.email}</p>
        </Card>

        <Card className="space-y-3 p-4">
          <p className="text-sm font-medium text-ink-800">Escolha seu escudo</p>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
            {googlePhoto && (
              <AvatarOption
                src={googlePhoto}
                selected={avatarUrl === googlePhoto}
                onClick={() => setAvatarUrl(googlePhoto)}
              />
            )}
            {ESCUDOS.map((url) => (
              <AvatarOption
                key={url}
                src={url}
                selected={avatarUrl === url}
                onClick={() => setAvatarUrl(url)}
              />
            ))}
          </div>
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

function AvatarOption({
  src,
  selected,
  onClick,
}: {
  src: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative aspect-square overflow-hidden rounded-full ring-2 transition",
        selected ? "ring-brand-600" : "ring-transparent hover:ring-ink-200",
      )}
    >
      <img src={src} alt="" className="size-full object-cover" />
      {selected && (
        <span className="absolute inset-0 flex items-center justify-center bg-brand-600/30">
          <Check className="size-4 text-white" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
