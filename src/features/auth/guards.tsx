import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { LoadingScreen } from "@/components/ui/Spinner";

export function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function RequireAdmin() {
  const { loading, isAppAdmin } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!isAppAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
