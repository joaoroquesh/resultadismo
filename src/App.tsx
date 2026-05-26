import { Routes, Route, Navigate } from "react-router-dom";
import { RequireAuth, RequireAdmin } from "@/features/auth/guards";
import { LoginPage } from "@/features/auth/LoginPage";
import { AuthCallback } from "@/features/auth/AuthCallback";
import { AppShell } from "@/components/layout/AppShell";
import { JogosPage } from "@/features/matches/JogosPage";
import { PerfilPage } from "@/features/profile/PerfilPage";
import { LigasPage } from "@/features/leagues/LigasPage";
import { NovaLigaPage } from "@/features/leagues/NovaLigaPage";
import { LigaDetailPage } from "@/features/leagues/LigaDetailPage";
import { ClassificacaoPage } from "@/features/standings/ClassificacaoPage";
import { EditarPerfilPage } from "@/features/profile/EditarPerfilPage";
import { AdminPage } from "@/features/admin/AdminPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<JogosPage />} />
          <Route path="/ligas" element={<LigasPage />} />
          <Route path="/ligas/nova" element={<NovaLigaPage />} />
          <Route path="/ligas/:slug" element={<LigaDetailPage />} />
          <Route path="/classificacao" element={<ClassificacaoPage />} />
          <Route path="/perfil" element={<PerfilPage />} />
          <Route path="/perfil/editar" element={<EditarPerfilPage />} />

          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
