const DEFAULT_MESSAGE = "Estamos em manutenção, voltamos em breve.";

/**
 * Tela cheia de manutenção (turquesa) para logados não-admin. Logo ESTÁTICA (sem
 * animação de carregamento) num medalhão branco p/ contraste, e a mensagem do
 * admin (app_settings.maintenance_message) ou um texto padrão.
 */
export function MaintenanceScreen({ message }: { message?: string | null }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-7 overflow-auto bg-brand-600 px-6 text-center">
      <div className="rounded-full bg-white p-6 shadow-lg">
        <img src="/brand/Resultadismo.svg" alt="Resultadismo" className="size-20" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold text-white">Em manutenção</h1>
        <p className="mx-auto max-w-xs text-balance text-base font-medium text-white/90">
          {message?.trim() || DEFAULT_MESSAGE}
        </p>
      </div>
    </div>
  );
}
