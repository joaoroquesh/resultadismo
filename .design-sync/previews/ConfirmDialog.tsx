import { ConfirmDialog } from "resultadismo";

// ConfirmDialog é fixed inset-0. O wrapper com `transform` contém o position:fixed
// para o card renderizar o overlay + diálogo inteiros. No app, use <ConfirmDialog open>.
const Screen = ({ children }: { children: React.ReactNode }) => (
  <div style={{ position: "relative", height: 340, transform: "translateZ(0)", overflow: "hidden", borderRadius: 14 }}>
    {children}
  </div>
);

export const Destrutivo = () => (
  <Screen>
    <ConfirmDialog
      open
      tone="danger"
      title="Sair da liga?"
      message="Você perde sua pontuação nesta federação. Esta ação não pode ser desfeita."
      confirmLabel="Sair da liga"
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  </Screen>
);

export const AltoImpacto = () => (
  <Screen>
    <ConfirmDialog
      open
      tone="warn"
      title="Encerrar a rodada para todos?"
      message="Os palpites serão travados e a pontuação, calculada. Avise os participantes antes."
      confirmLabel="Encerrar rodada"
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  </Screen>
);
