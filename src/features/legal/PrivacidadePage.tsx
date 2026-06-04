import { LegalLayout, LegalSection } from "./LegalLayout";

const CONTATO = "resultadismoapp@gmail.com";

export function PrivacidadePage() {
  return (
    <LegalLayout title="Política de Privacidade" updatedAt="4 de junho de 2026">
      <p>
        Esta Política explica como o <strong>Resultadismo</strong> ("nós", "app") coleta, usa e
        protege seus dados quando você usa o site e o aplicativo em{" "}
        <strong>resultadismo.com</strong>. O Resultadismo é um jogo de palpites de futebol entre
        amigos — <strong>gratuito para jogar e participar</strong>; criar uma federação própria (o
        espaço onde você joga com seus amigos) pode ter uma taxa única. Não há apostas nem dinheiro
        real em jogo. Ao usar o app, você concorda com esta Política, em conformidade com a Lei Geral
        de Proteção de Dados (LGPD, Lei nº 13.709/2018).
      </p>
      <p>
        <strong>Controlador dos dados:</strong> o Resultadismo, projeto independente mantido de forma
        pessoal. <strong>Encarregado (DPO):</strong> os pedidos sobre dados e privacidade são tratados
        diretamente pelo responsável pelo app, pelo e-mail <strong>{CONTATO}</strong> (LGPD, art. 41).
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
            <strong>Atividade no jogo:</strong> seus palpites de placar, as federações que você cria ou
            participa, e a pontuação resultante.
          </li>
          <li>
            <strong>Notificações (opcional):</strong> se você ativar, guardamos a inscrição de push
            do seu navegador para enviar avisos de prazo e cutucadas.
          </li>
          <li>
            <strong>Dados técnicos:</strong> registros mínimos de funcionamento e segurança gerados pelo
            nosso provedor de backend (ex.: data e hora de acesso e endereço IP), usados para autenticar,
            manter o serviço estável e prevenir abusos.
          </li>
          <li>
            <strong>Pagamentos (ao criar federação paga):</strong> ao pagar a taxa de criação de federação, o
            pagamento é processado pelo Mercado Pago. Guardamos apenas o status e um identificador da
            transação; os dados do seu cartão ficam com o Mercado Pago, nunca conosco.
          </li>
          <li>
            <strong>Dados de uso (apenas com seu consentimento):</strong> se você aceitar no banner
            de cookies, usamos o <strong>Google Analytics 4</strong> para entender de forma agregada
            como o app é usado (telas mais visitadas, dispositivo, país aproximado pelo IP). O IP é
            anonimizado pelo próprio Google. Se você recusar, esse rastreamento não acontece.
          </li>
        </ul>
        <p>
          Não coletamos dados sensíveis e <strong>não rastreamos você para publicidade</strong>. Os
          únicos cookies/armazenamento de terceiros que podem ser ativados são os do Google Analytics,
          e só quando você aceita no banner de consentimento.
        </p>
      </LegalSection>

      <LegalSection title="2. Como usamos seus dados">
        <ul className="list-disc space-y-1 pl-5">
          <li>Autenticar seu acesso e manter sua sessão.</li>
          <li>Registrar palpites, calcular a pontuação e montar as classificações das federações.</li>
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
          <li>
            <strong>Mercado Pago</strong> — processamento de pagamentos, apenas se você criar uma federação
            paga.
          </li>
          <li>
            <strong>Google Analytics 4</strong> — métricas de uso agregadas e anonimizadas, apenas
            se você aceitar no banner de consentimento. Não usamos para publicidade.
          </li>
        </ul>
        <p>
          Dentro de uma federação, seu nome, avatar e estatísticas ficam visíveis aos demais participantes,
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
          conectado, lembrar preferências (tema, dispensa de avisos, sua escolha no banner de
          consentimento) e permitir o uso como app instalável (PWA). Não são cookies de rastreamento
          publicitário.
        </p>
        <p>
          Se você aceitar no banner de cookies, o Google Analytics grava também cookies próprios
          (`_ga`, `_ga_*`) para medir uso agregado. Se recusar, esses cookies não são gravados.
        </p>
      </LegalSection>

      <LegalSection title="7. Segurança">
        <p>
          Adotamos medidas técnicas e organizacionais razoáveis para proteger seus dados, incluindo
          conexões criptografadas (HTTPS) e controles de acesso por linha (RLS) no banco. Nenhum sistema
          é 100% seguro, mas trabalhamos para reduzir riscos.
        </p>
        <p>
          Em caso de incidente de segurança que possa gerar risco relevante aos seus dados, tomaremos as
          medidas cabíveis e comunicaremos você e a Autoridade Nacional de Proteção de Dados (ANPD)
          quando exigido pela LGPD.
        </p>
      </LegalSection>

      <LegalSection title="8. Retenção e exclusão">
        <p>
          Mantemos seus dados enquanto sua conta existir. Você pode solicitar a exclusão da sua conta a
          qualquer momento pelo contato abaixo; após a solicitação, removemos seus dados pessoais em até{" "}
          <strong>30 dias</strong>. Registros técnicos de acesso e segurança podem ser mantidos por até{" "}
          <strong>6 meses</strong> e alguns dados podem ser conservados por mais tempo quando exigido por
          lei.
        </p>
      </LegalSection>

      <LegalSection title="9. Seus direitos">
        <p>
          Conforme a LGPD (art. 18), você pode solicitar: confirmação e acesso aos seus dados; correção;
          anonimização ou exclusão; portabilidade; informação sobre compartilhamentos; e revogação de
          consentimento. Para exercer, escreva para <strong>{CONTATO}</strong>. Você também pode
          apresentar uma reclamação à Autoridade Nacional de Proteção de Dados (ANPD) em{" "}
          <strong>gov.br/anpd</strong>.
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
