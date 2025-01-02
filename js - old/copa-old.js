$(document).ready(function () {
  $(document).on('jogosPronto', function () {
      if (typeof window.jogos !== 'undefined' && window.jogos.data) {
          calcularDatasFases(window.dados.data);
          preencherClassificacoes(window.dados.data);
          atualizarFiltrosDatas();
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
              calcularDatasFases(window.dados.data);
              preencherClassificacoes(window.dados.data);
              atualizarFiltrosDatas();
          }
          $('body').removeClass('loading');
          console.log("Todos os dados foram atualizados.");
      }
  });
});

let datasFases = {};

function calcularDatasFases(dadosData) {
  let jogadorComData = dadosData.find(item => item.codigo === 'CP');
  if (jogadorComData && jogadorComData.copa) {
      let dataInicioOitavas = new Date(jogadorComData.copa.split('/').reverse().join('-'));
      let dataFimOitavas = new Date(dataInicioOitavas);
      dataFimOitavas.setDate(dataFimOitavas.getDate() + 6);

      let dataInicioQuartas = new Date(dataFimOitavas);
      dataInicioQuartas.setDate(dataInicioQuartas.getDate() + 1);
      let dataFimQuartas = new Date(dataInicioQuartas);
      dataFimQuartas.setDate(dataFimQuartas.getDate() + 6);

      let dataInicioSemi = new Date(dataFimQuartas);
      dataInicioSemi.setDate(dataInicioSemi.getDate() + 1);
      let dataFimSemi = new Date(dataInicioSemi);
      dataFimSemi.setDate(dataFimSemi.getDate() + 6);

      let dataInicioFinal = new Date(dataFimSemi);
      dataInicioFinal.setDate(dataInicioFinal.getDate() + 1);
      let dataFimFinal = new Date(dataInicioFinal);
      dataFimFinal.setDate(dataFimFinal.getDate() + 6);

      datasFases = {
          oitavas: { inicio: dataInicioOitavas, fim: dataFimOitavas },
          quartas: { inicio: dataInicioQuartas, fim: dataFimQuartas },
          semi: { inicio: dataInicioSemi, fim: dataFimSemi },
          final: { inicio: dataInicioFinal, fim: dataFimFinal }
      };
  }
}

function preencherClassificacoes(dadosData) {
  let classificacao = {};

  // Preencher as classificações dos jogos com os jogadores que têm o respectivo valor na chave "copa"
  for (let i = 1; i <= 8; i++) {
      let jogadores = dadosData.filter(jogador => jogador.copa == i);
      if (jogadores.length === 2) {
          classificacao[i] = jogadores.map(jogador => {
              let pontos = calcularPontosJogosNoPeriodo(jogador, datasFases.oitavas.inicio, datasFases.oitavas.fim);
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

  // Avançar jogadores para as fases seguintes se necessário
  let dataHoje = new Date();
  if (datasFases.oitavas.fim && dataHoje > datasFases.oitavas.fim) {
      // Quartas de final (jogos 9 a 12)
      if (dataHoje > datasFases.oitavas.fim && dataHoje <= datasFases.quartas.fim) {
          for (let i = 9; i <= 12; i++) {
              let jogoAnterior1 = classificacao[i - 8];
              let jogoAnterior2 = classificacao[i - 7];
              if (jogoAnterior1 && jogoAnterior2) {
                  let vencedores = [jogoAnterior1[0], jogoAnterior2[0]];
                  classificacao[i] = vencedores;

                  let tbody = $(`#jogo${i} tbody`);
                  tbody.empty();

                  vencedores.forEach((jogador, index) => {
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

      // Semifinais (jogos 13 e 14)
      if (dataHoje > datasFases.quartas.fim && dataHoje <= datasFases.semi.fim) {
          for (let i = 13; i <= 14; i++) {
              let jogoAnterior1 = classificacao[i - 4];
              let jogoAnterior2 = classificacao[i - 3];
              if (jogoAnterior1 && jogoAnterior2) {
                  let vencedores = [jogoAnterior1[0], jogoAnterior2[0]];
                  classificacao[i] = vencedores;

                  let tbody = $(`#jogo${i} tbody`);
                  tbody.empty();

                  vencedores.forEach((jogador, index) => {
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

      // Final (jogo 15)
      if (dataHoje > datasFases.semi.fim) {
          let jogoAnterior13 = classificacao[13];
          let jogoAnterior14 = classificacao[14];
          if (jogoAnterior13 && jogoAnterior14) {
              let vencedores = [jogoAnterior13[0], jogoAnterior14[0]];
              classificacao[15] = vencedores;

              let tbody = $(`#jogo15 tbody`);
              tbody.empty();

              vencedores.forEach((jogador, index) => {
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
}

function calcularPontosJogosNoPeriodo(jogador, dataInicial, dataFinal) {
  // Inicializar os pontos do jogador
  let pontos = {
      pontuacao: 0,
      cravadas: 0,
      saldos: 0,
      acertos: 0
  };

  // Filtrar os jogos que estão dentro do período especificado
  let jogosNoPeriodo = filtrarJogosPorPeriodo(dataInicial, dataFinal);

  // Calcular os pontos com base nos jogos filtrados
  jogosNoPeriodo.forEach(jogo => {
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

function filtrarJogosPorPeriodo(dataInicial, dataFinal) {
  if (typeof window.jogos !== 'undefined' && window.jogos.data) {
      return window.jogos.data.filter(jogo => {
          if (jogo.data) {
              let dataJogo = new Date(jogo.data.split('/').reverse().join('-'));
              return dataJogo >= dataInicial && dataJogo <= dataFinal;
          }
          return false;
      });
  }
  return [];
}

function atualizarFiltrosDatas() {
  if (datasFases.oitavas) {
      let dataTextoOitavas = `${datasFases.oitavas.inicio.getDate().toString().padStart(2, '0')}/${(datasFases.oitavas.inicio.getMonth() + 1).toString().padStart(2, '0')} a ${datasFases.oitavas.fim.getDate().toString().padStart(2, '0')}/${(datasFases.oitavas.fim.getMonth() + 1).toString().padStart(2, '0')}`;
      $('#pills-oitavas-tab').text(dataTextoOitavas);
  }

  if (datasFases.quartas) {
      let dataTextoquartas = `${datasFases.quartas.inicio.getDate().toString().padStart(2, '0')}/${(datasFases.quartas.inicio.getMonth() + 1).toString().padStart(2, '0')} a ${datasFases.quartas.fim.getDate().toString().padStart(2, '0')}/${(datasFases.quartas.fim.getMonth() + 1).toString().padStart(2, '0')}`;
      $('#pills-quartas-tab').text(dataTextoquartas);
  }

  if (datasFases.semi) {
      let dataTextosemi = `${datasFases.semi.inicio.getDate().toString().padStart(2, '0')}/${(datasFases.semi.inicio.getMonth() + 1).toString().padStart(2, '0')} a ${datasFases.semi.fim.getDate().toString().padStart(2, '0')}/${(datasFases.semi.fim.getMonth() + 1).toString().padStart(2, '0')}`;
      $('#pills-semi-tab').text(dataTextosemi);
  }

  if (datasFases.final) {
      let dataTextofinal = `${datasFases.final.inicio.getDate().toString().padStart(2, '0')}/${(datasFases.final.inicio.getMonth() + 1).toString().padStart(2, '0')} a ${datasFases.final.fim.getDate().toString().padStart(2, '0')}/${(datasFases.final.fim.getMonth() + 1).toString().padStart(2, '0')}`;
      $('#pills-final-tab').text(dataTextofinal);
  }
}