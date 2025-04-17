function executarFuncoesPagina() {
    calcularClassificacaoSuperFinal();
    atualizarFiltrosDatas();
    atualizarVencedorTabs();
    atualizarElementosGlobais(window.dados);
}

function ajustarAnoPara2025(data) {
    if (!(data instanceof Date)) {
        data = new Date(data);
    }
    data.setFullYear(2025);
    return ajustarFusoHorario(data);
}

function ajustarFusoHorario(data) {
    const offsetBrasilia = -3 * 60; // UTC-3 em minutos
    const offsetLocal = data.getTimezoneOffset();
    data.setMinutes(data.getMinutes() + offsetLocal - offsetBrasilia);
    return data;
}

const dataInicioFinal = ajustarAnoPara2025(new Date("2025-04-14"));
const dataFimFinal = ajustarAnoPara2025(new Date("2025-04-20"));

function atualizarVencedorTabs() {
    const dataHoje = ajustarAnoPara2025(new Date());
    if (dataHoje > dataFimFinal) {
        $('#nav-final').addClass('vencedor');
    }
}

function calcularClassificacaoSuperFinal() {
    const jogadores = [
        { codigo: "jbrunocouto@gmail.com", nome: "João Bruno" },
        { codigo: "wellingtondiassh@gmail.com", nome: "Wellington Dias" }
    ];

    let classificacao = jogadores.map(jogador => {
        const pontos = calcularPontosJogosNoPeriodo(jogador, dataInicioFinal, dataFimFinal);
        const jogos = pontos.jogos || 0;
        const palpitesComPontos = pontos.acertos + pontos.cravadas + pontos.saldos;

        const aproveitamento = jogos > 0 ? ((pontos.pontuacao / (jogos * 3)) * 100).toFixed(2) : 0;
        const acertividade = jogos > 0 ? ((palpitesComPontos / jogos) * 100).toFixed(2) : 0;

        return { ...jogador, ...pontos, aproveitamento: parseFloat(aproveitamento), acertividade: parseFloat(acertividade) };
    });

    // Ordenar a classificação com base na pontuação e critérios de desempate
    classificacao.sort((a, b) => {
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
            return 0;
        }
    });

    // Atualizar a tabela com a classificação corrigida
    atualizarTabelaClassificacao(classificacao);
}

function calcularPontosJogosNoPeriodo(jogador, dataInicial, dataFinal) {
    const pontos = {
        pontuacao: 0,
        cravadas: 0,
        saldos: 0,
        acertos: 0,
        jogos: 0
    };

    const jogosNoPeriodo = filtrarJogosPorPeriodo(dataInicial, dataFinal);

    jogosNoPeriodo.forEach(jogo => {
        if (jogo[jogador.codigo]) {
            pontos.jogos += 1;
            const palpiteJogador = jogo[jogador.codigo];
            const [golsMandanteReal, golsVisitanteReal] = jogo.resultado.split('x').map(Number);
            const [golsMandantePalpite, golsVisitantePalpite] = palpiteJogador.split('x').map(Number);

            if (golsMandantePalpite === golsMandanteReal && golsVisitantePalpite === golsVisitanteReal) {
                pontos.pontuacao += 3;
                pontos.cravadas += 1;
            } else if ((golsMandantePalpite - golsVisitantePalpite) === (golsMandanteReal - golsVisitanteReal)) {
                pontos.pontuacao += 2;
                pontos.saldos += 1;
            } else if (
                (golsMandantePalpite > golsVisitantePalpite && golsMandanteReal > golsVisitanteReal) ||
                (golsMandantePalpite < golsVisitantePalpite && golsMandanteReal < golsVisitanteReal)
            ) {
                pontos.pontuacao += 1;
                pontos.acertos += 1;
            }
        }
    });

    return pontos;
}

function filtrarJogosPorPeriodo(dataInicial, dataFinal) {
    const jogos = window.jogos.data || [];
    const dataInicialTime = dataInicial.getTime();
    const dataFinalTime = dataFinal.getTime();

    return jogos.filter(jogo => {
        const dataJogo = ajustarAnoPara2025(new Date(jogo.data.split('/').reverse().join('-')));
        return dataJogo.getTime() >= dataInicialTime && dataJogo.getTime() <= dataFinalTime;
    });
}

function atualizarTabelaClassificacao(classificacao) {
    let escudo = 'https://www.resultadismo.com/images/escudos/padrao.png';
    const tabela = document.querySelector("#jogo tbody");
    tabela.innerHTML = classificacao.map((jogador, index) => `
        <tr>
            <td>${index + 1}°</td>
            <td><img src="${escudo}" data-codigo="${jogador.codigo}" alt="Escudo" width="30"></td>
            <td>${jogador.nome}</td>
            <td>${jogador.pontuacao}</td>
            <td>${jogador.cravadas}</td>
            <td>${jogador.saldos}</td>
            <td>${jogador.acertos}</td>
            <!--
            <td>${jogador.aproveitamento}%</td>
            <td>${jogador.acertividade}%</td>
            -->
        </tr>
    `).join("");
}

function atualizarFiltrosDatas() {
    const dataTextoFinal = `${dataInicioFinal.getDate().toString().padStart(2, '0')}/${(dataInicioFinal.getMonth() + 1).toString().padStart(2, '0')} a ${dataFimFinal.getDate().toString().padStart(2, '0')}/${(dataFimFinal.getMonth() + 1).toString().padStart(2, '0')}`;
    $('#pills-final-tab').text(dataTextoFinal);
}

function atualizarElementosGlobais(dados) {
    if (!dados || !Array.isArray(dados.data)) {
        console.error("Os dados fornecidos são inválidos ou estão indefinidos.");
        return;
    }

    $('[data-codigo]').each(function () {
        const codigo = $(this).data('codigo');
        const elemento = $(this);

        dados.data.forEach(item => {
            if (item.codigo === codigo) {
                if (elemento.is('img')) {
                    elemento.attr('src', item.imagem);
                } else {
                    elemento.text(item.nome);
                }
            }
        });
    });
}
