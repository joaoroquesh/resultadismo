

function executarFuncoesPagina() {
    atualizarElementosGlobais(window.dados);
    listarCampeonatos(window.jogos.data);
    listarMeses(window.jogos.data);
    listarDias(window.jogos.data); // This populates day filters and sets the correct one active
    ativarControleVisualizacao(); // This sets up tab click handlers
    
    // Programmatically click the 'Day' tab.
    // This will trigger the handler in ativarControleVisualizacao,
    // which in turn should click the active day button in #filtroDia,
    // finally calling construirClassificacao with the correct day's data.
    $('#nav-dia-tab').click();
}

function construirClassificacao(jogosData) {
    let classificacao = {};

    // Processar cada jogo para acumular a pontuação, cravadas, saldos e acertos dos jogadores
    jogosData.forEach(jogo => {
        let resultadoReal = jogo.resultado;
        if (resultadoReal && resultadoReal !== '-') {
            for (let chave in jogo) {
                if (chave.includes('@') && jogo[chave] !== "") {
                    let palpiteJogador = jogo[chave];
                    if (!classificacao[chave]) {
                        classificacao[chave] = {
                            pontuacao: 0,
                            cravadas: 0,
                            saldos: 0,
                            acertos: 0,
                            jogos: 0,
                            palpitesComPontos: 0
                        };
                    }

                    classificacao[chave].jogos += 1;

                    const [golsMandanteReal, golsVisitanteReal] = resultadoReal.split('x').map(Number);
                    const [golsMandantePalpite, golsVisitantePalpite] = palpiteJogador.split('x').map(Number);

                    let pontuacao = 0;

                    if (golsMandantePalpite === golsMandanteReal && golsVisitantePalpite === golsVisitanteReal) {
                        pontuacao = 3;
                        classificacao[chave].cravadas += 1;
                    } else if ((golsMandantePalpite - golsVisitantePalpite) === (golsMandanteReal - golsVisitanteReal) && (golsMandantePalpite > golsVisitantePalpite) === (golsMandanteReal > golsVisitanteReal)) {
                        pontuacao = 2;
                        classificacao[chave].saldos += 1;
                    } else if (
                        (golsMandantePalpite > golsVisitantePalpite && golsMandanteReal > golsVisitanteReal) ||
                        (golsMandantePalpite < golsVisitantePalpite && golsMandanteReal < golsVisitanteReal)
                    ) {
                        if (golsMandanteReal !== golsVisitanteReal) { // Não é um empate
                            pontuacao = 1;
                            classificacao[chave].acertos += 1;
                        }
                    }

                    if (pontuacao > 0) {
                        classificacao[chave].palpitesComPontos += 1;
                    }

                    // Atualizar pontuação total do jogador
                    classificacao[chave].pontuacao += pontuacao;
                }
            }
        }
    });

    // Converter o objeto de classificação em um array e calcular aproveitamento e acertividade
    let classificacaoArray = Object.entries(classificacao).map(([codigo, stats]) => {
        let aproveitamento = stats.jogos > 0 ? ((stats.pontuacao / (stats.jogos * 3)) * 100).toFixed(2) : 0;
        let acertividade = stats.palpitesComPontos > 0 ? ((stats.palpitesComPontos / stats.jogos) * 100).toFixed(2) : 0;
        return { codigo, ...stats, aproveitamento: parseFloat(aproveitamento), acertividade: parseFloat(acertividade) };
    });

    // Ordenar a classificação com base na pontuação e critérios de desempate
    classificacaoArray.sort((a, b) => {
        if (b.pontuacao !== a.pontuacao) {
            return b.pontuacao - a.pontuacao;
        } else if (b.cravadas !== a.cravadas) {
            return b.cravadas - a.cravadas;
        } else if (b.saldos !== a.saldos) {
            return b.saldos - a.saldos;
        } else if (b.acertos !== a.acertos) {
            return b.acertos - a.acertos;
        } else if (b.aproveitamento !== a.aproveitamento) {
            return b.aproveitamento - a.aproveitamento;
        } else if (b.acertividade !== a.acertividade) {
            return b.acertividade - a.acertividade;
        } else {
            return b.jogos - a.jogos;
        }
    });

    // Construir o HTML da tabela de classificação
    let tbody = $('tbody');
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
                <td>${jogador.aproveitamento}%</td>
                <td>${jogador.acertividade}%</td>
            </tr>
        `;
        tbody.append(linha);
    });

    if (typeof window.dados !== 'undefined' && window.dados.data) { 
        atualizarElementosGlobais(window.dados);
    }
}

function listarCampeonatos(jogosData) {
    let campeonatos = new Set();

    // Processar cada jogo para coletar os campeonatos
    jogosData.forEach(jogo => {
        if (jogo.codigo) {
            // Extrair o código do campeonato (as duas letras iniciais)
            let codigoCampeonato = jogo.codigo.slice(0, 2);
            campeonatos.add(codigoCampeonato);
        }
    });

    // Obter os nomes dos campeonatos do JSON de dados
    let nomesCampeonatos = [];
    campeonatos.forEach(codigo => {
        let nomeCampeonato = obterNomeCampeonato(codigo);
        if (nomeCampeonato) {
            nomesCampeonatos.push({ codigo, nome: nomeCampeonato });
        }
    });

    // Ordenar os nomes dos campeonatos em ordem alfabética
    nomesCampeonatos.sort((a, b) => a.nome.localeCompare(b.nome));

    // Construir o filtro de seleção de campeonatos como botões
    let filtroCampeonato = $('#filtroCampeonato');
    filtroCampeonato.empty();
    nomesCampeonatos.forEach((campeonato, index) => {
        let li = `
            <li class="nav-item" role="presentation">
                <button class="nav-link ${index === 0 ? 'active' : ''}" id="pills-${campeonato.codigo}-tab" data-toggle="pill" type="button" role="tab" aria-selected="${index === 0}">${campeonato.nome}</button>
            </li>
        `;
        filtroCampeonato.append(li);
    });

    // Adicionar evento de filtro para a classificação
    filtroCampeonato.on('click', '.nav-link', function () {
        let campeonatoSelecionado = $(this).text();
        let codigoSelecionado = $(this).attr('id').split('-')[1];
        if (codigoSelecionado) {
            let jogosFiltrados = jogosData.filter(jogo => jogo.codigo.slice(0, 2) === codigoSelecionado);
            construirClassificacao(jogosFiltrados);
        } else {
            construirClassificacao(jogosData);
        }
    });
}

function listarMeses(jogosData) {
    let meses = new Set();

    // Processar cada jogo para coletar os meses
    jogosData.forEach(jogo => {
        if (jogo.data) {
            // Extrair o mês (os dois últimos dígitos da data)
            let mes = jogo.data.split('/')[1];
            if (mes) {
                meses.add(mes);
            }
        }
    });

    // Obter os nomes dos meses e ordenar em ordem decrescente
    let nomesMeses = Array.from(meses).sort((a, b) => b - a).map(mes => {
        return { codigo: mes, nome: obterNomeMes(mes) };
    });

    // Construir o filtro de seleção de meses como botões
    let filtroMes = $('#filtroMes');
    filtroMes.empty();
    nomesMeses.forEach((mes, index) => {
        let li = `
            <li class="nav-item" role="presentation">
                <button class="nav-link ${index === 0 ? 'active' : ''}" id="pills-${mes.codigo}-tab" data-toggle="pill" type="button" role="tab" aria-selected="${index === 0}">${mes.nome}</button>
            </li>
        `;
        filtroMes.append(li);
    });

    // Adicionar evento de filtro para a classificação
    filtroMes.on('click', '.nav-link', function () {
        let mesSelecionado = $(this).text();
        let codigoSelecionado = $(this).attr('id').split('-')[1];
        if (codigoSelecionado) {
            let jogosFiltrados = jogosData.filter(jogo => jogo.data.split('/')[1] === codigoSelecionado);
            construirClassificacao(jogosFiltrados);
        } else {
            construirClassificacao(jogosData);
        }
    });

    // Aplicar filtro inicial para o mês mais recente
    if (nomesMeses.length > 0) {
        let mesInicial = nomesMeses[0].codigo;
        let jogosFiltrados = jogosData.filter(jogo => jogo.data.split('/')[1] === mesInicial);
        construirClassificacao(jogosFiltrados);
    }
}

function listarDias(jogosData) {
    let hoje = new Date();
    // Ajustar para meia-noite para evitar problemas de comparação de tempo
    hoje.setHours(0, 0, 0, 0);

    let dias = new Set();

    // Processar cada jogo para coletar as datas válidas
    jogosData.forEach(jogo => {
        if (jogo.data) {
            let [dia, mes, ano] = jogo.data.split('/');
            // JavaScript Date usa mês 0-indexado, então mes - 1
            let dataJogo = new Date(ano, mes - 1, dia);
            dataJogo.setHours(0,0,0,0); // Normalizar para comparação

            if (dataJogo <= hoje) {
                dias.add(jogo.data); // Adicionar no formato DD/MM/YYYY para ordenação
            }
        }
    });

    // Converter Set para Array e ordenar em ordem decrescente (mais recente primeiro)
    let datasOrdenadas = Array.from(dias).sort((a, b) => {
        let [diaA, mesA, anoA] = a.split('/');
        let [diaB, mesB, anoB] = b.split('/');
        let dataObjA = new Date(anoA, mesA - 1, diaA);
        let dataObjB = new Date(anoB, mesB - 1, diaB);
        return dataObjB - dataObjA; // Decrescente
    });

    // Construir o filtro de seleção de dias como botões
    let filtroDia = $('#filtroDia');
    filtroDia.empty(); // Limpar botões existentes

    if (datasOrdenadas.length === 0) {
        // Opcional: Adicionar uma mensagem se não houver dias para mostrar
        // filtroDia.append('<li class="nav-item"><span class="nav-link text-muted">Nenhum dia anterior ou atual com jogos.</span></li>');
        // Ou simplesmente deixar vazio como está
    } else {
        datasOrdenadas.forEach((dataCompleta, index) => {
            let diaMesDisplay = dataCompleta.slice(0, 5); // Formato DD/MM para exibição
            let li = `
                <li class="nav-item" role="presentation">
                    <button class="nav-link ${index === 0 ? 'active' : ''}" id="pills-dia-${diaMesDisplay.replace('/', '')}-tab" data-date-full="${dataCompleta}" data-toggle="pill" type="button" role="tab" aria-selected="${index === 0}">${diaMesDisplay}</button>
                </li>
            `;
            filtroDia.append(li);
        });
    }


    // Adicionar evento de filtro para a classificação
    // Certifique-se de que o event handler não está sendo duplicado se esta função for chamada múltiplas vezes.
    // Idealmente, o handler é anexado uma vez. Se #filtroDia é estático e só os LIs mudam,
    // usar delegação de evento no elemento pai (#filtroDia) é mais robusto.
    // Ex: $('#filtroDia').off('click', '.nav-link').on('click', '.nav-link', function() { ... });
    // Por enquanto, mantendo a estrutura original assumindo que #filtroDia é recriado ou o handler é gerenciado adequadamente.

    $('#filtroDia').off('click', '.nav-link').on('click', '.nav-link', function () {
        let diaMesSelecionado = $(this).text(); // Formato DD/MM para filtro
        if (diaMesSelecionado) {
            // window.jogos.data contém todas as datas, incluindo futuras se existirem no JSON.
            // O filtro aqui deve ser consistente com o que foi mostrado.
            // Os botões já são apenas de datas passadas/presentes.
            // A lógica de filtro original `jogo.data.startsWith(diaMesSelecionado)` é correta.
            let jogosFiltrados = window.jogos.data.filter(jogo => {
                if (!jogo.data) return false;
                // Verificar se a data do jogo (DD/MM) corresponde ao botão clicado
                // E também que a data do jogo não é futura (já filtrado na criação dos botões, mas uma dupla checagem não faz mal)
                let [dia, mes, ano] = jogo.data.split('/');
                let dataJogo = new Date(ano, mes - 1, dia);
                dataJogo.setHours(0,0,0,0);
                return jogo.data.startsWith(diaMesSelecionado) && dataJogo <= hoje;
            });
            construirClassificacao(jogosFiltrados);
        } else {
            construirClassificacao(window.jogos.data); // Fallback improvável
        }
    });
}

function ativarControleVisualizacao() {
    // Controlar a visualização com base nas abas selecionadas
    $('#nav-tab button').on('click', function () {
        let abaSelecionada = $(this).attr('id');
        if (abaSelecionada === 'nav-mes-tab') {
            $('#filtroMes .nav-link.active').click();
        } else if (abaSelecionada === 'nav-campeonato-tab') {
            $('#filtroCampeonato .nav-link:first').click();
        } else if (abaSelecionada === 'nav-dia-tab') { // Adicionado para filtro por dia
            $('#filtroDia .nav-link.active').click();
        } else if (abaSelecionada === 'nav-geral-tab') {
            // Mostrar classificação geral sem filtro
            construirClassificacao(window.jogos.data);
        }
    });
}

function obterNomeCampeonato(codigo) {
    // Procurar o nome do campeonato no JSON de dados (window.dados)
    if (typeof window.dados !== 'undefined' && window.dados.data) {
        for (let item of window.dados.data) {
            if (item.codigo === codigo) {
                return item.nome;
            }
        }
    }
    return null;
}

function obterNomeMes(mes) {
    const meses = {
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
    return meses[mes] || '';
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