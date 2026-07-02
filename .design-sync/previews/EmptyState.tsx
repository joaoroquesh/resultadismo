import { EmptyState, Button } from "resultadismo";
import { Inbox, Trophy, Search } from "lucide-react";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: 16, maxWidth: 420 }}>{children}</div>
);

export const SemPalpites = () => (
  <Frame>
    <EmptyState
      icon={<Inbox className="size-7" />}
      title="Nenhum palpite ainda"
      description="Escolha um jogo da rodada e crave o placar para começar a pontuar."
      action={<Button size="sm">Ver jogos da rodada</Button>}
    />
  </Frame>
);

export const SemResultados = () => (
  <Frame>
    <EmptyState
      icon={<Search className="size-7" />}
      title="Nada encontrado"
      description="Tente outro termo ou remova os filtros da busca."
    />
  </Frame>
);

export const SemLigas = () => (
  <Frame>
    <EmptyState
      icon={<Trophy className="size-7" />}
      title="Você ainda não está em nenhuma liga"
      description="Crie a sua federação ou entre com um código de convite."
      action={<Button size="sm" variant="outline">Entrar com código</Button>}
    />
  </Frame>
);
