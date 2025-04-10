$(document).ready(function () {
    $(document).on('jogosPronto', function () {
        if (typeof window.jogos !== 'undefined' && window.jogos.data) {
            construirClassificacao(window.jogos.data);
            listarCampeonatos(window.jogos.data);
            listarMeses(window.jogos.data);
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
                atualizarElementosGlobais(window.dados);
            }
            if (typeof window.jogos !== 'undefined' && window.jogos.data) {
                listarMeses(window.jogos.data);
                listarCampeonatos(window.jogos.data);
                construirClassificacao(window.jogos.data);
                ativarControleVisualizacao();
                atualizarElementosGlobais(window.dados);
            }
            $('body').removeClass('loading');
            console.log("Todos os dados foram atualizados.");
        }
    });

    // Definir aba de visualização inicial como 'nav-geral-tab'
    $('#nav-geral-tab').click();
    $('#nav-geral-tab').trigger('click');
});


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