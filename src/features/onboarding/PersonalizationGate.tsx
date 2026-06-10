import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import { usePersonalizationState } from "./personalizationApi";
import { consumeFreshInvite } from "@/lib/invite";

// Depois do tour de boas-vindas (Onboarding, overlay global), o Resultadista de
// primeira viagem cai na PÁGINA de personalização. Em vez de modal, redireciona.
//
// Só dispara na entrada ("/"), pra NÃO sequestrar deep-links (ex.: abrir um
// convite /grupos/:slug). Uma vez por sessão; quem pula marca done e não volta.
export function PersonalizationGate() {
  const { user, loading } = useAuth();
  const { data: state } = usePersonalizationState();
  const navigate = useNavigate();
  const loc = useLocation();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (loading || !user || !state) return;
    if (loc.pathname !== "/") return; // só na entrada
    if (!state.personalization_done) {
      fired.current = true;
      navigate("/perfil/personalizar"); // 1º acesso: o wizard preenche o convite
      return;
    }
    // Já personalizou e chegou AGORA por um link de convite → direto pra
    // /grupos com o código preenchido (só na visita do clique; não sequestra
    // visitas futuras com código antigo guardado).
    if (consumeFreshInvite()) {
      fired.current = true;
      navigate("/grupos");
    }
  }, [loading, user, state, loc.pathname, navigate]);

  return null;
}
