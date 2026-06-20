import { LegalLayout, LegalSection } from "./LegalLayout";

const CONTATO = "resultadismoapp@gmail.com";

export function TermosPage() {
  return (
    <LegalLayout title="Termos de Serviço" updatedAt="10 de junho de 2026">
      <p>
        Boas-vindas ao <strong>Resultadismo</strong>. Estes Termos regem o uso do site e do aplicativo em{" "}
        <strong>resultadismo.com</strong>. Ao acessar ou usar o app, você concorda com estes Termos. Se
        não concordar, não use o serviço.
      </p>
      <p>
        O Resultadismo é um projeto independente, mantido de forma pessoal. Para qualquer assunto legal,
        de privacidade ou de proteção de dados, fale com <strong>{CONTATO}</strong>.
      </p>

      <LegalSection title="1. O que é o Resultadismo">
        <p>
          O Resultadismo é um jogo de <strong>entretenimento</strong>: você palpita os placares de jogos
          reais de futebol, ganha pontos por acerto e disputa com amigos em grupos.{" "}
          <strong>Não é uma casa de apostas.</strong> Não há aposta de dinheiro nem prêmios em dinheiro.
          Jogar, participar e <strong>criar grupos é gratuito</strong> (ver seção 12).
        </p>
      </LegalSection>

      <LegalSection title="2. Sua conta">
        <ul className="list-disc space-y-1 pl-5">
          <li>O acesso é feito com sua conta Google. Você é responsável pela atividade na sua conta.</li>
          <li>Você deve ter ao menos 13 anos; entre 13 e 18, com consentimento de um responsável.</li>
          <li>Use informações verídicas e mantenha apenas uma conta por pessoa.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Conduta esperada">
        <p>Para manter a brincadeira justa e saudável, você concorda em não:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Trapacear, usar bots, automações ou explorar falhas para obter vantagem.</li>
          <li>Usar nomes de grupo, perfil ou textos ofensivos, ilegais ou que violem direitos de terceiros.</li>
          <li>Abusar de recursos sociais (ex.: cutucadas) para incomodar outros jogadores.</li>
          <li>Tentar acessar dados de outras pessoas ou prejudicar o funcionamento do serviço.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Grupos e moderação">
        <p>
          Você pode criar e administrar grupos. Criar um grupo é livre e ele já nasce ativo: o{" "}
          <strong>nome</strong> passa por uma revisão rápida e, se for impróprio, pedimos que você
          troque (o grupo segue funcionando). O administrador do grupo gere seus membros e
          competições. O administrador geral do Resultadismo pode{" "}
          <strong>moderar, aprovar nomes, recusar ou excluir</strong> grupos e conteúdos que violem
          estes Termos, a fim de manter a integridade do jogo.
        </p>
      </LegalSection>

      <LegalSection title="5. Bolão valendo (organização entre membros)">
        <p>
          Grupos podem ativar o <strong>Bolão valendo</strong>, uma ferramenta{" "}
          <strong>opcional e meramente organizacional</strong> para grupos de amigos que, por conta
          própria, combinam um bolão com dinheiro entre si. Nela, os administradores do grupo registram quem
          contribuiu, o valor combinado e a divisão do prêmio.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Nenhum dinheiro passa pelo Resultadismo.</strong> O app não recebe, não guarda,
            não repassa e não intermedeia qualquer valor. Os números exibidos são apenas
            informativos, inseridos pelos próprios administradores do grupo.
          </li>
          <li>
            O acerto financeiro (cobrança, pagamento e entrega de prêmios) acontece{" "}
            <strong>fora do app</strong> e é de responsabilidade exclusiva dos membros do grupo.
          </li>
          <li>
            O Resultadismo não garante, não cobra e não se responsabiliza por valores combinados
            entre membros, nem atua como mediador de disputas sobre eles.
          </li>
          <li>Essas informações são visíveis apenas para os membros do grupo.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Pontuação e regras do jogo">
        <p>
          As regras de pontuação (cravada, saldo, acerto), o Dobro de Pontos e os critérios de desempate
          fazem parte do funcionamento do app e podem ser ajustados para melhorar a experiência. A
          pontuação é calculada com base nos resultados oficiais dos jogos.
        </p>
        <p>
          Notou um erro de placar ou de pontuação? Avise em até <strong>7 dias</strong> pelo contato no
          fim desta página. Corrigimos quando o erro for confirmado; a decisão final sobre a pontuação
          cabe à administração do Resultadismo.
        </p>
      </LegalSection>

      <LegalSection title="7. Dados de futebol de terceiros">
        <p>
          Os resultados, horários e informações dos jogos vêm de provedores públicos de dados (ex.:
          football-data.org) e podem conter atrasos, erros ou alterações. Fazemos esforço para manter
          tudo correto, mas não garantimos exatidão. Ajustes de placar/pontuação podem ocorrer quando os
          dados forem corrigidos.
        </p>
      </LegalSection>

      <LegalSection title="8. Disponibilidade do serviço">
        <p>
          O app é oferecido "no estado em que se encontra". Pode haver manutenções, indisponibilidades ou
          fila de acesso em momentos de pico. Podemos alterar, suspender ou descontinuar funcionalidades a
          qualquer tempo.
        </p>
      </LegalSection>

      <LegalSection title="9. Propriedade intelectual">
        <p>
          A marca "Resultadismo", o design, os textos e o código do app são protegidos. Escudos, nomes de
          times e competições pertencem aos seus respectivos titulares e são usados apenas para fins
          informativos do jogo.
        </p>
        <p>
          Ao criar grupos, escolher nomes ou enviar um avatar, você nos concede uma licença limitada e
          gratuita para exibir esse conteúdo dentro do app, apenas com a finalidade de operar o jogo.
        </p>
      </LegalSection>

      <LegalSection title="10. Limitação de responsabilidade">
        <p>
          Na máxima extensão permitida pela lei, o Resultadismo não se responsabiliza por danos indiretos,
          perda de dados ou prejuízos decorrentes do uso ou da indisponibilidade do serviço, nem por
          imprecisões nos dados de futebol de terceiros. O app é de entretenimento e não deve ser usado
          como base para decisões financeiras.
        </p>
      </LegalSection>

      <LegalSection title="11. Suspensão e encerramento">
        <p>
          Podemos suspender ou encerrar contas que violem estes Termos. Você pode encerrar sua conta a
          qualquer momento solicitando pelo contato abaixo.
        </p>
      </LegalSection>

      <LegalSection title="12. Alterações nos Termos">
        <p>
          Podemos atualizar estes Termos. Mudanças relevantes serão indicadas pela data de "última
          atualização" no topo e, quando significativas, avisadas dentro do app com antecedência razoável
          antes de entrarem em vigor. O uso contínuo após alterações significa concordância com a versão
          vigente.
        </p>
      </LegalSection>

      <LegalSection title="13. Pagamentos">
        <p>
          Hoje, <strong>criar e participar de grupos é totalmente gratuito</strong>: sem taxa, sem
          mensalidade e sem cobrança de qualquer tipo. Não há aposta de dinheiro nem prêmios em dinheiro.
        </p>
        <p>
          Se, no futuro, oferecermos recursos pagos, o valor e as condições serão{" "}
          <strong>apresentados com clareza antes de qualquer cobrança</strong>: você só paga se optar por
          eles. Em qualquer dúvida, fale com a gente em <strong>{CONTATO}</strong>.
        </p>
      </LegalSection>

      <LegalSection title="14. Lei aplicável e foro">
        <p>
          Estes Termos são regidos pelas leis brasileiras, incluindo o Código de Defesa do Consumidor
          (CDC), o Marco Civil da Internet (Lei nº 12.965/2014) e a Lei Geral de Proteção de Dados (LGPD,
          Lei nº 13.709/2018). Fica eleito o foro do domicílio do usuário para dirimir eventuais
          controvérsias, salvo disposição legal em contrário.
        </p>
      </LegalSection>

      <LegalSection title="15. Contato">
        <p>
          Dúvidas sobre estes Termos? Fale com a gente em <strong>{CONTATO}</strong>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
