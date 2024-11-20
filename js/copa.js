$(document).ready(function () {
  $(document).on('jogosPronto', function () {
      if (typeof window.jogos !== 'undefined' && window.jogos.data) {
          preencherClassificacoes(window.dados.data);
          atualizarFiltrosDatas(window.dados.data);
      } else {
          console.error("Os dados dos jogos não foram carregados corretamente.");
      }
  });

  // Contador de JSONs carregados
  let carregados = 0;

  $(document).on('dadosAtualizado pontosAtualizado jogosAtualizado', function () {
      carregados++;
      if (carregados === 3) {
          if (typeof window.dados !== 'undefined' && window.dados.data) {
              preencherClassificacoes(window.dados.data);
              atualizarFiltrosDatas(window.dados.data);
          }
          $('body').removeClass('loading');
          console.log("Todos os dados foram atualizados.");
      }
  });
});

function preencherClassificacoes(dadosData) {
  // Obter a data inicial e final do período da copa a partir dos dados
  let jogadorComData = dadosData.find(item => item.codigo === 'CP');
  let dataInicio, dataFim;
  if (jogadorComData && jogadorComData.copa) {
      dataInicio = new Date(jogadorComData.copa);
      dataFim = new Date(dataInicio);
      dataFim.setDate(dataInicio.getDate() + 6);
  }

  let classificacao = {};

  // Preencher as classificações dos jogos com os jogadores que têm o respectivo valor na chave "copa"
  for (let i = 1; i <= 8; i++) {
      let jogadores = dadosData.filter(jogador => jogador.copa == i);
      if (jogadores.length === 2) {
          classificacao[i] = jogadores.map(jogador => {
              let pontos = calcularPontosDia(jogador, dataInicio);
              return {
                  nome: jogador.codigo,
                  pontos: pontos.pontuacao,
                  cravadas: pontos.cravadas,
                  saldos: pontos.saldos,
                  acertos: pontos.acertos
              };
          });

          // Ordenar jogadores por pontuação e critérios de desempate
          classificacao[i].sort((a, b) => {
              if (b.pontos !== a.pontos) {
                  return b.pontos - a.pontos;
              } else if (b.cravadas !== a.cravadas) {
                  return b.cravadas - a.cravadas;
              } else if (b.saldos !== a.saldos) {
                  return b.saldos - a.saldos;
              } else if (b.acertos !== a.acertos) {
                  return b.acertos - a.acertos;
              } else {
                  return 0;
              }
          });

          let tbody = $(`#jogo${i} tbody`);
          tbody.empty(); // Limpar qualquer conteúdo existente

          classificacao[i].forEach((jogador, index) => {
              let escudo = 'https://www.resultadismo.com/images/escudos/padrao.png';
              let linha = `
                  <tr>
                      <td>${index + 1}°</td>
                      <td><img src="${escudo}" data-codigo="${jogador.nome}" alt="Escudo" width="30"></td>
                      <td data-codigo="${jogador.nome}">${jogador.nome}</td>
                      <td>${jogador.pontos}</td>
                      <td>${jogador.cravadas}</td>
                      <td>${jogador.saldos}</td>
                      <td>${jogador.acertos}</td>
                  </tr>
              `;
              tbody.append(linha);
          });
      }
  }
}

function calcularPontosDia(jogador, dataInicio) {
  // Inicializar os pontos do jogador
  let pontos = {
      pontuacao: 0,
      cravadas: 0,
      saldos: 0,
      acertos: 0
  };

  // Filtrar os jogos que estão apenas na data especificada
  let jogosNoDia = filtrarJogosPorDia(dataInicio);

  // Calcular os pontos com base nos jogos filtrados
  jogosNoDia.forEach(jogo => {
      if (jogador.codigo && jogo[jogador.codigo]) {
          let palpiteJogador = jogo[jogador.codigo];
          if (palpiteJogador && jogo.resultado) {
              const [golsMandanteReal, golsVisitanteReal] = jogo.resultado.split('x').map(Number);
              const [golsMandantePalpite, golsVisitantePalpite] = palpiteJogador.split('x').map(Number);

              if (golsMandantePalpite === golsMandanteReal && golsVisitantePalpite === golsVisitanteReal) {
                  pontos.pontuacao += 3;
                  pontos.cravadas += 1;
              } else if ((golsMandantePalpite - golsVisitantePalpite) === (golsMandanteReal - golsVisitanteReal)) {
                  pontos.pontuacao += 2;
                  pontos.saldos += 1;
              } else if (
                  (golsMandantePalpite > golsVisitantePalpite && golsMandanteReal > golsVisitanteReal) ||
                  (golsMandantePalpite < golsVisitantePalpite && golsMandanteReal < golsVisitanteReal)
              ) {
                  pontos.pontuacao += 1;
                  pontos.acertos += 1;
              }
          }
      }
  });

  return pontos;
}

function filtrarJogosPorDia(dataInicio) {
  if (typeof window.jogos !== 'undefined' && window.jogos.data) {
      return window.jogos.data.filter(jogo => {
          if (jogo.data) {
              let dataJogo = new Date(jogo.data.split('/').reverse().join('-'));
              return dataJogo.toDateString() === dataInicio.toDateString();
          }
          return false;
      });
  }
  return [];
}

function atualizarFiltrosDatas(dadosData) {
  // Atualizar os valores de #pills-oitavas-tab para a data referente ao filtro da pontuação
  let jogadorComData = dadosData.find(item => item.codigo === 'CP');
  if (jogadorComData && jogadorComData.copa) {
      let dataInicial = new Date(jogadorComData.copa);
      let dataFinal = new Date(dataInicial);
      dataFinal.setDate(dataInicial.getDate() + 6);
      let dataTexto = `${dataInicial.getDate().toString().padStart(2, '0')}/${(dataInicial.getMonth() + 1).toString().padStart(2, '0')} a ${dataFinal.getDate().toString().padStart(2, '0')}/${(dataFinal.getMonth() + 1).toString().padStart(2, '0')}`;
      $('#pills-oitavas-tab').text(dataTexto);
  }
}
