import { LegalLayout, LegalSection } from "./LegalLayout";

const CONTATO = "contato@resultadismo.com";

export function PrivacidadePage() {
  return (
    <LegalLayout title="Política de Privacidade" updatedAt="27 de maio de 2026">
      <p>
        Esta Política explica como o <strong>Resultadismo</strong> ("nós", "app") coleta, usa e
        protege seus dados quando você usa o site e o aplicativo em{" "}
        <strong>resultadismo.com</strong>. O Resultadismo é um jogo gratuito de palpites de futebol
        entre amigos, sem apostas e sem dinheiro real. Ao usar o app, você concorda com esta
        Política, em conformidade com a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).
      </p>

      <LegalSection title="1. Dados que coletamos">
        <p>Coletamos apenas o necessário para o jogo funcionar:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Conta Google:</strong> ao entrar com o Google, recebemos seu nome, e-mail e foto
            de perfil. O login é feito exclusivamente pelo Google; não criamos nem armazenamos
            senhas.
          </li>
          <li>
            <strong>Perfil:</strong> nome de exibição e avatar (incluindo o avatar personalizado que
            você escolher).
          </li>
          <li>
            <strong>Atividade no jogo:</strong> seus palpites de placar, as ligas que você cria ou
            participa, e a pontuação resultante.
          </li>
          <li>
            <strong>Notificações (opcional):</strong> se você ativar, guardamos a inscrição de push
            do seu navegador para enviar avisos de prazo e cutucadas.
          </li>
          <li>
            <strong>Dados técnicos:</strong> informações mínimas de funcionamento (ex.: identificador
            de sessão de acesso e horário), usadas para manter o serviço estável em horários de pico.
          </li>
        </ul>
        <p>
          Não coletamos dados sensíveis, não rastreamos você para publicidade e não usamos cookies de
          rastreamento de terceiros.
        </p>
      </LegalSection>

      <LegalSection title="2. Como usamos seus dados">
        <ul className="list-disc space-y-1 pl-5">
          <li>Autenticar seu acesso e manter sua sessão.</li>
          <li>Registrar palpites, calcular a pontuação e montar as classificações das ligas.</li>
          <li>Mostrar seu perfil público (nome, avatar e estatísticas) a outros jogadores.</li>
          <li>Enviar notificações que você ativou (lembretes de palpite e cutucadas).</li>
          <li>Manter a segurança, prevenir abusos e operar o serviço.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Bases legais (LGPD)">
        <p>
          Tratamos seus dados para a <strong>execução do serviço</strong> que você solicitou (jogar),
          com base no seu <strong>consentimento</strong> (ex.: login com Google e notificações) e no{" "}
          <strong>legítimo interesse</strong> de operar e proteger o app. Você pode retirar o
          consentimento a qualquer momento (ver "Seus direitos").
        </p>
      </LegalSection>

      <LegalSection title="4. Com quem compartilhamos">
        <p>
          Não vendemos seus dados. Eles são tratados por prestadores de serviço (operadores) que nos
          ajudam a rodar o app:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Supabase</strong> — banco de dados, autenticação e backend.
          </li>
          <li>
            <strong>Vercel</strong> — hospedagem do site.
          </li>
          <li>
            <strong>Google</strong> — login (OAuth) com sua conta Google.
          </li>
          <li>
            <strong>Serviços de push do navegador</strong> (Google, Apple, Mozilla) — apenas se você
            ativar notificações, para entregá-las ao seu dispositivo.
          </li>
        </ul>
        <p>
          Dentro de uma liga, seu nome, avatar e estatísticas ficam visíveis aos demais participantes,
          e seus palpites tornam-se visíveis após o início de cada jogo. Seu e-mail nunca é exposto a
          outros jogadores.
        </p>
        <p>
          Os resultados dos jogos vêm de provedores públicos de dados de futebol (ex.: football-data.org);
          nenhum dado seu é enviado a eles.
        </p>
      </LegalSection>

      <LegalSection title="5. Armazenamento e transferência internacional">
        <p>
          Os dados são armazenados na infraestrutura dos nossos operadores, que podem manter servidores
          fora do Brasil. Ao usar o app, você reconhece que seus dados podem ser processados no exterior,
          sempre com salvaguardas adequadas, conforme a LGPD.
        </p>
      </LegalSection>

      <LegalSection title="6. Armazenamento no seu dispositivo">
        <p>
          Usamos armazenamento local do navegador (localStorage) e um service worker para manter você
          conectado, lembrar preferências (tema, dispensa de avisos) e permitir o uso como app
          instalável (PWA). Não são cookies de rastreamento publicitário.
        </p>
      </LegalSection>

      <LegalSection title="7. Segurança">
        <p>
          Adotamos medidas técnicas e organizacionais razoáveis para proteger seus dados, incluindo
          conexões criptografadas (HTTPS) e controles de acesso por linha (RLS) no banco. Nenhum sistema
          é 100% seguro, mas trabalhamos para reduzir riscos.
        </p>
      </LegalSection>

      <LegalSection title="8. Retenção e exclusão">
        <p>
          Mantemos seus dados enquanto sua conta existir. Você pode solicitar a exclusão da sua conta e
          dos dados associados a qualquer momento pelo contato abaixo; atenderemos no prazo legal.
          Alguns registros podem ser mantidos quando exigido por lei.
        </p>
      </LegalSection>

      <LegalSection title="9. Seus direitos">
        <p>
          Conforme a LGPD, você pode solicitar: confirmação e acesso aos seus dados; correção; anonimização
          ou exclusão; portabilidade; informação sobre compartilhamentos; e revogação de consentimento.
          Para exercer, escreva para <strong>{CONTATO}</strong>.
        </p>
      </LegalSection>

      <LegalSection title="10. Menores de idade">
        <p>
          O Resultadismo não é destinado a menores de 13 anos. Se você tem entre 13 e 18 anos, use o app
          com a supervisão e o consentimento de um responsável.
        </p>
      </LegalSection>

      <LegalSection title="11. Alterações nesta Política">
        <p>
          Podemos atualizar esta Política. Mudanças relevantes serão indicadas pela data de "última
          atualização" no topo. O uso contínuo do app após alterações significa concordância com a versão
          vigente.
        </p>
      </LegalSection>

      <LegalSection title="12. Contato">
        <p>
          Dúvidas sobre privacidade ou seus dados? Fale com a gente em <strong>{CONTATO}</strong>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
