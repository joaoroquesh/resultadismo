import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { LoginModalProvider } from "@/features/auth/LoginModalProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import "./index.css";

// PWA: quando um novo service worker assume, recarrega 1x para aplicar a atualização
// (sem isso, a página fica na versão antiga em cache mesmo após o SW trocar).
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded || !hadController) return; // não recarrega na 1ª instalação
    reloaded = true;
    window.location.reload();
  });
  // cutuca uma checagem de atualização logo ao abrir
  navigator.serviceWorker.ready.then((reg) => reg.update().catch(() => {})).catch(() => {});
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ToastProvider>
            <AuthProvider>
              <LoginModalProvider>
                <App />
              </LoginModalProvider>
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
