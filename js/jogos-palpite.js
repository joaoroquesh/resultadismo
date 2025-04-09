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
  accordionGames.empty(); // Limpar conteúdo existente

  jogosData.forEach(jogo => {
    if (jogo.codigo && jogo.codigo !== '#N/A') { // Adicionar verificação para ignorar códigos inválidos
      if (diaSelecionado && mesSelecionado) {
        let [dia, mes] = jogo.data.split('/');
        if (dia !== diaSelecionado || mes !== mesSelecionado) {
          return;
        }
      }
      let user = localStorage.getItem('logado');
      let codigo = jogo.codigo || '-';
      let data = jogo.data || '-';
      let completo = jogo.completo || '-';
      let hora = formatarHora(jogo.hora) || '-';
      let andamento = jogo.andamento || '-';
      let mandante = jogo.mandante ? jogo.mandante.replace(/\s|\-|\|/g, '') : '-';
      let visitante = jogo.visitante ? jogo.visitante.replace(/\s|\-|\|/g, '') : '-';
      let campeonato = jogo.campeonato || '-';
      let resultado = jogo.resultado || '-';

      let mandanteGols = resultado !== '-' && resultado.includes('x') ? resultado.split('x')[0].trim() : '-';
      let visitanteGols = resultado !== '-' && resultado.includes('x') ? resultado.split('x')[1].trim() : '-';

      let cardHTML = `
              <div class="card game ${andamento} p-0">
                  <div class="card-game d-flex flex-column">
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
                          <div class="card-game-result-team team-home">
                              <img src="" data-codigo="${mandante}" alt=""
                                  class="card-game-result-team-img team-home">
                              <span class="card-game-result-team-name team-home" data-codigo="${mandante}"></span>
                          </div>
                          <form id="palpiteForm${codigo}" class="card-game-result-score code-inputs">
                              <input type="hidden" class="user-loged" name="email" value="${user}" />
                              <input type="hidden" class="codigo-jogo" name="codigo" value="${codigo}" />
                              <input type="number" class="team-home d-inline code-input code-input-home" name="mandante" placeholder="-" value="${mandanteGols}">
                              <input type="number" class="team-away d-inlline code-input code-input-away" name="visitante" placeholder="-" value="${visitanteGols}">
                              <input type="hidden" class="palpite-final" name="palpite" value="" />
                          </form>
                          <div class="card-game-result-team team-away">
                              <img src="" data-codigo="${visitante}" alt=""
                                  class="card-game-result-team-img team-away">
                              <span class="card-game-result-team-name team-away" data-codigo="${visitante}"></span>
                          </div>
                      </div>
                      <div class="card-game-real ">
                      <p class="text-center fs-sm m-0">
                        Resultado real
                      </p>
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
    }
  });
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

function inicializarEventosInputs() {
  // Para cada formulário que contenha a classe .code-inputs (cada grupo de palpites)
  document.querySelectorAll("form.code-inputs").forEach(form => {
    // Seleciona somente os inputs de palpite (os que o usuário preenche) deste formulário
    const formInputs = form.querySelectorAll(".code-input");

    // Para cada input dentro deste formulário – configura comportamento individual
    formInputs.forEach((input, index) => {
      // Impede que o scroll (wheel) altere o valor do input
      input.addEventListener("wheel", function (e) {
        e.preventDefault();
      });

      // Evento "input": Limita o valor a 1 dígito e, se concluído, passa o foco para o próximo input do mesmo form
      input.addEventListener("input", function () {
        let valueStr = String(input.value);

        // Remove qualquer ocorrência de "-" (sinal negativo)
        if (valueStr.includes("-")) {
          valueStr = valueStr.replace(/-/g, "");
          input.value = valueStr;
        }

        // Se o usuário inserir mais de um caractere (por exemplo, ao colar), mantém apenas o primeiro
        if (valueStr.length > 1) {
          input.value = valueStr.slice(0, 1);
          console.log(`Input ${index} corrigido para: ${input.value}`);
        }

        // Se este input já possui 1 dígito e não for o último do grupo, avança o foco para o próximo input deste formulário
        if (input.value.length === 1 && index < formInputs.length - 1) {
          formInputs[index + 1].focus();
          console.log(`Focando input ${index + 1}`);
        }
      });

      // Evento "keydown": Se já houver 1 dígito e o usuário digitar outro número, sobrescreve o valor
      input.addEventListener("keydown", function (e) {
        const allowedKeys = ["Backspace", "Delete", "Tab", "ArrowLeft", "ArrowRight", "Home", "End"];
        if (allowedKeys.includes(e.key)) return;

        // Impede a digitação do sinal negativo
        if (e.key === "-") {
          e.preventDefault();
          return;
        }

        // Se já houver 1 dígito e o usuário digitar um número, sobrescreve o valor
        if (input.value.length === 1 && /[0-9]/.test(e.key)) {
          e.preventDefault();
          input.value = e.key;
          console.log(`Sobrescrevendo input ${index} com ${e.key}`);
          // Avança o foco se houver próximo input no mesmo formulário
          if (index < formInputs.length - 1) {
            formInputs[index + 1].focus();
            console.log(`Focando input ${index + 1} após sobrescrever`);
          }
        }
      });
    });

    // Evento "focusout" no formulário: Dispara quando o foco sai de TODOS os inputs do form
    form.addEventListener("focusout", function () {
      // Aguarda um tempo para que a transição de foco ocorra
      setTimeout(() => {
        // Se nenhum elemento dentro do form estiver com foco...
        if (!form.contains(document.activeElement)) {
          // Preenche com "0" os inputs vazios deste formulário
          formInputs.forEach((inp, idx) => {
            if (inp.value.trim() === "") {
              inp.value = "0";
              console.log(`Input ${idx} do form preenchido com 0 (focusout).`);
            }
          });

          // Atualiza o input oculto "palpite" com o valor dos inputs de palpite no formato "mandante x visitante"
          const mandanteInput = form.querySelector('[name="mandante"]');
          const visitanteInput = form.querySelector('[name="visitante"]');
          const palpiteInput = form.querySelector('[name="palpite"]');
          if (mandanteInput && visitanteInput && palpiteInput) {
            palpiteInput.value = `${mandanteInput.value}x${visitanteInput.value}`;
            console.log("Palpite atualizado:", palpiteInput.value);
          }

          // Apenas envia se os dois inputs principais estiverem preenchidos (mesmo que com "0")
          if (mandanteInput && visitanteInput && mandanteInput.value.trim() !== "" && visitanteInput.value.trim() !== "") {
            // Evita envios repetidos usando um flag armazenado no dataset do form
            if (!form.dataset.submitted) {
              form.dataset.submitted = "true";
              console.log("Ambos os inputs preenchidos. Iniciando envio automático...");

              // Monta o objeto de dados com base nos campos do formulário
              const data = {
                email: form.querySelector('[name="email"]') ? form.querySelector('[name="email"]').value : "",
                codigo: form.querySelector('[name="codigo"]') ? form.querySelector('[name="codigo"]').value : "",
                mandante: mandanteInput.value,
                visitante: visitanteInput.value,
                palpite: palpiteInput.value
              };

              // Envia os dados via fetch. Como o Apps Script espera JSON (e faz JSON.parse), usamos JSON.stringify.
              // Para contornar o problema de CORS, usamos mode: 'no-cors' (note que a resposta será opaca).
              fetch('https://script.google.com/macros/s/AKfycbzu4ex8hBj8VovzH40-Q067Xa2Kngx1MJZxG0gRWc5YNcpi6HZOZ9qk2uJ5mJw77VUOcA/exec', {
                method: 'POST',
                // mode: 'no-cors',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
              })
              .then(response => response.json())
              .then(() => {
                alert('Palpite enviado com sucesso!');
                // form.reset();
                // Reseta o flag para permitir futuros envios, se necessário
                form.dataset.submitted = "";
              })
              .catch(error => {
                console.error('Erro ao enviar:', error);
                alert('Erro ao enviar o palpite.');
              });
            }
          }
        }
      }, 200); // Delay de 200ms para aguardar a transição de foco
    });
  });
}



