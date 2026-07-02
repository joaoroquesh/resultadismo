import { Modal, Button, CardTitle, CardDescription } from "resultadismo";

// O Modal é fixed inset-0 (tela cheia). O wrapper com `transform` vira o bloco
// de contenção do position:fixed, então o overlay + painel renderizam DENTRO do
// card (em vez de escapar). No app, use <Modal open> normalmente.
const Screen = ({ children }: { children: React.ReactNode }) => (
  <div style={{ position: "relative", height: 320, transform: "translateZ(0)", overflow: "hidden", borderRadius: 14 }}>
    {children}
  </div>
);

export const Aberto = () => (
  <Screen>
    <Modal open onClose={() => {}} label="Confirmar palpite">
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <CardTitle>Confirmar palpite</CardTitle>
        <CardDescription>
          Flamengo 2 × 1 Palmeiras — você não poderá alterar depois que a partida começar.
        </CardDescription>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <Button variant="ghost" size="sm">Voltar</Button>
          <Button size="sm">Cravar placar</Button>
        </div>
      </div>
    </Modal>
  </Screen>
);
