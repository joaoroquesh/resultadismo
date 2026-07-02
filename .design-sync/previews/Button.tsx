import { Button } from "resultadismo";
import { Zap, Check, Plus, Trash2 } from "lucide-react";

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: 16 }}>
    {children}
  </div>
);

export const Variants = () => (
  <Row>
    <Button variant="primary">Palpitar</Button>
    <Button variant="secondary">Entrar</Button>
    <Button variant="outline">Ver regras</Button>
    <Button variant="ghost">Depois</Button>
    <Button variant="danger">Sair da liga</Button>
  </Row>
);

export const Sizes = () => (
  <Row>
    <Button size="sm">Pequeno</Button>
    <Button size="md">Médio</Button>
    <Button size="lg">Grande</Button>
    <Button size="icon" aria-label="Adicionar"><Plus className="size-4" /></Button>
  </Row>
);

export const WithIcons = () => (
  <Row>
    <Button variant="primary"><Zap className="size-4" /> Salvar palpite</Button>
    <Button variant="outline"><Check className="size-4" /> Confirmado</Button>
    <Button variant="danger"><Trash2 className="size-4" /> Remover</Button>
  </Row>
);

export const States = () => (
  <Row>
    <Button loading>Salvando…</Button>
    <Button disabled>Indisponível</Button>
    <div style={{ width: 220 }}>
      <Button fullWidth>Confirmar palpite</Button>
    </div>
  </Row>
);
