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
import { cn } from "@/lib/utils";
import {
  AVATAR_SHAPES,
  AVATAR_COLORS,
  buildGenAvatar,
  parseGenAvatar,
  shapeStyle,
  avatarColorHex,
  type AvatarShape,
} from "@/lib/avatar";

export function EditarPerfilPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, user, refreshProfile } = useAuth();

  const initialGen = parseGenAvatar(profile?.avatar_url);
  const googlePhoto =
    profile?.avatar_url && !profile.avatar_url.startsWith("gen:") ? profile.avatar_url : null;

  const [name, setName] = useState(profile?.display_name ?? "");
  const [favoriteTeam, setFavoriteTeam] = useState(profile?.favorite_team ?? "");
  const [shape, setShape] = useState<AvatarShape>(initialGen?.shape ?? "shield");
  const [color, setColor] = useState<string>(initialGen?.color ?? "turquesa");
  const [useGoogle, setUseGoogle] = useState<boolean>(!!googlePhoto && !initialGen);
  const [busy, setBusy] = useState(false);

  const avatarUrl = useGoogle && googlePhoto ? googlePhoto : buildGenAvatar(shape, color);
  const initial = (name.trim()[0] ?? "?").toUpperCase();

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
    if (error) return toast(error.message, "error");
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
        <Card className="flex flex-col items-center gap-2 p-6">
          <Avatar src={avatarUrl} name={name} size="xl" />
          <p className="text-sm text-ink-500">{user?.email}</p>
        </Card>

        <Card className="space-y-4 p-4">
          <p className="text-sm font-semibold text-ink-800">Seu escudo</p>

          {googlePhoto && (
            <button
              type="button"
              onClick={() => setUseGoogle((v) => !v)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md border p-2.5 text-left transition",
                useGoogle ? "border-brand-600 bg-brand-50" : "border-ink-200",
              )}
            >
              <img src={googlePhoto} alt="" className="size-9 rounded-full object-cover" />
              <span className="text-sm font-medium text-ink-800">Usar foto do Google</span>
            </button>
          )}

          {/* Formas */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-ink-500">Formato</p>
            <div className="flex gap-2.5">
              {AVATAR_SHAPES.map((s) => {
                const active = !useGoogle && shape === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-label={s.label}
                    onClick={() => {
                      setShape(s.key);
                      setUseGoogle(false);
                    }}
                    className={cn(
                      "flex size-12 items-center justify-center rounded-md ring-2 transition",
                      active ? "ring-brand-600" : "ring-transparent hover:bg-ink-50",
                    )}
                  >
                    <span
                      className="flex size-9 items-center justify-center text-sm font-bold text-white"
                      style={{ background: avatarColorHex(color).bg, color: avatarColorHex(color).text, ...shapeStyle(s.key) }}
                    >
                      {initial}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cores */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-ink-500">Cor</p>
            <div className="flex flex-wrap gap-2.5">
              {AVATAR_COLORS.map((c) => {
                const active = !useGoogle && color === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-label={c.key}
                    onClick={() => {
                      setColor(c.key);
                      setUseGoogle(false);
                    }}
                    className={cn(
                      "size-9 rounded-full ring-2 ring-offset-2 transition",
                      active ? "ring-ink-900" : "ring-transparent",
                    )}
                    style={{ background: c.hex }}
                  />
                );
              })}
            </div>
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
