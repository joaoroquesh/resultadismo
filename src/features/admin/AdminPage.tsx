import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { PaymentAdmin } from "./PaymentAdmin";
import { LigasAdmin } from "./LigasAdmin";
import { CompeticoesAdmin } from "./CompeticoesAdmin";
import { UsuariosAdmin } from "./UsuariosAdmin";

type Tab = "federações" | "competicoes" | "usuarios" | "pagamento";

export function AdminPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("federações");

  return (
    <Page
      title="Admin"
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate("/perfil")} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      <SegmentedControl<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: "federações", label: "Federações" },
          { value: "competicoes", label: "Comp." },
          { value: "usuarios", label: "Users" },
          { value: "pagamento", label: "Pgto" },
        ]}
      />
      {tab === "federações" && <LigasAdmin />}
      {tab === "competicoes" && <CompeticoesAdmin />}
      {tab === "usuarios" && <UsuariosAdmin />}
      {tab === "pagamento" && <PaymentAdmin />}
    </Page>
  );
}
