$(document).ready(function () {
  $(document).on('copaPronto', function () {
      if (typeof window.copa !== 'undefined' && window.copa.data && typeof window.dados !== 'undefined' && window.dados.data) {
          ativarControleVisualizacaoCopa();
          construirClassificacaoCopa(window.copa.data, 'oitavas', window.dados.data);
      } else {
          console.error("Os dados da Copa não foram carregados corretamente.");
      }
  });

  // Contador de JSONs carregados
  let carregados = 0;

  $(document).on('dadosAtualizado pontosAtualizado copaAtualizado', function () {
      carregados++;
      if (carregados === 3) {
          if (typeof window.copa !== 'undefined' && window.copa.data && typeof window.dados !== 'undefined' && window.dados.data) {
              ativarControleVisualizacaoCopa();
              construirClassificacaoCopa(window.copa.data, 'oitavas', window.dados.data);
          }
          $('body').removeClass('loading');
          console.log("Todos os dados foram atualizados.");
      }
  });
});

function construirClassificacaoCopa(jogosData, faseSelecionada, dadosData) {
  let classificacao = {
      oitavas: {},
      quartas: {},
      semi: {},
      final: {}
  };

  let dataInicio = new Date(dadosData.find(d => d.nome === 'Copa').copa.split('/').reverse().join('-'));

  // Definir as datas de cada fase
  let datasFases = {
      oitavas: [new Date(dataInicio), new Date(dataInicio.setDate(dataInicio.getDate() + 6))],
      quartas: [new Date(dataInicio.setDate(dataInicio.getDate() + 1)), new Date(dataInicio.setDate(dataInicio.getDate() + 6))],
      semi: [new Date(dataInicio.setDate(dataInicio.getDate() + 1)), new Date(dataInicio.setDate(dataInicio.getDate() + 6))],
      final: [new Date(dataInicio.setDate(dataInicio.getDate() + 1)), new Date(dataInicio.setDate(dataInicio.getDate() + 6))]
  };

  // Inicializar todos os jogadores na classificação, mesmo com pontuação zero
  dadosData.forEach(jogador => {
      if (jogador.copa) {
          classificacao.oitavas[jogador.codigo] = classificacao.quartas[jogador.codigo] = classificacao.semi[jogador.codigo] = classificacao.final[jogador.codigo] = {
              pontuacao: 0,
              cravadas: 0,
              saldos: 0,
              acertos: 0
          };
      }
  });

  // Preencher as tabelas dos jogos com os jogadores que têm o respectivo valor na chave "copa"
  for (let i = 1; i <= 8; i++) {
      let jogadores = dadosData.filter(jogador => jogador.copa === i);
      if (jogadores.length === 2) {
          let tbody = $(`#jogo${i} tbody`);
          tbody.empty(); // Limpar qualquer conteúdo existente

          jogadores.forEach((jogador, index) => {
              let nome = jogador.codigo;
              let escudo = 'https://www.resultadismo.com/images/escudos/padrao.png';

              let linha = `
                  <tr>
                      <td>${index + 1}°</td>
                      <td><img src="${escudo}" data-codigo="${nome}" alt="Escudo" width="30"></td>
                      <td data-codigo="${nome}">${nome}</td>
                      <td>${jogador.pontuacao || 0}</td>
                      <td>${jogador.cravadas || 0}</td>
                      <td>${jogador.saldos || 0}</td>
                      <td>${jogador.acertos || 0}</td>
                  </tr>
              `;
              tbody.append(linha);
          });
      }
  }

  // Processar cada jogo para acumular a pontuação, cravadas, saldos e acertos dos jogadores por fase e datas definidas
  jogosData.forEach(jogo => {
      let dataJogo = new Date(jogo.data.split('/').reverse().join('-'));
      if (dataJogo >= datasFases[faseSelecionada][0] && dataJogo <= datasFases[faseSelecionada][1]) {
          let resultadoReal = jogo.resultado;
          for (let chave in jogo) {
              if (chave.includes('@') && jogo[chave] !== "") {
                  let palpiteJogador = jogo[chave];
                  if (!classificacao[faseSelecionada][chave]) {
                      classificacao[faseSelecionada][chave] = {
                          pontuacao: 0,
                          cravadas: 0,
                          saldos: 0,
                          acertos: 0
                      };
                  }

                  const [golsMandanteReal, golsVisitanteReal] = resultadoReal.split('x').map(Number);
                  const [golsMandantePalpite, golsVisitantePalpite] = palpiteJogador.split('x').map(Number);

                  let pontuacao = 0;

                  if (golsMandantePalpite === golsMandanteReal && golsVisitantePalpite === golsVisitanteReal) {
                      pontuacao = 3;
                      classificacao[faseSelecionada][chave].cravadas += 1;
                  } else if ((golsMandantePalpite - golsVisitantePalpite) === (golsMandanteReal - golsVisitanteReal) && (golsMandantePalpite > golsVisitantePalpite) === (golsMandanteReal > golsVisitanteReal)) {
                      pontuacao = 2;
                      classificacao[faseSelecionada][chave].saldos += 1;
                  } else if (
                      (golsMandantePalpite > golsVisitantePalpite && golsMandanteReal > golsVisitanteReal) ||
                      (golsMandantePalpite < golsVisitantePalpite && golsMandanteReal < golsVisitanteReal)
                  ) {
                      if (golsMandanteReal !== golsVisitanteReal) { // Não é um empate
                          pontuacao = 1;
                          classificacao[faseSelecionada][chave].acertos += 1;
                      }
                  }

                  // Atualizar pontuação total do jogador
                  classificacao[faseSelecionada][chave].pontuacao += pontuacao;
              }
          }
      }
  });

  // Construir a tabela de classificação para a fase selecionada
  let classificacaoArray = Object.entries(classificacao[faseSelecionada]).map(([codigo, stats]) => {
      return { codigo, ...stats };
  });

  // Ordenar a classificação com base na pontuação e critérios de desempate
  classificacaoArray.sort((a, b) => {
      if (b.pontuacao !== a.pontuacao) {
          return b.pontuacao - a.pontuacao;
      } else if (b.cravadas !== a.cravadas) {
          return b.cravadas - a.cravadas;
      } else if (b.saldos !== a.saldos) {
          return b.saldos - a.saldos;
      } else {
          return b.acertos - a.acertos;
      }
  });

  // Construir o HTML da tabela de classificação para a fase
  let tbody = $(`#jogo1 tbody, #jogo2 tbody`);
  tbody.empty(); // Limpar qualquer conteúdo existente

  classificacaoArray.forEach((jogador, index) => {
      let nome = jogador.codigo;
      let escudo = 'https://www.resultadismo.com/images/escudos/padrao.png';

      let linha = `
          <tr>
              <td>${index + 1}°</td>
              <td><img src="${escudo}" data-codigo="${nome}" alt="Escudo" width="30"></td>
              <td data-codigo="${nome}"></td>
              <td>${jogador.pontuacao}</td>
              <td>${jogador.cravadas}</td>
              <td>${jogador.saldos}</td>
              <td>${jogador.acertos}</td>
          </tr>
      `;
      tbody.append(linha);
  });
}

function ativarControleVisualizacaoCopa() {
  // Controle de navegação por fase
  $('#nav-tab .nav-link').off('click').on('click', function () {
      let targetTab = $(this).attr('data-target');
      $('.tab-pane').removeClass('show active');
      $(targetTab).addClass('show active');

      let fase = targetTab.replace('#nav-', '');
      construirClassificacaoCopa(window.copa.data, fase, window.dados.data);
  });
}
