import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { RequireAuth, RequireAdmin } from "@/features/auth/guards";
import { AuthCallback } from "@/features/auth/AuthCallback";
import { AppShell } from "@/components/layout/AppShell";
import { JogosPage } from "@/features/matches/JogosPage";
import { Onboarding } from "@/features/onboarding/Onboarding";

// Code-splitting: o primeiro paint (landing de Jogos + login) não baixa admin,
// confronto/simulador, editor de perfil nem páginas secundárias — elas carregam
// sob demanda. Corta um bom pedaço do bundle inicial.
const PerfilPage = lazy(() => import("@/features/profile/PerfilPage").then((m) => ({ default: m.PerfilPage })));
const LigasPage = lazy(() => import("@/features/leagues/LigasPage").then((m) => ({ default: m.LigasPage })));
const NovaLigaPage = lazy(() => import("@/features/leagues/NovaLigaPage").then((m) => ({ default: m.NovaLigaPage })));
const LigaDetailPage = lazy(() => import("@/features/leagues/LigaDetailPage").then((m) => ({ default: m.LigaDetailPage })));
const EditarPerfilPage = lazy(() => import("@/features/profile/EditarPerfilPage").then((m) => ({ default: m.EditarPerfilPage })));
const AdminPage = lazy(() => import("@/features/admin/AdminPage").then((m) => ({ default: m.AdminPage })));
const AdminCompMatchesPage = lazy(() => import("@/features/admin/AdminCompMatchesPage").then((m) => ({ default: m.AdminCompMatchesPage })));
const PlayerProfilePage = lazy(() => import("@/features/players/PlayerProfilePage").then((m) => ({ default: m.PlayerProfilePage })));
const ComoFuncionaPage = lazy(() => import("@/features/help/ComoFuncionaPage").then((m) => ({ default: m.ComoFuncionaPage })));
const PrivacidadePage = lazy(() => import("@/features/legal/PrivacidadePage").then((m) => ({ default: m.PrivacidadePage })));
const TermosPage = lazy(() => import("@/features/legal/TermosPage").then((m) => ({ default: m.TermosPage })));
const SimuladorPage = lazy(() => import("@/features/confronto/SimuladorPage").then((m) => ({ default: m.SimuladorPage })));
const RankingPage = lazy(() => import("@/features/ranking/RankingPage").then((m) => ({ default: m.RankingPage })));
const ConfrontosPage = lazy(() => import("@/features/confronto/ConfrontosPage").then((m) => ({ default: m.ConfrontosPage })));
const FeedbackPage = lazy(() => import("@/features/feedback/FeedbackPage").then((m) => ({ default: m.FeedbackPage })));

// Redireciona links antigos /ligas/:slug para /grupos/:slug (rename Liga -> Grupo)
function FederacaoSlugRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/grupos/${slug ?? ""}`} replace />;
}

function PageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-8 text-sm opacity-60">
      Carregando…
    </div>
  );
}

export default function App() {
  return (
    <>
      <Onboarding />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* públicas e sempre acessíveis (Google exige links públicos) */}
          <Route path="/privacidade" element={<PrivacidadePage />} />
          <Route path="/termos" element={<TermosPage />} />

          {/* compat: links antigos de "liga" agora apontam para "grupo" */}
          <Route path="/ligas" element={<Navigate to="/grupos" replace />} />
          <Route path="/ligas/nova" element={<Navigate to="/grupos/nova" replace />} />
          <Route path="/ligas/:slug" element={<FederacaoSlugRedirect />} />
          {/* compat: links antigos de "federação" agora apontam para "grupo" */}
          <Route path="/federacoes" element={<Navigate to="/grupos" replace />} />
          <Route path="/federacoes/nova" element={<Navigate to="/grupos/nova" replace />} />
          <Route path="/federacoes/:slug" element={<FederacaoSlugRedirect />} />

          <Route element={<AppShell />}>
            {/* público: ver jogos sem login */}
            <Route path="/" element={<JogosPage />} />
            <Route path="/como-funciona" element={<ComoFuncionaPage />} />

            {/* exige login */}
            <Route element={<RequireAuth />}>
              <Route path="/grupos" element={<LigasPage />} />
              <Route path="/grupos/nova" element={<NovaLigaPage />} />
              <Route path="/grupos/:slug" element={<LigaDetailPage />} />
              <Route path="/grupos/:slug/confrontos" element={<ConfrontosPage />} />
              <Route path="/classificacao" element={<Navigate to="/grupos" replace />} />
              <Route path="/ranking" element={<RankingPage />} />
              <Route path="/perfil" element={<PerfilPage />} />
              <Route path="/perfil/editar" element={<EditarPerfilPage />} />
              <Route path="/construa" element={<FeedbackPage />} />
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
      </Suspense>
    </>
  );
}
