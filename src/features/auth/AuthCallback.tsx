import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { LoadingScreen } from "@/components/ui/Spinner";

export function AuthCallback() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      navigate(session ? "/" : "/login", { replace: true });
    }
  }, [session, loading, navigate]);

  return <LoadingScreen label="Entrando…" />;
}
