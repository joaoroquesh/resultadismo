import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { RequireAuth, RequireAdmin } from "@/features/auth/guards";
import { LoginPage } from "@/features/auth/LoginPage";
import { AuthCallback } from "@/features/auth/AuthCallback";
import { AppShell } from "@/components/layout/AppShell";
import { JogosPage } from "@/features/matches/JogosPage";
import { PerfilPage } from "@/features/profile/PerfilPage";
import { LigasPage } from "@/features/leagues/LigasPage";
import { NovaLigaPage } from "@/features/leagues/NovaLigaPage";
import { LigaDetailPage } from "@/features/leagues/LigaDetailPage";
import { EditarPerfilPage } from "@/features/profile/EditarPerfilPage";
import { AdminPage } from "@/features/admin/AdminPage";
import { AdminCompMatchesPage } from "@/features/admin/AdminCompMatchesPage";
import { PlayerProfilePage } from "@/features/players/PlayerProfilePage";
import { ComoFuncionaPage } from "@/features/help/ComoFuncionaPage";
import { Onboarding } from "@/features/onboarding/Onboarding";
import { PrivacidadePage } from "@/features/legal/PrivacidadePage";
import { TermosPage } from "@/features/legal/TermosPage";
import { SimuladorPage } from "@/features/confronto/SimuladorPage";

// Redireciona links antigos /ligas/:slug para /federacoes/:slug (rename Liga -> Federação)
function FederacaoSlugRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/federacoes/${slug ?? ""}`} replace />;
}

export default function App() {
  return (
    <>
      <Onboarding />
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* públicas e sempre acessíveis (Google exige links públicos) */}
      <Route path="/privacidade" element={<PrivacidadePage />} />
      <Route path="/termos" element={<TermosPage />} />

      {/* compat: links antigos de "liga" agora apontam para "federação" */}
      <Route path="/ligas" element={<Navigate to="/federacoes" replace />} />
      <Route path="/ligas/nova" element={<Navigate to="/federacoes/nova" replace />} />
      <Route path="/ligas/:slug" element={<FederacaoSlugRedirect />} />

      <Route element={<AppShell />}>
        {/* público: ver jogos sem login */}
        <Route path="/" element={<JogosPage />} />
        <Route path="/como-funciona" element={<ComoFuncionaPage />} />

        {/* exige login */}
        <Route element={<RequireAuth />}>
          <Route path="/federacoes" element={<LigasPage />} />
          <Route path="/federacoes/nova" element={<NovaLigaPage />} />
          <Route path="/federacoes/:slug" element={<LigaDetailPage />} />
          <Route path="/classificacao" element={<Navigate to="/federacoes" replace />} />
          <Route path="/perfil" element={<PerfilPage />} />
          <Route path="/perfil/editar" element={<EditarPerfilPage />} />
          <Route path="/simulador" element={<SimuladorPage />} />
          <Route path="/jogador/:id" element={<PlayerProfilePage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/competicoes/:id/jogos" element={<AdminCompMatchesPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
