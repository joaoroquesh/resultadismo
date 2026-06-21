import { useCallback, useEffect, useState } from "react";

export type MatchCardScoreLayout = "prediction" | "real";

export const MATCH_CARD_SCORE_LAYOUT_OPTIONS: { value: MatchCardScoreLayout; label: string }[] = [
  { value: "prediction", label: "Meu palpite" },
  { value: "real", label: "Placar real" },
];

const STORAGE_KEY = "resultadismo-match-card-score-layout-v1";
const CHANGE_EVENT = "resultadismo:match-card-score-layout";

function isLayout(value: string | null): value is MatchCardScoreLayout {
  return value === "prediction" || value === "real";
}

export function readMatchCardScoreLayout(): MatchCardScoreLayout {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLayout(value) ? value : "prediction";
  } catch {
    return "prediction";
  }
}

export function useMatchCardScoreLayout(): [
  MatchCardScoreLayout,
  (layout: MatchCardScoreLayout) => void,
] {
  const [layout, setLayoutState] = useState(readMatchCardScoreLayout);

  useEffect(() => {
    const refresh = () => setLayoutState(readMatchCardScoreLayout());
    window.addEventListener("storage", refresh);
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(CHANGE_EVENT, refresh);
    };
  }, []);

  const setLayout = useCallback((next: MatchCardScoreLayout) => {
    setLayoutState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      // Preferencia visual: se o navegador bloquear o storage, mantem so nesta render.
    }
  }, []);

  return [layout, setLayout];
}
