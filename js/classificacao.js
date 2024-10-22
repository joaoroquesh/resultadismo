$(document).ready(function () {
    $(document).on('pontosPronto', function () {
        if (typeof window.pontos !== 'undefined' && window.pontos.data) {
            construirClassificacao(window.pontos.data);
            listarCampeonatos(window.pontos.data);
            listarMeses(window.pontos.data);
            ativarControleVisualizacao();
        } else {
            console.error("Os dados de pontos não foram carregados corretamente.");
        }
    });

});

function construirClassificacao(pontosData) {
    let classificacao = {};

    // Processar cada jogo para acumular a pontuação, cravadas, saldos e acertos dos jogadores
    pontosData.forEach(jogo => {
        for (let chave in jogo) {
            if (chave.includes('@') && jogo[chave] !== "" && !isNaN(jogo[chave])) {
                if (!classificacao[chave]) {
                    classificacao[chave] = {
                        pontuacao: 0,
                        cravadas: 0,
                        saldos: 0,
                        acertos: 0
                    };
                }

                const pontuacao = parseInt(jogo[chave]);

                // Atualizar pontuação total do jogador
                classificacao[chave].pontuacao += pontuacao;

                // Atualizar estatísticas específicas
                if (pontuacao === 3) {
                    classificacao[chave].cravadas += 1;
                } else if (pontuacao === 2) {
                    classificacao[chave].saldos += 1;
                } else if (pontuacao === 1) {
                    classificacao[chave].acertos += 1;
                }
            }
        }
    });

    // Converter o objeto de classificação em um array e ordenar pela pontuação, cravadas, saldos e acertos
    let classificacaoArray = Object.entries(classificacao).map(([email, stats]) => {
        return { email, ...stats };
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

    // Construir o HTML da tabela de classificação, excluindo jogadores com 0 pontos
    let tbody = $('tbody');
    tbody.empty(); // Limpar qualquer conteúdo existente

    classificacaoArray.forEach((jogador, index) => {
        if (jogador.pontuacao > 0) { // Excluir jogadores com 0 pontos
            let nome = jogador.email;
            let escudo = 'https://www.resultadismo.com/images/escudos/padrao.png';

            let linha = `
                <tr>
                    <td><img src="${escudo}" data-codigo="${nome}" alt="Escudo" width="30"></td>
                    <td>${index + 1}°</td>
                    <td data-codigo="${nome}"></td>
                    <td>${jogador.pontuacao}</td>
                    <td>${jogador.cravadas}</td>
                    <td>${jogador.saldos}</td>
                    <td>${jogador.acertos}</td>
                </tr>
            `;
            tbody.append(linha);
        }
    });

    // Chamar a função para atualizar os elementos com base nos dados disponíveis
    if (typeof window.dados !== 'undefined' && window.dados.data) { 
        atualizarElementosGlobais(window.dados);
    }
}

function listarCampeonatos(pontosData) {
    let campeonatos = new Set();

    // Processar cada jogo para coletar os campeonatos
    pontosData.forEach(jogo => {
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
            let pontosFiltrados = pontosData.filter(jogo => jogo.codigo.slice(0, 2) === codigoSelecionado);
            construirClassificacao(pontosFiltrados);
        } else {
            construirClassificacao(pontosData);
        }
    });
}

function listarMeses(pontosData) {
    let meses = new Set();

    // Processar cada jogo para coletar os meses
    pontosData.forEach(jogo => {
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

    // Listar os nomes dos meses encontrados no console
    console.log("Meses encontrados:", nomesMeses);

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
            let pontosFiltrados = pontosData.filter(jogo => jogo.data.split('/')[1] === codigoSelecionado);
            construirClassificacao(pontosFiltrados);
        } else {
            construirClassificacao(pontosData);
        }
    });

    // Aplicar filtro inicial para o mês mais recente
    if (nomesMeses.length > 0) {
        let mesInicial = nomesMeses[0].codigo;
        let pontosFiltrados = pontosData.filter(jogo => jogo.data.split('/')[1] === mesInicial);
        construirClassificacao(pontosFiltrados);
    }
}

function ativarControleVisualizacao() {
    // Controlar a visualização com base nas abas selecionadas
    $('#nav-tab button').on('click', function () {
        let abaSelecionada = $(this).attr('id');
        if (abaSelecionada === 'nav-mes-tab') {
            $('#filtroMes .nav-link.active').click();
        } else if (abaSelecionada === 'nav-campeonato-tab') {
            $('#filtroCampeonato .nav-link:first').click();
        } else if (abaSelecionada === 'nav-geral-tab') {
            // Mostrar classificação geral sem filtro
            construirClassificacao(window.pontos.data);
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
