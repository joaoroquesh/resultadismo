import { Input } from "resultadismo";
import { Search, Mail, User } from "lucide-react";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: 16, maxWidth: 340, display: "flex", flexDirection: "column", gap: 16 }}>
    {children}
  </div>
);

export const WithLabel = () => (
  <Frame>
    <Input label="Nome do time" placeholder="Ex.: Amigos FC" />
  </Frame>
);

export const WithIcon = () => (
  <Frame>
    <Input icon={<Search className="size-4" />} placeholder="Buscar liga…" />
    <Input icon={<Mail className="size-4" />} label="E-mail" placeholder="voce@email.com" />
  </Frame>
);

export const WithError = () => (
  <Frame>
    <Input
      label="Apelido"
      icon={<User className="size-4" />}
      defaultValue="jr"
      error="Mínimo de 3 caracteres."
    />
  </Frame>
);

export const Disabled = () => (
  <Frame>
    <Input label="Código da liga" value="RES-2026" disabled />
  </Frame>
);
