$(document).ready(function () {
    $(document).on('pontosPronto', function () {
        if (typeof window.pontos !== 'undefined' && window.pontos.data) {
            listarMesAtual();
            construirClassificacaoPorDivisaoFiltradaPorMes(window.pontos.data, window.dados.data, 'A');
            ativarControleVisualizacao();
            atualizarElementosGlobais(window.dados);
        } else {
            console.error("Os dados de pontos não foram carregados corretamente.");
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
                listarMesAtual();
                construirClassificacaoPorDivisaoFiltradaPorMes(window.pontos.data, window.dados.data, 'A');
                ativarControleVisualizacao();
                atualizarElementosGlobais(window.dados);
            }
            if (typeof window.jogos !== 'undefined' && window.jogos.data) {
            }
            $('body').removeClass('loading');
            console.log("Todos os dados foram atualizados.");
        }
    });
});

function listarMesAtual() {
    let dataAtual = new Date();
    let mesAtual = (dataAtual.getMonth() + 1).toString().padStart(2, '0');
    let mesNome = getNomeMes(mesAtual);

    // Atualizar o HTML das tabs com o mês atual
    $('#pills-mesAtualA-tab').text(mesNome);
    $('#pills-mesAtualB-tab').text(mesNome);
    $('#pills-mesAtualC-tab').text(mesNome);
}

function construirClassificacaoPorDivisaoFiltradaPorMes(pontosData, dadosData, divisaoSelecionada = null) {
    let dataAtual = new Date();
    let mesAtual = (dataAtual.getMonth() + 1).toString().padStart(2, '0');
    
    let classificacao = {
        A: {},
        B: {},
        C: {}
    };

    // Organizar os dados dos jogadores por divisão
    let jogadoresPorDivisao = {
        A: [],
        B: [],
        C: []
    };

    dadosData.forEach(jogador => {
        if (jogador.divisao && classificacao[jogador.divisao]) {
            jogadoresPorDivisao[jogador.divisao].push(jogador);
        }
    });

    // Processar cada jogo para acumular a pontuação, cravadas, saldos e acertos dos jogadores por divisão e mês atual
    pontosData.forEach(jogo => {
        if (jogo.data.split('/')[1] === mesAtual) {
            for (let chave in jogo) {
                if (chave.includes('@') && jogo[chave] !== "" && !isNaN(jogo[chave])) {
                    let jogador = dadosData.find(j => j.codigo === chave);
                    if (jogador && jogador.divisao && classificacao[jogador.divisao]) {
                        if (!classificacao[jogador.divisao][chave]) {
                            classificacao[jogador.divisao][chave] = {
                                pontuacao: 0,
                                cravadas: 0,
                                saldos: 0,
                                acertos: 0
                            };
                        }

                        const pontuacao = parseInt(jogo[chave]);

                        // Atualizar pontuação total do jogador
                        classificacao[jogador.divisao][chave].pontuacao += pontuacao;

                        // Atualizar estatísticas específicas
                        if (pontuacao === 3) {
                            classificacao[jogador.divisao][chave].cravadas += 1;
                        } else if (pontuacao === 2) {
                            classificacao[jogador.divisao][chave].saldos += 1;
                        } else if (pontuacao === 1) {
                            classificacao[jogador.divisao][chave].acertos += 1;
                        }
                    }
                }
            }
        }
    });

    // Construir a tabela de classificação para cada divisão
    if (divisaoSelecionada) {
        let classificacaoArray = Object.entries(classificacao[divisaoSelecionada]).map(([email, stats]) => {
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

        // Construir o HTML da tabela de classificação para a divisão
        let tbody = $(`tbody`);
        tbody.empty(); // Limpar qualquer conteúdo existente

        classificacaoArray.forEach((jogador, index) => {
            let nome = jogador.email;
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
        construirClassificacaoPorDivisaoFiltradaPorMes(window.pontos.data, window.dados.data, divisao);
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
