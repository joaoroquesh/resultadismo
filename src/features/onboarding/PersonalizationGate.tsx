import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import { usePersonalizationState } from "./personalizationApi";
import { consumeFreshInvite } from "@/lib/invite";

// Depois do tour de boas-vindas (Onboarding, overlay global), o Resultadista de
// primeira viagem cai na PÁGINA de personalização. Em vez de modal, redireciona.
//
// Dispara em QUALQUER rota (não só "/"), pra também pegar quem entra por
// deep-link/convite sem ter personalizado. Uma vez por sessão (fired): quem
// conclui ou pula marca done (otimista, antes de navegar), então o single-fire
// também evita o bounce da corrida do cache ao voltar pra "/". O convite fica em
// localStorage e sobrevive ao redirect — a personalização preenche/consome o
// código no fim, então mandar o novato pro wizard NÃO perde o convite.
export function PersonalizationGate() {
  const { user, loading } = useAuth();
  const { data: state } = usePersonalizationState();
  const navigate = useNavigate();
  const loc = useLocation();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (loading || !user || !state) return;
    if (!state.personalization_done) {
      if (loc.pathname.startsWith("/perfil/personalizar")) return; // já no wizard: não re-redireciona
      fired.current = true;
      navigate("/perfil/personalizar"); // 1º acesso: o wizard preenche o convite
      return;
    }
    // Já personalizou e chegou AGORA por um link de convite (só na entrada "/")
    // → direto pra /grupos com o código preenchido. Restrito a "/" pra não
    // sequestrar quem está vendo um grupo específico nem visitas futuras com
    // código antigo guardado.
    if (loc.pathname === "/" && consumeFreshInvite()) {
      fired.current = true;
      navigate("/grupos");
    }
  }, [loading, user, state, loc.pathname, navigate]);

  return null;
}
