import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { LoginModal } from "./LoginModal";

interface LoginModalContextValue {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const LoginModalContext = createContext<LoginModalContextValue | undefined>(undefined);

/**
 * Disponibiliza o modal de login para qualquer parte do app (Sidebar, BottomNav,
 * landing da home) sem prop-drilling. Renderiza UMA instância do <LoginModal>.
 */
export function LoginModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo<LoginModalContextValue>(
    () => ({ open, close, isOpen }),
    [open, close, isOpen],
  );

  return (
    <LoginModalContext.Provider value={value}>
      {children}
      <LoginModal open={isOpen} onClose={close} />
    </LoginModalContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLoginModal() {
  const ctx = useContext(LoginModalContext);
  if (!ctx) throw new Error("useLoginModal deve ser usado dentro de <LoginModalProvider>");
  return ctx;
}
