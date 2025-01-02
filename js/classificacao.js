
function executarFuncoesPagina() {
    listarMesAtual();
    construirClassificacaoPorDivisaoFiltradaPorMes(window.jogos.data, window.dados.data, 'A');
    ativarControleVisualizacao();
    atualizarElementosGlobais(window.dados);
}

function listarMesAtual() {
    let dataAtual = new Date();
    let mesAtual = (dataAtual.getMonth() + 1).toString().padStart(2, '0');
    let mesNome = getNomeMes(mesAtual);

    // Atualizar o HTML das tabs com o mês atual
    $('#pills-mesAtualA-tab').text(mesNome);
    $('#pills-mesAtualB-tab').text(mesNome);
    $('#pills-mesAtualC-tab').text(mesNome);
}

function construirClassificacaoPorDivisaoFiltradaPorMes(jogosData, dadosData, divisaoSelecionada = null) {
    let dataAtual = new Date();
    let mesAtual = (dataAtual.getMonth() + 1).toString().padStart(2, '0');

    let classificacao = {
        A: {},
        B: {},
        C: {}
    };

    // Inicializar todos os jogadores na classificação, mesmo com pontuação zero
    dadosData.forEach(jogador => {
        if (jogador.divisao && classificacao[jogador.divisao]) {
            classificacao[jogador.divisao][jogador.codigo] = {
                pontuacao: 0,
                cravadas: 0,
                saldos: 0,
                acertos: 0,
                jogos: 0,
                palpitesComPontos: 0
            };
        }
    });

    // Processar cada jogo para acumular a pontuação, cravadas, saldos e acertos dos jogadores por divisão e mês atual
    jogosData.forEach(jogo => {
        if (jogo.data.split('/')[1] === mesAtual) {
            let resultadoReal = jogo.resultado;
            for (let chave in jogo) {
                if (chave.includes('@') && jogo[chave] !== "") {
                    let palpiteJogador = jogo[chave];
                    let jogador = dadosData.find(j => j.codigo === chave);
                    if (jogador && jogador.divisao && classificacao[jogador.divisao]) {
                        if (!classificacao[jogador.divisao][chave]) {
                            classificacao[jogador.divisao][chave] = {
                                pontuacao: 0,
                                cravadas: 0,
                                saldos: 0,
                                acertos: 0,
                                jogos: 0,
                                palpitesComPontos: 0
                            };
                        }

                        classificacao[jogador.divisao][chave].jogos += 1;

                        const [golsMandanteReal, golsVisitanteReal] = resultadoReal.split('x').map(Number);
                        const [golsMandantePalpite, golsVisitantePalpite] = palpiteJogador.split('x').map(Number);

                        let pontuacao = 0;

                        if (golsMandantePalpite === golsMandanteReal && golsVisitantePalpite === golsVisitanteReal) {
                            pontuacao = 3;
                            classificacao[jogador.divisao][chave].cravadas += 1;
                        } else if ((golsMandantePalpite - golsVisitantePalpite) === (golsMandanteReal - golsVisitanteReal) && (golsMandantePalpite > golsVisitantePalpite) === (golsMandanteReal > golsVisitanteReal)) {
                            pontuacao = 2;
                            classificacao[jogador.divisao][chave].saldos += 1;
                        } else if (
                            (golsMandantePalpite > golsVisitantePalpite && golsMandanteReal > golsVisitanteReal) ||
                            (golsMandantePalpite < golsVisitantePalpite && golsMandanteReal < golsVisitanteReal)
                        ) {
                            if (golsMandanteReal !== golsVisitanteReal) { // Não é um empate
                                pontuacao = 1;
                                classificacao[jogador.divisao][chave].acertos += 1;
                            }
                        }

                        if (pontuacao > 0) {
                            classificacao[jogador.divisao][chave].palpitesComPontos += 1;
                        }

                        // Atualizar pontuação total do jogador
                        classificacao[jogador.divisao][chave].pontuacao += pontuacao;
                    }
                }
            }
        }
    });


    // Construir a tabela de classificação para cada divisão
    if (divisaoSelecionada) {
        let classificacaoArray = Object.entries(classificacao[divisaoSelecionada]).map(([codigo, stats]) => {
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

        // Construir o HTML da tabela de classificação para a divisão
        let tbody = $(`tbody`);
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

        // Atualizar os elementos com base nos dados disponíveis
        atualizarElementosGlobais(dadosData);
    }
}


function ativarControleVisualizacao() {
    // Controle de navegação por divisão
    $('#nav-tab .nav-link').off('click').on('click', function () {
        let targetTab = $(this).attr('data-target');
        $('.tab-pane').removeClass('show active');
        $(targetTab).addClass('show active');

        let divisao = targetTab.replace('#nav-', '');
        construirClassificacaoPorDivisaoFiltradaPorMes(window.jogos.data, window.dados.data, divisao);
        atualizarElementosGlobais(window.dados);
    });
}

function getNomeMes(mes) {
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
