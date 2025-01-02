$(document).ready(function () {
    $(document).on('jogosPronto', function () {
        if (typeof window.jogos !== 'undefined' && window.jogos.data) {
            construirClassificacao(window.jogos.data);
            listarCampeonatos(window.jogos.data);
            ativarControleVisualizacao();
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
                listarCampeonatos(window.jogos.data);
                construirClassificacao(window.jogos.data);
                ativarControleVisualizacao();
                atualizarElementosGlobais(window.dados);
            }
            $('body').removeClass('loading');
            console.log("Todos os dados foram atualizados.");
        }
    });

    
});

function executarFuncoesPagina() {
    atualizarElementosGlobais(window.dados);
    listarCampeonatos(window.jogos.data);
    construirClassificacao(window.jogos.data);
    ativarControleVisualizacao();
    
    // Definir aba de visualização inicial como 'nav-geral-tab'
    $('#nav-geral-tab').click();
    $('#nav-geral-tab').trigger('click');
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

    // Apresentar apenas os 4 primeiros em ordem alfabética pelo nome
    let top4Array = classificacaoArray.slice(0, 4).sort((a, b) => a.codigo.localeCompare(b.codigo));

    // Construir o HTML da tabela de classificação com apenas os 4 primeiros
    let tbody = $('tbody');
    tbody.empty(); // Limpar qualquer conteúdo existente

    top4Array.forEach((jogador, index) => {
        let nome = jogador.codigo;
        let escudo = 'https://www.resultadismo.com/images/escudos/padrao.png';

        let linha = `
            <tr>
                <td>&nbsp;</td>
                <td><img src="${escudo}" data-codigo="${nome}" alt="Escudo" width="30"></td>
                <td data-codigo="${nome}"></td>
            </tr>
        `;
        tbody.append(linha);
    });

    if (typeof window.dados !== 'undefined' && window.dados.data) {
        atualizarElementosGlobais(window.dados);
    }
}

function construirClassificacaofinal(jogosData) {
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
                <!-- <td>${jogador.aproveitamento}%</td>
                <td>${jogador.acertividade}%</td> -->
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
            let codigoCampeonato = jogo.codigo.slice(0, 2);
            campeonatos.add(codigoCampeonato);
        }
    });

    // Obter os nomes dos campeonatos do JSON de dados
    let nomesCampeonatos = [];
    campeonatos.forEach(codigo => {
        let nomeCampeonato = obterNomeCampeonato(codigo);
        if (nomeCampeonato) {
            let divisao = obterDivisaoCampeonato(codigo);
            nomesCampeonatos.push({ codigo, nome: nomeCampeonato, divisao });
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
                <button class="nav-link ${index === 0 ? 'active' : ''} ${campeonato.divisao === 'liberado' ? 'liberado' : ''}" 
                        id="pills-${campeonato.codigo}-tab" 
                        data-toggle="pill" 
                        type="button" 
                        role="tab" 
                        aria-selected="${index === 0}">
                    ${campeonato.nome}
                </button>
            </li>
        `;
        filtroCampeonato.append(li);
    });

    // Adicionar evento de filtro para a classificação
    filtroCampeonato.on('click', '.nav-link', function () {
        let campeonatoSelecionado = $(this).text();
        let codigoSelecionado = $(this).attr('id').split('-')[1];
        let campeonatoDivisao = window.dados.data.find(c => c.nome === campeonatoSelecionado && c.divisao === "liberado");

        if (codigoSelecionado) {
            let jogosFiltrados = jogosData.filter(jogo => jogo.codigo.slice(0, 2) === codigoSelecionado);
            if (campeonatoDivisao) {
                construirClassificacaofinal(jogosFiltrados);
                $('.p-1').attr('id', 'classificacao');
            } else {
                construirClassificacao(jogosFiltrados);
                $('.p-1').removeAttr('id');
            }
        } else {
            construirClassificacao(jogosData);
        }
    });
}

function obterDivisaoCampeonato(codigo) {
    if (typeof window.dados !== 'undefined' && window.dados.data) {
        let campeonato = window.dados.data.find(item => item.codigo === codigo);
        return campeonato ? campeonato.divisao : null;
    }
    return null;
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

function ativarControleVisualizacao() {
    // Controlar a visualização com base nas abas selecionadas
    $('#nav-tab button').on('click', function () {
        let abaSelecionada = $(this).attr('id');
        if (abaSelecionada === 'nav-mes-tab') {
            $('#filtroMes .nav-link.active').click();
        } else if (abaSelecionada === 'nav-campeonato-tab') {
            $('#filtroCampeonato .nav-link').removeClass('active');
            $('#filtroCampeonato .nav-link:first').addClass('active').click();
        } else if (abaSelecionada === 'nav-geral-tab') {
            // Mostrar classificação geral sem filtro
            construirClassificacao(window.jogos.data);
            $('.p-1').removeAttr('id');
        }
    });

    // Filtrar classificação com base no campeonato clicado
    $('#filtroCampeonato').on('click', '.nav-link', function () {
        const campeonatoSelecionado = $(this).text();
        const codigoSelecionado = $(this).attr('id').split('-')[1];

        // Filtrar os jogos do campeonato selecionado
        let jogosFiltrados = window.jogos.data.filter(jogo => jogo.codigo.slice(0, 2) === codigoSelecionado);

        // Verificar se o campeonato é liberado ou fechado
        if ($(this).hasClass('liberado')) {
            construirClassificacaofinal(jogosFiltrados);
            $('.p-1').attr('id', 'classificacao');
        } else {
            construirClassificacao(jogosFiltrados);
            $('.p-1').removeAttr('id');
        }
    });

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