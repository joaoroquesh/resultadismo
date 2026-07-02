import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
} from "resultadismo";

export const Composed = () => (
  <div style={{ padding: 16, maxWidth: 380 }}>
    <Card>
      <CardHeader>
        <CardTitle>Brasileirão — Rodada 12</CardTitle>
        <CardDescription>Palpites abertos até sábado, 16h.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-ink-700">
          Acerte o placar exato e leve 3 pontos. Saldo ou vencedor também pontuam.
        </p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Palpitar agora</Button>
        <Button size="sm" variant="ghost">Ver jogos</Button>
      </CardFooter>
    </Card>
  </div>
);

export const WithBadge = () => (
  <div style={{ padding: 16, maxWidth: 380 }}>
    <Card>
      <CardHeader>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <CardTitle>Sua liga</CardTitle>
          <Badge tone="brand">3º lugar</Badge>
        </div>
        <CardDescription>Amigos do Futebol · 8 participantes</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-ink-700">Faltam 2 rodadas para o fim da temporada.</p>
      </CardContent>
    </Card>
  </div>
);

export const Bare = () => (
  <div style={{ padding: 16, maxWidth: 380 }}>
    <Card>
      <CardContent>
        <p className="text-sm text-ink-600">
          Card simples, sem cabeçalho — só conteúdo sobre a superfície elevada.
        </p>
      </CardContent>
    </Card>
  </div>
);
