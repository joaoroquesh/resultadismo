import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { LoadingScreen } from "@/components/ui/Spinner";

export function AuthCallback() {
  const { loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      navigate("/", { replace: true });
    }
  }, [loading, navigate]);

  return <LoadingScreen label="Entrando…" />;
}
