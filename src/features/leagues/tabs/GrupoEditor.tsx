import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Escudo } from "@/components/ui/Escudo";
import { CrestEditor } from "@/components/ui/CrestEditor";
import { FLAMULA_SHAPES } from "@/lib/crest";
import { useToast } from "@/components/ui/Toast";
import { useUpdateGroupInfo, useUpdateLeagueLogo } from "../api";

/**
 * Editor do grupo num lugar só: NOME + DESCRIÇÃO + ESCUDO (flâmula).
 * Só dono/admin do grupo. Trocar o nome manda ele p/ uma revisão rápida do app
 * (name_approved volta a false no backend); o grupo segue funcionando.
 */
export function GrupoEditor({
  leagueId,
  currentName,
  currentDescription,
  currentLogo,
  onClose,
}: {
  leagueId: string;
  currentName: string;
  currentDescription: string | null;
  currentLogo: string | null;
  onClose: () => void;
}) {
  const updateInfo = useUpdateGroupInfo();
  const updateLogo = useUpdateLeagueLogo();
  const { toast } = useToast();
  const [name, setName] = useState(currentName);
  const [description, setDescription] = useState(currentDescription ?? "");
  const [crest, setCrest] = useState<string>(currentLogo ?? "");

  const saving = updateInfo.isPending || updateLogo.isPending;
  const nameChanged = name.trim() !== currentName;

  async function handleSave() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast("Dê um nome com pelo menos 2 letras.", "error");
      return;
    }
    const desc = description.trim() || null;
    const infoChanged = trimmed !== currentName || desc !== (currentDescription ?? null);
    const logoChanged = (crest || null) !== (currentLogo ?? null);
    try {
      if (infoChanged) await updateInfo.mutateAsync({ leagueId, name: trimmed, description: desc });
      if (logoChanged) await updateLogo.mutateAsync({ leagueId, logoUrl: crest || null });
      toast(
        nameChanged
          ? "Grupo atualizado! O novo nome passa por uma revisão rápida."
          : "Grupo atualizado!",
        "success",
      );
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não rolou salvar agora. Tenta de novo?", "error");
    }
  }

  return (
    <Card className="mb-4 space-y-4 p-4">
      <p className="text-sm font-semibold text-ink-800">Editar grupo</p>

      <Input
        label="Nome do grupo"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        placeholder="Ex.: Amigos da Pelada"
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink-800">Descrição (opcional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={200}
          placeholder="Do que se trata o grupo?"
          className="rounded-md border border-ink-200 bg-surface px-3.5 py-2.5 text-ink-950 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-ink-800">Escudo</label>
        <div className="flex items-center gap-4 rounded-md bg-ink-50 p-3">
          <Escudo src={crest || null} name={name || currentName} size="xl" />
          <p className="text-xs text-ink-500">A flâmula aparece no grupo e na classificação.</p>
        </div>
        <CrestEditor
          kind="flamula"
          name={name || currentName}
          initial={currentLogo}
          shapes={FLAMULA_SHAPES}
          allowBall
          onChange={setCrest}
        />
      </div>

      {nameChanged && (
        <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-gold-800">
          Ao trocar o nome, ele passa por uma <strong>revisão rápida</strong> antes de aparecer
          publicamente. O grupo segue funcionando normalmente.
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button variant="ghost" fullWidth onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button fullWidth loading={saving} onClick={handleSave}>
          Salvar
        </Button>
      </div>
    </Card>
  );
}
