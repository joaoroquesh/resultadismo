import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User as UserIcon, Heart, RotateCw } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { cn } from "@/lib/utils";
import {
  AVATAR_SHAPES,
  AVATAR_COLORS,
  AVATAR_ROTATIONS,
  buildGenAvatar,
  parseGenAvatar,
  type AvatarShape,
} from "@/lib/avatar";

const DEFAULT_COLORS = ["turquesa", "dourado", "vermelho"];

export function EditarPerfilPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, user, refreshProfile } = useAuth();

  const initial = parseGenAvatar(profile?.avatar_url);
  // A foto do Google vem da identidade OAuth (user_metadata), não do avatar salvo —
  // assim a opção continua disponível mesmo depois de salvar um escudo.
  const metaPhoto =
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.user_metadata?.picture as string | undefined) ||
    null;
  // fallback: perfis antigos que guardaram a foto direto em avatar_url
  const googlePhoto =
    metaPhoto ||
    (profile?.avatar_url && !profile.avatar_url.startsWith("gen:") ? profile.avatar_url : null);

  const [name, setName] = useState(profile?.display_name ?? "");
  const [favoriteTeam, setFavoriteTeam] = useState(profile?.favorite_team ?? "");
  const [shape, setShape] = useState<AvatarShape>(initial?.shape ?? "shield");
  const [colorCount, setColorCount] = useState<number>(initial?.colors.length ?? 1);
  const [colors, setColors] = useState<string[]>([
    initial?.colors[0] ?? DEFAULT_COLORS[0]!,
    initial?.colors[1] ?? DEFAULT_COLORS[1]!,
    initial?.colors[2] ?? DEFAULT_COLORS[2]!,
  ]);
  const [rotation, setRotation] = useState<number>(initial?.rotation ?? 0);
  const [useGoogle, setUseGoogle] = useState<boolean>(!!googlePhoto && !initial);
  const [busy, setBusy] = useState(false);

  const activeColors = colors.slice(0, colorCount);
  const genUrl = buildGenAvatar(shape, activeColors, rotation);
  const avatarUrl = useGoogle && googlePhoto ? googlePhoto : genUrl;

  function setColorAt(i: number, key: string) {
    setColors((prev) => prev.map((c, idx) => (idx === i ? key : c)));
    setUseGoogle(false);
  }

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
                useGoogle ? "border-brand-600 bg-brand-50" : "border-border",
              )}
            >
              <img src={googlePhoto} alt="" className="size-9 rounded-full object-cover" />
              <span className="text-sm font-medium text-ink-800">Usar foto do Google</span>
            </button>
          )}

          {/* Formas (cada uma com as cores atuais) */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-ink-500">Formato</p>
            <div className="flex flex-wrap gap-2.5">
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
                      active ? "ring-brand-600" : "ring-transparent hover:bg-ink-100",
                    )}
                  >
                    <Avatar
                      src={buildGenAvatar(s.key, activeColors, rotation)}
                      name={name || "?"}
                      size="md"
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quantas cores */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-500">Cores</p>
            <SegmentedControl<string>
              value={String(colorCount)}
              onChange={(v) => {
                setColorCount(Number(v));
                setUseGoogle(false);
              }}
              options={[
                { value: "1", label: "1 cor" },
                { value: "2", label: "2 cores" },
                { value: "3", label: "3 cores" },
              ]}
            />
          </div>

          {/* Picker por divisão */}
          <div className="space-y-2.5">
            {Array.from({ length: colorCount }).map((_, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                {colorCount > 1 && (
                  <span className="w-12 text-xs font-medium text-ink-400">Div {i + 1}</span>
                )}
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-label={c.key}
                    onClick={() => setColorAt(i, c.key)}
                    className={cn(
                      "size-8 rounded-full ring-2 ring-offset-2 ring-offset-surface transition",
                      !useGoogle && colors[i] === c.key ? "ring-ink-900" : "ring-transparent",
                    )}
                    style={{ background: c.hex }}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Rotação da divisão */}
          {colorCount > 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const idx = AVATAR_ROTATIONS.indexOf(rotation);
                setRotation(AVATAR_ROTATIONS[(idx + 1) % AVATAR_ROTATIONS.length]!);
                setUseGoogle(false);
              }}
            >
              <RotateCw className="size-4" /> Girar divisão ({rotation}°)
            </Button>
          )}
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
