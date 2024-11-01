$(document).ready(function () {
  $(document).on('jogosPronto', function () {
    if (typeof window.jogos !== 'undefined' && window.jogos.data) {
      gerarNavegacao(window.jogos.data);
      listarJogos(window.jogos.data);
      ativarControleVisualizacaoJogos();
      atualizarElementosGlobais(window.dados);
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
        atualizarElementosGlobais(window.dados);
      }
      if (typeof window.pontos !== 'undefined' && window.pontos.data) {

      }
      if (typeof window.jogos !== 'undefined' && window.jogos.data) {
        gerarNavegacao(window.jogos.data);
        listarJogos(window.jogos.data);
        ativarControleVisualizacaoJogos();
        atualizarElementosGlobais(window.dados);
      }
      $('body').removeClass('loading');
      console.log("Todos os dados foram atualizados.");
    }
  });
});

function gerarNavegacao(jogosData) {
  let mesesDisponiveis = new Set();
  let diasPorMes = {};

  jogosData.forEach(jogo => {
    if (jogo.data && jogo.codigo && jogo.codigo !== "#N/A") {
      let [dia, mes] = jogo.data.split('/');

      mesesDisponiveis.add(mes);
      if (!diasPorMes[mes]) {
        diasPorMes[mes] = new Set();
      }
      diasPorMes[mes].add(dia);
    }
  });

  // Ordenar os meses em ordem decrescente e pegar os três últimos meses disponíveis
  let mesesOrdenados = Array.from(mesesDisponiveis).sort((a, b) => b - a).slice(0, 3);

  let navTab = $('#nav-tab');
  let navTabContent = $('#nav-tabContent');
  navTab.empty();
  navTabContent.empty();

  // Gerar as tabs para cada mês
  mesesOrdenados.forEach((mes, index) => {
    let mesNome = getNomeMes(mes);
    let activeClass = index === 0 ? 'active' : '';
    let showClass = index === 0 ? 'show active' : '';

    // Tab do mês
    navTab.append(`
          <button class="nav-link skeleton ${activeClass}" id="nav-${mes}-tab" data-toggle="tab" data-target="#nav-${mes}"
              type="button" role="tab" aria-controls="nav-${mes}" aria-selected="${index === 0}">${mesNome}</button>
      `);

    // Conteúdo do mês
    let dias = Array.from(diasPorMes[mes]).sort((a, b) => b - a);
    let diasHTML = dias.map((dia, diaIndex) => {
      let diaSemana = getDiaSemana(jogosData, dia, mes);
      let diaActiveClass = diaIndex === 0 ? 'active' : '';
      return `
              <li class="nav-item" role="presentation">
                  <button class="nav-link skeleton ${diaActiveClass}" id="pills-${dia}-${mes}-tab" data-toggle="pill" type="button"
                      role="tab" aria-selected="${diaIndex === 0}">${diaSemana} ${dia}</button>
              </li>
          `;
    }).join('');

    navTabContent.append(`
          <div class="tab-pane selecao fade text-right pt-3 ${showClass}" id="nav-${mes}" role="tabpanel"
              aria-labelledby="nav-${mes}-tab">
              <ul class="nav nav-pills pr-5" id="filtroMes${mes}" role="tablist">
                  ${diasHTML}
              </ul>
          </div>
      `);
  });
}

function listarJogos(jogosData) {
  let accordionGames = $('#accordionGames');
  accordionGames.empty(); // Limpar conteúdo existente

  jogosData.forEach(jogo => {
    if (jogo.codigo && jogo.codigo !== '#N/A') { // Adicionar verificação para ignorar códigos inválidos
      let codigo = jogo.codigo || '-';
      let data = jogo.data || '-';
      let completo = jogo.completo || '-';
      let hora = formatarHora(jogo.hora) || '-';
      let mandante = jogo.mandante ? jogo.mandante.replace(/\s|\-|\|/g, '') : '-';
      let visitante = jogo.visitante ? jogo.visitante.replace(/\s|\-|\|/g, '') : '-';
      let campeonato = jogo.campeonato || '-';
      let resultado = jogo.resultados || '-';

      let mandanteGols = resultado !== '-' && resultado.includes('x') ? resultado.split('x')[0].trim() : '-';
      let visitanteGols = resultado !== '-' && resultado.includes('x') ? resultado.split('x')[1].trim() : '-';

      let cardHTML = `
              <div class="card game p-0">
                  <div class="card-game d-flex flex-column gap-3">
                      <div class="card-game-label d-flex gap-2 center-s">
                          <div class="card-game-label-hour">
                              ${hora}
                          </div>
                          <span>|</span>
                          <div class="card-game-label-tournament">
                              ${campeonato}
                          </div>
                      </div>
                      <div class="card-game-result">
                          <div class="card-game-result-team team-home center-s">
                              <img src="" data-codigo="${mandante}" alt=""
                                  class="card-game-result-team-img team-home">
                              <span class="card-game-result-team-name team-home" data-codigo="${mandante}"></span>
                          </div>
                          <div class="card-game-result-score">
                              <span class="team-home">${mandanteGols}</span>
                              <span class="team-away">${visitanteGols}</span>
                          </div>
                          <div class="card-game-result-team team-away center-s">
                              <img src="" data-codigo="${visitante}" alt=""
                                  class="card-game-result-team-img team-away">
                              <span class="card-game-result-team-name team-away" data-codigo="${visitante}"></span>
                          </div>
                      </div>
                  </div>
                  <div class="card-header" id="heading${codigo}">
                      <button class="btn text-center fs-sm collapsed" type="button" data-toggle="collapse"
                          data-target="#collapse${codigo}" aria-expanded="true" aria-controls="collapse${codigo}">
                          Palpites da galera
                      </button>
                  </div>
                  <div id="collapse${codigo}" class="collapse" aria-labelledby="heading${codigo}" data-parent="#accordionGames">
                      <div class="card-body">
                          <table class="table">
                              <tbody>
                                  ${listarPalpites(jogo)}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          `;

      accordionGames.append(cardHTML);
    }
  });
}

function formatarHora(horaISO) {
  if (!horaISO) return '-';

  const data = new Date(horaISO);

  // Ajuste para garantir que a hora seja mostrada corretamente no fuso horário local
  let horas = data.getHours();
  let minutos = data.getMinutes();

  // Formatar em "16h00"
  return `${horas.toString().padStart(2, '0')}h${minutos.toString().padStart(2, '0')}`;
}


function ativarControleVisualizacaoJogos() {
  // Controle de navegação por mês
  $('#nav-tab .nav-link').off('click').on('click', function () {
    let targetTab = $(this).attr('data-target');
    $('.tab-pane').removeClass('show active');
    $(targetTab).addClass('show active');

    // Atualizar a lista de jogos de acordo com o mês selecionado
    let mesSelecionado = $(this).attr('id').split('-')[1];
    let jogosFiltradosPorMes = window.jogos.data.filter(jogo => {
      return jogo.data.split('/')[1] === mesSelecionado;
    });

    // Atualiza a lista de jogos para o mês
    listarJogos(jogosFiltradosPorMes);
    atualizarElementosGlobais(window.dados);
  });

  // Controle de navegação por dia dentro do mês selecionado
  $('.tab-pane .nav-item button').off('click').on('click', function () {
    let diaSelecionado = $(this).text().trim().split(' ')[1];
    let mesSelecionado = $(this).closest('.tab-pane').attr('id').split('-')[1];

    let jogosFiltradosPorDia = window.jogos.data.filter(jogo => {
      let diaJogo = jogo.data.split('/')[0];
      let mesJogo = jogo.data.split('/')[1];
      return diaJogo === diaSelecionado && mesJogo === mesSelecionado;
    });

    // Atualiza a lista de jogos para o dia selecionado
    listarJogos(jogosFiltradosPorDia);
    atualizarElementosGlobais(window.dados);
  });
}

function getNomeMes(mes) {
  const nomesMeses = {
    '01': 'Janeiro',
    '02': 'Fevereiro',
    '03': 'Março',
    '04': 'Abril',
    '05': 'Maio',
    '06': 'Junho',
    '07': 'Julho',
    '08': 'Agosto',
    '09': 'Setembro',
    '10': 'Outubro',
    '11': 'Novembro',
    '12': 'Dezembro'
  };
  return nomesMeses[mes];
}

function getDiaSemana(jogosData, dia, mes) {
  const jogo = jogosData.find(j => j.data === `${dia}/${mes}`);
  if (!jogo) return '';

  const dataPartida = new Date(jogo.hora);
  const diasSemana = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sab.'];
  return diasSemana[dataPartida.getDay()];
}

function listarPalpites(jogo) {
  let palpitesHTML = '';

  for (let chave in jogo) {
      if (chave.includes('@') && jogo[chave] !== "") {
          palpitesHTML += `
              <tr>
                  <td><img src="https://www.resultadismo.com/images/escudos/padrao.png" data-codigo="${chave}" alt="Escudo" width="32"></td>
                  <td data-codigo="${chave}"></td>
                  <td>
                      <span class="">
                          ${jogo[chave]}
                      </span>
                  </td>
              </tr>
          `;
      }
  }

  return palpitesHTML;
}
