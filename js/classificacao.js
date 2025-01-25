// Atualização do código para suportar múltiplas divisões de classificação
function executarFuncoesPagina() {
    construirClassificacaoPorDivisao(window.jogos.data, window.dados.data);
    atualizarElementosGlobais(window.dados);
}

function construirClassificacaoPorDivisao(jogosData, dadosData) {
    let dataAtual = new Date();
    let mesAtual = (dataAtual.getMonth() + 1).toString().padStart(2, '0');

    let classificacao = {
        A: {},
        B: {},
        C: {} // Preparado para divisões futuras
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
                palpitesComPontos: 0,
                pagoliga: jogador.pagoliga || ""
            };
        }
    });

    // Processar cada jogo para acumular pontuações por divisão
    jogosData.forEach(jogo => {
        if (jogo.data.split('/')[1] === mesAtual) {
            let resultadoReal = jogo.resultado;
            for (let chave in jogo) {
                if (chave.includes('@') && jogo[chave] !== "") {
                    let palpiteJogador = jogo[chave];
                    let jogador = dadosData.find(j => j.codigo === chave);
                    if (jogador && jogador.divisao && classificacao[jogador.divisao]) {
                        let jogadorClassificacao = classificacao[jogador.divisao][chave];
                        
                        if (!jogadorClassificacao) {
                            jogadorClassificacao = classificacao[jogador.divisao][chave] = {
                                pontuacao: 0,
                                cravadas: 0,
                                saldos: 0,
                                acertos: 0,
                                jogos: 0,
                                palpitesComPontos: 0
                            };
                        }

                        jogadorClassificacao.jogos += 1;

                        const [golsMandanteReal, golsVisitanteReal] = resultadoReal.split('x').map(Number);
                        const [golsMandantePalpite, golsVisitantePalpite] = palpiteJogador.split('x').map(Number);

                        let pontuacao = 0;

                        if (golsMandantePalpite === golsMandanteReal && golsVisitantePalpite === golsVisitanteReal) {
                            pontuacao = 3;
                            jogadorClassificacao.cravadas += 1;
                        } else if ((golsMandantePalpite - golsVisitantePalpite) === (golsMandanteReal - golsVisitanteReal) && (golsMandantePalpite > golsVisitantePalpite) === (golsMandanteReal > golsVisitanteReal)) {
                            pontuacao = 2;
                            jogadorClassificacao.saldos += 1;
                        } else if ((golsMandantePalpite > golsVisitantePalpite && golsMandanteReal > golsVisitanteReal) || (golsMandantePalpite < golsVisitantePalpite && golsMandanteReal < golsVisitanteReal)) {
                            if (golsMandanteReal !== golsVisitanteReal) {
                                pontuacao = 1;
                                jogadorClassificacao.acertos += 1;
                            }
                        }

                        if (pontuacao > 0) {
                            jogadorClassificacao.palpitesComPontos += 1;
                        }

                        jogadorClassificacao.pontuacao += pontuacao;
                    }
                }
            }
        }
    });

    // Atualizar tabelas para cada divisão
    for (let divisao in classificacao) {
        let tabela = classificacao[divisao];
        let classificacaoArray = Object.entries(tabela).map(([codigo, stats]) => {
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

        let tbody = $(`#classificacao${divisao} tbody`);
        tbody.empty();

        classificacaoArray.forEach((jogador, index) => {
            console.log(jogador);
            let linha = `
                <tr class="${jogador.pagoliga}">
                    <td>${index + 1}°</td>
                    <td><img src="https://www.resultadismo.com/images/escudos/padrao.png" data-codigo="${jogador.codigo}" alt="Escudo" width="30"></td>
                    <td data-codigo="${jogador.codigo}"></td>
                    <td>${jogador.pontuacao}</td>
                    <td>${jogador.cravadas}</td>
                    <td>${jogador.saldos}</td>
                    <td>${jogador.acertos}</td>
                </tr>
            `;
            tbody.append(linha);
        });
    }
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
