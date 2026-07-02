import { useEffect } from "react";
import { ToastProvider, useToast, Button } from "resultadismo";

// Os toasts sobem no topo (portal fixo). O preview dispara os três tons na
// montagem para a vitrine; no app, chame useToast().toast(msg, tone).
function Disparar() {
  const { toast } = useToast();
  useEffect(() => {
    toast("Palpite salvo!", "success");
    const t1 = setTimeout(() => toast("Não foi possível salvar.", "error"), 50);
    const t2 = setTimeout(() => toast("A rodada encerra em 1 hora.", "info"), 100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [toast]);
  return (
    <div style={{ padding: "120px 24px 24px", display: "flex", justifyContent: "center" }}>
      <Button variant="outline">Salvar palpite</Button>
    </div>
  );
}

export const Toasts = () => (
  <ToastProvider>
    <Disparar />
  </ToastProvider>
);
