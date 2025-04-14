function executarFuncoesPagina() {
  atualizarElementosGlobais(window.dados);
  gerarNavegacao(window.jogos.data);
  listarJogos(window.jogos.data);
  ativarControleVisualizacaoJogos();
  atualizarElementosGlobais(window.dados);
  selecionarDiaHoje(true);
  inicializarEventosInputs();

}

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
          <div class="tab-pane selecao fade text-right ${showClass}" id="nav-${mes}" role="tabpanel"
              aria-labelledby="nav-${mes}-tab">
              <ul class="nav nav-pills" id="filtroMes${mes}" role="tablist">
                  ${diasHTML}
              </ul>
          </div>
      `);
  });
}

function listarJogos(jogosData, diaSelecionado = null, mesSelecionado = null) {
  let accordionGames = $('#accordionGames');
  accordionGames.empty();

  const user = localStorage.getItem('logado');

  // 1. Ordenar os jogos pelo horário (jogo.hora convertido para Date)
  const jogosFiltrados = jogosData
    .filter(j => j.codigo && j.codigo !== '#N/A')
    .filter(j => {
      if (!diaSelecionado || !mesSelecionado) return true;
      const [dia, mes] = j.data.split('/');
      return dia === diaSelecionado && mes === mesSelecionado;
    })
    .sort((a, b) => new Date(a.hora) - new Date(b.hora));

  jogosFiltrados.forEach(jogo => {

    const codigo = jogo.codigo || '-';
    const data = jogo.data || '-';
    // const completo = jogo.completo || '-';
    const hora = formatarHora(jogo.hora) || '-';
    const andamento = jogo.andamento || '-';
    const mandante = jogo.mandante ? jogo.mandante.replace(/\s|\-|\|/g, '') : '-';
    const visitante = jogo.visitante ? jogo.visitante.replace(/\s|\-|\|/g, '') : '-';
    const campeonato = jogo.campeonato || '-';
    const resultado = jogo.resultado || '-';

    // Gols reais
    let mandanteGols = '-';
    let visitanteGols = '-';
    if (resultado !== '-' && resultado.includes('x')) {
      [mandanteGols, visitanteGols] = resultado.split('x').map(g => g.trim());
    }

    // Palpite do usuário logado
    const userPalpite = jogo[user] || '-';
    let userMandanteGols = '-';
    let userVisitanteGols = '-';
    if (userPalpite !== '-' && userPalpite.includes('x')) {
      [userMandanteGols, userVisitanteGols] = userPalpite.split('x').map(p => p.trim());
    }

    // Classe de pontuação do usuário
    let classePontuacao = '';
    if (resultado !== '-' && userPalpite !== '-' && resultado.includes('x') && userPalpite.includes('x')) {
      const [realMandante, realVisitante] = resultado.split('x').map(Number);
      const [palpiteMandante, palpiteVisitante] = userPalpite.split('x').map(Number);

      if (palpiteMandante === realMandante && palpiteVisitante === realVisitante) {
        classePontuacao = 'cravada';
      } else if ((palpiteMandante - palpiteVisitante) === (realMandante - realVisitante) &&
        (palpiteMandante > palpiteVisitante) === (realMandante > realVisitante)) {
        classePontuacao = 'saldo';
      } else if ((palpiteMandante > palpiteVisitante && realMandante > realVisitante) ||
        (palpiteMandante < palpiteVisitante && realMandante < realVisitante)) {
        if (realMandante !== realVisitante) {
          classePontuacao = 'acerto';
        }
      }
    }
    

    let cardHTML = `
      <div class="card game ${andamento} ${classePontuacao} p-0">
        <div class="card-game d-flex flex-column">
          <div class="card-game-label d-flex gap-2 center-s">
            <div class="card-game-label-hour">${hora}</div>
            <span>|</span>
            <div class="card-game-label-tournament">${campeonato}</div>
          </div>
          <div class="card-game-result">
            <div class="card-game-result-team team-home">
              <img src="" data-codigo="${mandante}" alt="" class="card-game-result-team-img team-home">
              <span class="card-game-result-team-name team-home" data-codigo="${mandante}"></span>
            </div>
            <form id="palpiteForm${codigo}" class="card-game-result-score code-inputs skeleton">
              <input type="hidden" class="user-loged" name="email" value="${user}" />
              <input type="hidden" class="codigo-jogo" name="codigo" value="${codigo}" />
              <input type="number" class="team-home d-inline code-input code-input-home" name="mandante" placeholder="-" value="${userMandanteGols}">
              <input type="number" class="team-away d-inline code-input code-input-away" name="visitante" placeholder="-" value="${userVisitanteGols}">
              <input type="hidden" class="palpite-final" name="palpite" value="" />
            </form>
            <div class="card-game-result-team team-away">
              <img src="" data-codigo="${visitante}" alt="" class="card-game-result-team-img team-away">
              <span class="card-game-result-team-name team-away" data-codigo="${visitante}"></span>
            </div>
          </div>
          <div class="card-game-real">
            <p class="text-center fs-sm m-0">Resultado real</p>
            <div class="card-game-real-score fw-700 center-s">
              <span class="team-home">${mandanteGols}</span>
              x
              <span class="team-away">${visitanteGols}</span>
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
          <div class="card-body scrollable">
            <table class="table table-borderless">
              <tbody>
                ${listarPalpites(jogo)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    accordionGames.append(cardHTML);
  });

  try {
    let totalPontosDia = 0;
    const user = localStorage.getItem('logado');

    jogosFiltrados.forEach(jogo => {
      if (diaSelecionado && mesSelecionado) {
        const [dia, mes] = jogo.data.split('/');
        if (dia !== diaSelecionado || mes !== mesSelecionado) return;
      }

      const resultado = jogo.resultado;
      const palpite = jogo[user];

      if (resultado && resultado.includes('x') && palpite && palpite.includes('x')) {
        const [gmr, gvr] = resultado.split('x').map(Number);
        const [gmp, gvp] = palpite.split('x').map(Number);

        if (gmp === gmr && gvp === gvr) {
          totalPontosDia += 3;
        } else if ((gmp - gvp) === (gmr - gvr) && (gmp > gvp) === (gmr > gvr)) {
          totalPontosDia += 2;
        } else if ((gmp > gvp && gmr > gvr) || (gmp < gvp && gmr < gvr)) {
          if (gmr !== gvr) totalPontosDia += 1;
        }
      }
    });

    const pontosDiaEl = $('#pontos-dia');
    if (pontosDiaEl.length) {
      const texto = totalPontosDia === 1 ? '1 ponto' : `${totalPontosDia} pontos`;
      pontosDiaEl
        .text(texto)
        .removeClass('btn-primary btn-outline-primary')
        .addClass(totalPontosDia > 0 ? 'btn-primary' : 'btn-outline-primary')
        .show();
    }
  } catch (e) {
    console.error('Erro ao calcular e exibir pontos do dia:', e);
  }


}

function formatarHora(horaISO) {
  if (!horaISO) return '-';

  const data = new Date(horaISO);
  const dataBrasilia = new Date(data.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));

  let horas = dataBrasilia.getHours();
  let minutos = dataBrasilia.getMinutes();

  return `${horas.toString().padStart(2, '0')}h${minutos.toString().padStart(2, '0')}`;
}

function ativarControleVisualizacaoJogos() {
  // Controle de navegação por mês
  $('#nav-tab .nav-link').off('click').on('click', function () {
    let targetTab = $(this).attr('data-target');
    $('.tab-pane').removeClass('show active');
    $(targetTab).addClass('show active');

    // Selecionar o dia mais próximo do dia de hoje
    let mesSelecionado = $(this).attr('id').split('-')[1];
    let hoje = new Date();
    let diaHoje = hoje.getDate().toString().padStart(2, '0');
    let mesAtual = (hoje.getMonth() + 1).toString().padStart(2, '0');
    let diasNoMes = $(targetTab).find('.nav-item button');
    let diaSelecionado = null;
    let menorDiferenca = Number.MAX_SAFE_INTEGER;

    diasNoMes.each(function () {
      let dia = parseInt($(this).text().split(' ')[1]);
      let dataJogo = new Date(hoje.getFullYear(), mesSelecionado - 1, dia);
      let diferenca = Math.abs(dataJogo.setHours(0, 0, 0, 0) - hoje.setHours(0, 0, 0, 0));

      if (diferenca < menorDiferenca) {
        menorDiferenca = diferenca;
        diaSelecionado = $(this);
      }
    });

    if (diaSelecionado) {
      diasNoMes.removeClass('active');
      diaSelecionado.addClass('active');
    }

    let diaSelecionadoTexto = diaSelecionado ? diaSelecionado.text().split(' ')[1] : null;

    // Atualiza a lista de jogos para o dia selecionado
    listarJogos(window.jogos.data, diaSelecionadoTexto, mesSelecionado);
    atualizarElementosGlobais(window.dados);
  });

  // Controle de navegação por dia dentro do mês selecionado
  $('.tab-pane .nav-item button').off('click').on('click', function () {
    let diaSelecionado = $(this).text().trim().split(' ')[1];
    let mesSelecionado = $(this).closest('.tab-pane').attr('id').split('-')[1];

    // Atualiza a lista de jogos para o dia selecionado
    listarJogos(window.jogos.data, diaSelecionado, mesSelecionado);
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
  const anoAtual = new Date().getFullYear();
  const dataPartida = new Date(`${anoAtual}-${mes}-${dia}T00:00:00`);
  const diasSemana = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sab.'];
  return diasSemana[dataPartida.getDay()];
}

function selecionarDiaHoje(isInitialLoad = false) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diaHoje = hoje.getDate().toString().padStart(2, '0');
  const mesHoje = (hoje.getMonth() + 1).toString().padStart(2, '0');

  // Selecionar o mês mais próximo
  let tabMes = $(`#nav-${mesHoje}-tab`);
  if (!tabMes.length) {
    const mesesDisponiveis = $('#nav-tab .nav-link');
    let mesMaisProximo = null;
    let diferencaMinima = Infinity;

    mesesDisponiveis.each(function () {
      const mes = $(this).attr('id').split('-')[1];
      const diferenca = Math.abs(parseInt(mes) - parseInt(mesHoje));
      if (diferenca < diferencaMinima) {
        diferencaMinima = diferenca;
        mesMaisProximo = $(this);
      }
    });

    tabMes = mesMaisProximo;
  }

  // Selecionar a tab do mês
  if (tabMes.length && isInitialLoad) {
    tabMes.click();
  } else {
    $('.tab-pane').removeClass('show active');
    $(`#nav-${mesHoje}`).addClass('show active');
  }

  // Selecionar o dia de hoje ou o mais próximo e centralizar na visualização
  setTimeout(() => {
    let tabDia = $(`#pills-${diaHoje}-${mesHoje}-tab`);
    const navPillsContainer = $(`#filtroMes${mesHoje}`); // Contêiner .nav-pills

    // Remover .active de todos os dias para evitar duplicação
    navPillsContainer.find('.nav-link').removeClass('active');

    // Caso o dia de hoje não esteja disponível, escolher o mais próximo
    if (!tabDia.length) {
      const diasDisponiveis = navPillsContainer.find('.nav-link');
      let diaMaisProximo = null;
      let diferencaMinima = Infinity;

      diasDisponiveis.each(function () {
        const dia = $(this).text().trim().split(' ')[1];

        // Priorizar o dia exato, se disponível
        if (parseInt(dia) === parseInt(diaHoje)) {
          diaMaisProximo = $(this);
          return false; // Sair do loop se encontrar o dia de hoje
        }

        const diferenca = Math.abs(parseInt(dia) - parseInt(diaHoje));
        if (diferenca < diferencaMinima) {
          diferencaMinima = diferenca;
          diaMaisProximo = $(this);
        }
      });

      tabDia = diaMaisProximo;
    }

    // Centralizar o dia selecionado no contêiner .nav-pills
    if (tabDia && tabDia.length) {
      tabDia.addClass('active'); // Marca o dia como ativo
      const offsetLeft = tabDia.position().left;
      const containerWidth = navPillsContainer.width();
      const tabDiaWidth = tabDia.outerWidth();
      const scrollPosition = offsetLeft - (containerWidth / 2) + (tabDiaWidth / 2);

      navPillsContainer.animate({ scrollLeft: scrollPosition }, 300);
    }
  }, 100);
}

function listarPalpites(jogo) {
  let palpites = [];
  let resultadoReal = jogo.resultado;
  let andamento = jogo.andamento;
  let logado = localStorage.getItem('logado');

  let nomesMap = Object.fromEntries(window.dados.data.map(({ codigo, nome }) => [codigo, nome]));

  let [diaJogo, mesJogo] = jogo.data.split('/').map(Number);
  let anoAtual = new Date().getFullYear();

  // Extrair a hora e minutos diretamente da string do JSON (ISO format)
  let horaPartida = new Date(jogo.hora);
  let hora = horaPartida.getUTCHours();
  let minuto = horaPartida.getUTCMinutes();

  // Criar um objeto Date para o horário do jogo no fuso de Brasília
  let horarioJogo = new Date(anoAtual, mesJogo - 1, diaJogo, hora, minuto).getTime();
  let horaAtual = Date.now(); // Obtendo timestamp correto do momento atual

  for (let chave in jogo) {
    if (chave.includes('@') && jogo[chave] !== "") {
      let palpiteJogador = jogo[chave];
      let classePontuacao = '';
      let pontos = 0;

      let golsMandantePalpite = 0;
      let golsVisitantePalpite = 0;

      if (resultadoReal && palpiteJogador && resultadoReal !== '-') {
        const [golsMandanteReal, golsVisitanteReal] = resultadoReal.split('x').map(Number);
        const [golsMandantePalpite, golsVisitantePalpite] = palpiteJogador.split('x').map(Number);

        if (golsMandantePalpite === golsMandanteReal && golsVisitantePalpite === golsVisitanteReal) {
          classePontuacao = 'cravada';
          pontos = 3;
        } else if ((golsMandantePalpite - golsVisitantePalpite) === (golsMandanteReal - golsVisitanteReal) && (golsMandantePalpite > golsVisitantePalpite) === (golsMandanteReal > golsVisitanteReal)) {
          classePontuacao = 'saldo';
          pontos = 2;
        } else if ((golsMandantePalpite > golsVisitantePalpite && golsMandanteReal > golsVisitanteReal) || (golsMandantePalpite < golsVisitantePalpite && golsMandanteReal < golsVisitanteReal)) {
          if (golsMandanteReal !== golsVisitanteReal) {
            classePontuacao = 'acerto';
            pontos = 1;
          }
        }
      }

      palpites.push({
        chave,
        // nome,
        palpite: jogo[chave],
        classePontuacao,
        pontos,
        golsMandantePalpite,
        golsVisitantePalpite
      });
    }
  }

  // Parse the goals from palpite string
  palpites.forEach(p => {
    // Parse the goals from palpite string
    const [mandante, visitante] = p.palpite.split('x').map(Number);
    p.golsMandantePalpite = mandante;
    p.golsVisitantePalpite = visitante;
  });

  palpites.sort((a, b) => {
    // First criterion: points
    if (b.pontos !== a.pontos) {
      return b.pontos - a.pontos;
    }

    // Second criterion: goal difference order (mandante win → draw → visitante win)
    const saldoA = a.golsMandantePalpite - a.golsVisitantePalpite;
    const saldoB = b.golsMandantePalpite - b.golsVisitantePalpite;
    if (saldoA !== saldoB) {
      return saldoB - saldoA; // Descending order: mandante win (+) → draw (0) → visitante win (-)
    }

    // Third criterion: more goals (mandante first, then visitante)
    if (a.golsMandantePalpite !== b.golsMandantePalpite) {
      return b.golsMandantePalpite - a.golsMandantePalpite;
    }
    if (a.golsVisitantePalpite !== b.golsVisitantePalpite) {
      return a.golsVisitantePalpite - b.golsVisitantePalpite;
    }

    // Fourth criterion: alphabetical order of keys
    return a.chave.localeCompare(b.chave);
  });
  // console.log(palpites);

  let palpitesHTML = palpites.map(({ chave, palpite, classePontuacao }) => {
    let classeLogado = logado === chave ? 'logado' : '';
    return `
      <tr class="${classeLogado}">
        <td><img src="https://www.resultadismo.com/images/escudos/padrao.png" data-codigo="${chave}" alt="Escudo" width="32"></td>
        <td data-codigo="${chave}"></td>
        <td><span class="${classePontuacao}">${palpite}</span></td>
      </tr>
    `;
  }).join('');

  return palpitesHTML;
}

function atualizarElementosGlobais(dados) {
  // Verificar se os dados e a chave 'data' estão definidos
  if (!dados || !Array.isArray(dados.data)) {
    console.error("Os dados fornecidos são inválidos ou estão indefinidos.");
    return;
  }

  // Iterar sobre todos os elementos que tenham o atributo data-codigo
  $('[data-codigo]').each(function () {
    const codigo = $(this).data('codigo');
    const elemento = $(this);

    // Percorrer todos os itens disponíveis nos dados
    dados.data.forEach(item => {
      // Comparar o código do elemento com o código no item
      if (item.codigo === codigo) {
        if (elemento.is('img')) {
          // Se for uma tag img, definir o atributo src como a URL da imagem
          elemento.attr('src', item.imagem);
        } else {
          // Se não for uma tag img, definir o texto do elemento como o nome
          elemento.text(item.nome);
        }
      }
    });
  });
}

/* ============================================================
   Actualiza apenas o que mudou nos cards já existentes
   ============================================================ */
function atualizarJogosIncremental(novosDados) {
  const logado = localStorage.getItem('logado');

  novosDados.forEach(jogo => {
    if (!jogo.codigo || jogo.codigo === '#N/A') return;

    const $card = $(`#heading${jogo.codigo}`).closest('.card.game');

    /* 2.1 – se o card ainda não existe (jogo novo no dia) ---------- */
    if (!$card.length) {
      // ➜ opcional: se quiser acrescentar cards novos no dia aberto:
      // listarJogos([jogo], diaActual, mesActual);  // append
      return;
    }

    /* 2.2 – actualiza hora, resultado real e estado ---------------- */
    $card.find('.card-game-label-hour').text(formatarHora(jogo.hora));

    const [gm = '-', gv = '-'] = (jogo.resultado || '-').split('x').map(t => t.trim());
    $card.find('.card-game-real-score .team-home').text(gm);
    $card.find('.card-game-real-score .team-away').text(gv);

    $card.removeClass('Finalizado EmAndamento Previsto')
      .addClass(jogo.andamento || '');

    /* 2.3 – palpite do utilizador logado --------------------------- */
    if (logado) {
      const palpite = jogo[logado] || '-';
      const [pm = '-', pv = '-'] = palpite.includes('x') ? palpite.split('x') : ['', ''];
      const $form = $(`#palpiteForm${jogo.codigo}`);
      if ($form.length) {
        $form.find('.code-input-home').val(pm);
        $form.find('.code-input-away').val(pv);
      }
    }

    /* 2.4 – tabela de palpites da galera --------------------------- */
    $card.find('tbody').html(listarPalpites(jogo));

    /* 2.5 – classe de pontuação do logado (cravada/saldo/acerto) --- */
    $card.removeClass('cravada saldo acerto')
      .addClass(calcClassePontuacao(jogo, logado)); // usa a mesma lógica
  });

  /* 2.6 – recalcula os pontos do dia que está aberto -------------- */
  const mesSel = $('#nav-tab .nav-link.active').attr('id').split('-')[1];
  const diaSel = $('.tab-pane.show.active .nav-link.active').text().split(' ')[1];
  calcularMostrarPontosDia(novosDados, diaSel, mesSel);
}


/* ============================================================
   Atualiza o JSON de jogos em memória + localStorage
   ============================================================ */
function atualizarPalpiteLocal({ email, codigo, palpite }) {
  if (!window.jogos || !Array.isArray(window.jogos.data)) return;

  const jogo = window.jogos.data.find(j => j.codigo === codigo);
  if (jogo) {
    jogo[email] = palpite;                       // grava no objeto em memória
    localStorage.setItem('jogos', JSON.stringify(window.jogos)); // persiste
  }
}

/* ============================================================
   0)  Guard contra navegação enquanto há envio pendente
   ============================================================ */
function addUnloadGuard() {
  if (!window.__palpiteGuard) {
    window.__palpiteGuard = e => {
      /* Chrome/Edge exigem returnValue != undefined para exibir o alerta */
      e.preventDefault();
      e.returnValue = '';          // mensagem padrão do navegador
    };
    window.addEventListener('beforeunload', window.__palpiteGuard);
  }
}
function removeUnloadGuard() {
  if (window.__palpiteGuard) {
    window.removeEventListener('beforeunload', window.__palpiteGuard);
    delete window.__palpiteGuard;
  }
}


/* ============================================================
   Contador global de operações pendentes (timers + fetch)
   ============================================================ */
function incPending() {
  window.__palpitePendentes = (window.__palpitePendentes || 0) + 1;

  /* primeiro item pendente → liga o bloqueio e a classe */
  if (window.__palpitePendentes === 1) {
    addUnloadGuard();                               // ativa beforeunload
    document.body.classList.add('salvando-palpite'); // mostra “loading”
  }
}

function decPending() {
  if (window.__palpitePendentes > 0) {
    window.__palpitePendentes--;

    /* último item acabou → libera a navegação e remove a classe */
    if (window.__palpitePendentes === 0) {
      removeUnloadGuard();                          // desativa beforeunload
      document.body.classList.remove('salvando-palpite');
    }
  }
}


/* ============================================================
   1)  Liga todos os listeners (delegação -> serve para cards
       já existentes e para os que forem criados depois)
   ============================================================ */
function inicializarEventosInputs() {
  document.addEventListener('input', tratarDigitacao, { capture: true });
  document.addEventListener('keydown', tratarKeyDown, { capture: true });
  document.addEventListener('focusout', tratarFocusOut, true);
}

/* ============================================================
   2)  UX: 1 dígito por input, avanço de foco automático
   ============================================================ */
function tratarDigitacao(e) {
  const inp = e.target;
  if (!inp.classList.contains('code-input')) return;

  inp.value = inp.value.replace(/[^0-9]/g, '').slice(0, 1);       // 1 dígito

  const formInputs = inp.closest('form').querySelectorAll('.code-input');
  const idx = [...formInputs].indexOf(inp);
  if (inp.value && idx < formInputs.length - 1) formInputs[idx + 1].focus();
}

function tratarKeyDown(e) {
  const inp = e.target;
  if (!inp.classList.contains('code-input')) return;

  if (/^[0-9]$/.test(e.key) && inp.value.length === 1) {
    e.preventDefault();
    inp.value = e.key;
    const nxt = inp.nextElementSibling;
    if (nxt && nxt.classList.contains('code-input')) nxt.focus();
  }
  if (e.key === '-') e.preventDefault();
}

/* ============================================================
   3)  Quando o usuário sai do grupo de inputs
       – agenda envio em 3 s
       – adiciona / remove classes de estado (.salvando, .salvo, .erro)
   ============================================================ */
function tratarFocusOut(e) {
  const form = e.target.closest('form.code-inputs');
  if (!form) return;

  setTimeout(() => {
    if (form.contains(document.activeElement)) return;   // ainda há foco interno

    const mand = form.mandante;
    const vist = form.visitante;
    const palp = form.palpite;

    /* completa vazios com 0 */
    [mand, vist].forEach(inp => { if (inp.value === '') inp.value = '0'; });
    palp.value = `${mand.value}x${vist.value}`;

    /* se já existe timer pendente, reinicia  */
    if (form.dataset.timerId) {
      clearTimeout(+form.dataset.timerId);
      delete form.dataset.timerId;
      decPending();
    }

    /* só agenda se ambos preenchidos */
    if (mand.value !== '' && vist.value !== '') {
      const card = form.closest('.card-game');
      card.classList.remove('erro', 'salvo');   // limpa estados anteriores
      card.classList.add('salvando');

      /* liga o guard */
      incPending();

      /* agenda envio em 1,5 s */
      const id = setTimeout(() => {
        enviarPalpite(form, card);
        delete form.dataset.timerId;
        card.classList.add('enviando');
      }, 1500);

      form.dataset.timerId = id;               // guarda para poder cancelar
    }
  }, 200);  // espera a transição de foco terminar
}

/* ============================================================
   4)  Envio propriamente dito
   ============================================================ */
async function enviarPalpite(form, card) {
  const payload = JSON.stringify({
    email: form.email.value,
    codigo: form.codigo.value,
    mandante: form.mandante.value,
    visitante: form.visitante.value,
    palpite: form.palpite.value
  });

  try {
    const res = await fetch(
      'https://script.google.com/macros/s/AKfycbwu1MXJ5HCOQQWwAXMU9xAwCszJ3WPUJRlo2SaIAGerBJLrkWmyqYJ9KZoGF1Tk7Xbrkg/exec',
      { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: payload }
    );
    const json = await res.json();             // espera {ok:true}

    card.classList.remove('salvando');
    card.classList.remove('enviando');


    if (json.ok) {
      card.classList.add('salvo');
      const id = setTimeout(() => {
        card.classList.remove('salvo');
      }, 2000);

      /* 👉 grava no JSON/Storage */
      atualizarPalpiteLocal({
        email: form.email.value,
        codigo: form.codigo.value,
        palpite: form.palpite.value
      });
      console.log('Palpite gravado', payload);
    } else {
      card.classList.add('erro');
      console.warn('Servidor respondeu erro', json);
    }
  } catch (err) {
    card.classList.remove('salvando');
    card.classList.remove('enviando');
    card.classList.add('erro');
    console.error('Falha ao enviar palpite', err);
  } finally {
    /* desliga o guard – já temos resposta */
    decPending();
  }
}

/* roda uma única vez depois que o DOM estiver pronto */
document.addEventListener('keydown', e => {
  /* só queremos tratar <Enter> dentro dos inputs dos palpites */
  if (e.key !== 'Enter') return;

  const el = e.target;
  if (!el.matches('form.code-inputs input')) return;

  e.preventDefault();                       // evita enviar o <form> ou quebrar linha

  /* pega a lista linear de todos os inputs “vivos” de todos os forms */
  const inputs = Array.from(
    document.querySelectorAll('form.code-inputs input:not([disabled]):not([readonly])')
  ).filter(i => i.offsetParent !== null);   // exclui elementos ocultos

  const idx = inputs.indexOf(el);

  if (idx > -1 && idx < inputs.length - 1) {
    /* 👉 existe um próximo campo – foca nele */
    inputs[idx + 1].focus();
  } else {
    /* 👉 era o último – simplesmente tira o foco para acionar tratarFocusOut */
    el.blur();
  }
});
