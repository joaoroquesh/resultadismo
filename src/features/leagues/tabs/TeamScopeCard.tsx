import { useState } from "react";
import { Lock, Target } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { catalogNations, expandTeamSlugs } from "@/features/onboarding/teamsCatalog";
import { TeamScopeSelector, type TeamScopeValue } from "../TeamScopeSelector";
import { useTeamScopeWindow, useUpdateTeamScope } from "../api";

/** Card "Seleções que valem ponto" do bolão (aba Competições, só admin).
 * Editável ATÉ o 1º jogo da Copa começar (pedido do João, 2026-06-10); depois
 * trava — o banco enforça via trigger; aqui só espelhamos a janela. */
export function TeamScopeCard({
  leagueId,
  lcId,
  savedSlugs,
}: {
  leagueId: string;
  lcId: string;
  savedSlugs: string[] | null;
}) {
  const { toast } = useToast();
  const window_ = useTeamScopeWindow(lcId);
  const update = useUpdateTeamScope();

  // Reconstrói o estado do seletor a partir do salvo (expandido): null = todas;
  // conjunto igual ao expandido de ["brasil"] = só o Brasil; senão = escolhidas.
  const [initial] = useState(() => {
    if (!savedSlugs || savedSlugs.length === 0) {
      return { scope: "all" as TeamScopeValue, sel: new Set<string>(["brasil"]) };
    }
    const saved = new Set(savedSlugs);
    const brasilOnly = expandTeamSlugs(["brasil"]);
    const isBrasil = saved.size === brasilOnly.size && [...brasilOnly].every((s) => saved.has(s));
    if (isBrasil) return { scope: "brasil" as TeamScopeValue, sel: new Set<string>(["brasil"]) };
    const sel = new Set(catalogNations().filter((n) => saved.has(n.id)).map((n) => n.id));
    return { scope: "custom" as TeamScopeValue, sel: sel.size ? sel : new Set<string>(["brasil"]) };
  });
  const [scope, setScope] = useState<TeamScopeValue>(initial.scope);
  const [sel, setSel] = useState<Set<string>>(initial.sel);

  const dirty =
    scope !== initial.scope ||
    (scope === "custom" &&
      (sel.size !== initial.sel.size || [...sel].some((s) => !initial.sel.has(s))));

  function toggle(slug: string) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });
  }

  function save() {
    const slugs =
      scope === "all"
        ? null
        : Array.from(expandTeamSlugs(scope === "brasil" ? ["brasil"] : Array.from(sel)));
    update.mutate(
      { leagueId, lcId, slugs },
      {
        onSuccess: () => toast("Recorte de seleções atualizado!", "success"),
        onError: (e) => toast(e instanceof Error ? e.message : "Erro ao salvar.", "error"),
      },
    );
  }

  const editable = window_.data?.editable === true;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Target className="size-4 shrink-0 text-brand-600" />
        <p className="min-w-0 flex-1 text-sm font-semibold text-ink-800">
          Seleções que valem ponto
        </p>
        {!editable && !window_.isLoading && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-500">
            <Lock className="size-3" /> travado
          </span>
        )}
      </div>

      {window_.isLoading ? (
        <div className="h-10 animate-pulse rounded-md bg-ink-100" />
      ) : editable ? (
        <>
          <TeamScopeSelector scope={scope} onScopeChange={setScope} sel={sel} onToggle={toggle} />
          <p className="text-xs leading-snug text-ink-400">
            Dá pra ajustar até o primeiro jogo da Copa começar. Depois disso, trava.
          </p>
          {dirty && (
            <Button
              size="sm"
              fullWidth
              loading={update.isPending}
              disabled={scope === "custom" && sel.size === 0}
              onClick={save}
            >
              Salvar recorte
            </Button>
          )}
        </>
      ) : (
        <p className="text-xs leading-relaxed text-ink-500">
          {scope === "all"
            ? "A Copa inteira vale ponto no ranking do grupo."
            : scope === "brasil"
              ? "Só os jogos do Brasil valem ponto no ranking do grupo."
              : `${sel.size} seleções valem ponto no ranking do grupo.`}{" "}
          {window_.data?.reason ?? "A competição já começou: o recorte está travado."}
        </p>
      )}
    </Card>
  );
}
