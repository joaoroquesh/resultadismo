import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User as UserIcon, Heart } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { CrestEditor } from "@/components/ui/CrestEditor";
import { useToast } from "@/components/ui/Toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { ESCUDO_SHAPES } from "@/lib/crest";

export function EditarPerfilPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, user, refreshProfile } = useAuth();

  // A foto do Google vem da identidade OAuth (user_metadata), não do escudo salvo —
  // assim a opção "Foto" continua disponível mesmo depois de salvar um escudo de cores.
  const metaPhoto =
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.user_metadata?.picture as string | undefined) ||
    null;
  // fallback: perfis antigos que guardaram a foto crua direto em avatar_url
  const saved = profile?.avatar_url ?? null;
  const googlePhoto =
    metaPhoto ||
    (saved && !saved.startsWith("gen:") && !saved.startsWith("crest:") ? saved : null);

  const initialCrest = saved?.startsWith("crest:") ? saved : null;

  const [name, setName] = useState(profile?.display_name ?? "");
  const [favoriteTeam, setFavoriteTeam] = useState(profile?.favorite_team ?? "");
  const [crest, setCrest] = useState<string>(initialCrest ?? "");
  const [busy, setBusy] = useState(false);
  // "Voltar ao automático" remonta o editor a partir do default (sem escolha salva).
  const [editorInitial, setEditorInitial] = useState<string | null>(initialCrest);
  const [editorKey, setEditorKey] = useState(0);

  function resetToDefault() {
    setEditorInitial(null);
    setEditorKey((k) => k + 1);
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
        avatar_url: crest || null,
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
          <Avatar src={crest || null} name={name} size="xl" />
          <p className="text-sm text-ink-500">{user?.email}</p>
        </Card>

        <Card className="space-y-4 p-4">
          <div>
            <p className="text-sm font-semibold text-ink-800">Seu escudo</p>
            <p className="text-xs text-ink-500">
              Escolha a forma e preencha com cores ou com a sua foto. Sem foto, entra a inicial do
              seu nome.
            </p>
          </div>
          <CrestEditor
            key={editorKey}
            kind="escudo"
            name={name}
            initial={editorInitial}
            shapes={ESCUDO_SHAPES}
            allowPhoto
            photoUrl={googlePhoto}
            onChange={setCrest}
          />
          <button
            type="button"
            onClick={resetToDefault}
            className="text-xs font-semibold text-ink-400 transition hover:text-ink-600"
          >
            Voltar ao escudo automático
          </button>
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
