$(document).ready(function () {
    $(document).on('jogosPronto', function () {
        if (typeof window.jogos !== 'undefined' && window.jogos.data) {
            calcularDatasFases(window.dados.data);
            preencherClassificacoes(window.dados.data);
            atualizarFiltrosDatas();
            atualizarTabAtiva();
            atualizarVencedorTabs();
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
                calcularDatasFases(window.dados.data);
                preencherClassificacoes(window.dados.data);
                atualizarFiltrosDatas();
                atualizarTabAtiva();
                atualizarVencedorTabs();
            }
            $('body').removeClass('loading');
            console.log("Todos os dados foram atualizados.");
        }
    });
});

function ajustarAnoPara2024(data) {
    if (!(data instanceof Date)) {
        data = new Date(data);
    }
    data.setFullYear(2024);
    return data;
}

let datasFases = {};

function calcularDatasFases(dadosData) {
    let jogadorComData = dadosData.find(item => item.codigo === 'CP');
    if (jogadorComData && jogadorComData.copa) {
        let dataInicioOitavas = ajustarAnoPara2024(new Date(jogadorComData.copa.split('/').reverse().join('-')));
        let dataFimOitavas = ajustarAnoPara2024(new Date(dataInicioOitavas));
        dataFimOitavas.setDate(dataFimOitavas.getDate() + 6);

        let dataInicioQuartas = ajustarAnoPara2024(new Date(dataFimOitavas));
        dataInicioQuartas.setDate(dataInicioQuartas.getDate() + 1);
        let dataFimQuartas = ajustarAnoPara2024(new Date(dataInicioQuartas));
        dataFimQuartas.setDate(dataFimQuartas.getDate() + 6);

        let dataInicioSemi = ajustarAnoPara2024(new Date(dataFimQuartas));
        dataInicioSemi.setDate(dataInicioSemi.getDate() + 1);
        let dataFimSemi = ajustarAnoPara2024(new Date(dataInicioSemi));
        dataFimSemi.setDate(dataFimSemi.getDate() + 6);

        let dataInicioFinal = ajustarAnoPara2024(new Date(dataFimSemi));
        dataInicioFinal.setDate(dataInicioFinal.getDate() + 1);
        let dataFimFinal = ajustarAnoPara2024(new Date(dataInicioFinal));
        dataFimFinal.setDate(dataFimFinal.getDate() + 6);


        datasFases = {
            oitavas: { inicio: dataInicioOitavas, fim: dataFimOitavas },
            quartas: { inicio: dataInicioQuartas, fim: dataFimQuartas },
            semi: { inicio: dataInicioSemi, fim: dataFimSemi },
            final: { inicio: dataInicioFinal, fim: dataFimFinal }
        };
        console.log("Datas das fases calculadas:", datasFases);
    }
}

function atualizarTabAtiva() {
    let dataHoje = new Date();
    dataHoje.setFullYear(2024);
    let dataHojeFormatada = dataHoje.toISOString().split('T')[0];

    let tabAtiva = '#nav-oitavas-tab';

    if (dataHojeFormatada >= datasFases.oitavas.inicio.toISOString().split('T')[0] && dataHojeFormatada <= datasFases.oitavas.fim.toISOString().split('T')[0]) {
        $('#nav-oitavas').addClass('andamento');
    }
    if (dataHojeFormatada >= datasFases.quartas.inicio.toISOString().split('T')[0] && dataHojeFormatada <= datasFases.quartas.fim.toISOString().split('T')[0]) {
        tabAtiva = '#nav-quartas-tab';
        $('#nav-quartas').addClass('andamento');
    } else if (dataHojeFormatada >= datasFases.semi.inicio.toISOString().split('T')[0] && dataHojeFormatada <= datasFases.semi.fim.toISOString().split('T')[0]) {
        tabAtiva = '#nav-semi-tab';
        $('#nav-semi').addClass('andamento');
    } else if (dataHojeFormatada >= datasFases.final.inicio.toISOString().split('T')[0] && dataHojeFormatada <= datasFases.final.fim.toISOString().split('T')[0]) {
        tabAtiva = '#nav-final-tab';
        $('#nav-final').addClass('andamento');
    } else if (dataHojeFormatada > datasFases.final.fim.toISOString().split('T')[0]) {
        tabAtiva = '#nav-final-tab';
    }

    // Remover a classe ativa de todas as tabs e conteúdos
    $('#nav-tab .nav-link').removeClass('active');
    $('.tab-pane').removeClass('show active');

    // Adicionar a classe ativa na tab e no conteúdo correspondente
    $(tabAtiva).addClass('active');
    $($(tabAtiva).data('target')).addClass('show active');
}

function atualizarVencedorTabs() {
    let dataHoje = ajustarAnoPara2024(new Date());
let dataHojeFormatada = dataHoje.toISOString().split('T')[0];

if (dataHojeFormatada > ajustarAnoPara2024(datasFases.oitavas.fim).toISOString().split('T')[0]) {
    $('#nav-oitavas').addClass('vencedor');
}
if (dataHojeFormatada > ajustarAnoPara2024(datasFases.quartas.fim).toISOString().split('T')[0]) {
    $('#nav-quartas').addClass('vencedor');
}
if (dataHojeFormatada > ajustarAnoPara2024(datasFases.semi.fim).toISOString().split('T')[0]) {
    $('#nav-semi').addClass('vencedor');
}
if (dataHojeFormatada > ajustarAnoPara2024(datasFases.final.fim).toISOString().split('T')[0]) {
    $('#nav-final').addClass('vencedor');
}

}

function preencherClassificacoes(dadosData) {
    let classificacao = {};
    let dataHoje = new Date();
    dataHoje.setFullYear(2024);

    // Log para verificar dataHoje e datas das fases
    console.log("Data de hoje:", dataHoje);
    console.log("Datas das fases:", datasFases);

    let dataHojeFormatada = dataHoje.toISOString().split('T')[0];

    // Oitavas de final (jogos 1 a 8)

    for (let i = 1; i <= 8; i++) {
        let jogadores = dadosData.filter(jogador => jogador.copa == i);
        if (jogadores.length === 2) {
            classificacao[i] = jogadores.map(jogador => {
                let pontos = calcularPontosJogosNoPeriodo(jogador, datasFases.oitavas.inicio, datasFases.oitavas.fim);
                return {
                    ...jogador,
                    pontos: pontos.pontuacao,
                    cravadas: pontos.cravadas,
                    saldos: pontos.saldos,
                    acertos: pontos.acertos
                };
            });

            // Ordenar jogadores por pontuação e critérios de desempate
            classificacao[i].sort((a, b) => {
                if (b.pontos !== a.pontos) {
                    return b.pontos - a.pontos;
                } else if (b.cravadas !== a.cravadas) {
                    return b.cravadas - a.cravadas;
                } else if (b.saldos !== a.saldos) {
                    return b.saldos - a.saldos;
                } else if (b.acertos !== a.acertos) {
                    return b.acertos - a.acertos;
                } else {
                    return 0;
                }
            });

            let tbody = $(`#jogo${i} tbody`);
            tbody.empty(); // Limpar qualquer conteúdo existente

            classificacao[i].forEach((jogador, index) => {
                let escudo = 'https://www.resultadismo.com/images/escudos/padrao.png';
                let linha = `
                        <tr>
                            <td>${index + 1}°</td>
                            <td><img src="${escudo}" data-codigo="${jogador.codigo}" alt="Escudo" width="30"></td>
                            <td data-codigo="${jogador.codigo}">${jogador.codigo}</td>
                            <td>${jogador.pontos}</td>
                            <td>${jogador.cravadas}</td>
                            <td>${jogador.saldos}</td>
                            <td>${jogador.acertos}</td>
                        </tr>
                    `;
                tbody.append(linha);
            });
        }
    }


    // Quartas de final (jogos 9 a 12)
    if (dataHojeFormatada >= datasFases.quartas.inicio.toISOString().split('T')[0]) {
        for (let i = 9; i <= 12; i++) {
            let jogoAnterior1 = classificacao[(i - 8) * 2 - 1];
            let jogoAnterior2 = classificacao[(i - 8) * 2];
            if (jogoAnterior1 && jogoAnterior2) {
                let vencedores = [jogoAnterior1[0], jogoAnterior2[0]].map(jogador => {
                    let pontos = calcularPontosJogosNoPeriodo(jogador, datasFases.quartas.inicio, datasFases.quartas.fim);
                    return {
                        ...jogador,
                        pontos: pontos.pontuacao,
                        cravadas: pontos.cravadas,
                        saldos: pontos.saldos,
                        acertos: pontos.acertos
                    };
                });

                // Ordenar jogadores por pontuação e critérios de desempate
                vencedores.sort((a, b) => {
                    if (b.pontos !== a.pontos) {
                        return b.pontos - a.pontos;
                    } else if (b.cravadas !== a.cravadas) {
                        return b.cravadas - a.cravadas;
                    } else if (b.saldos !== a.saldos) {
                        return b.saldos - a.saldos;
                    } else if (b.acertos !== a.acertos) {
                        return b.acertos - a.acertos;
                    } else {
                        return 0;
                    }
                });

                classificacao[i] = vencedores;

                let tbody = $(`#jogo${i} tbody`);
                tbody.empty();

                vencedores.forEach((jogador, index) => {
                    let escudo = 'https://www.resultadismo.com/images/escudos/padrao.png';
                    let linha = `
                        <tr>
                            <td>${index + 1}°</td>
                            <td><img src="${escudo}" data-codigo="${jogador.codigo}" alt="Escudo" width="30"></td>
                            <td data-codigo="${jogador.codigo}">${jogador.codigo}</td>
                            <td>${jogador.pontos}</td>
                            <td>${jogador.cravadas}</td>
                            <td>${jogador.saldos}</td>
                            <td>${jogador.acertos}</td>
                        </tr>
                    `;
                    tbody.append(linha);
                });
            }
        }
    }

    // Semifinais (jogos 13 e 14)
    if (dataHojeFormatada >= datasFases.semi.inicio.toISOString().split('T')[0]) {
        for (let i = 13; i <= 14; i++) {
            let jogoAnterior1 = classificacao[(i - 12) * 2 + 8 - 1];
            let jogoAnterior2 = classificacao[(i - 12) * 2 + 8];
            if (jogoAnterior1 && jogoAnterior2) {
                let vencedores = [jogoAnterior1[0], jogoAnterior2[0]].map(jogador => {
                    let pontos = calcularPontosJogosNoPeriodo(jogador, datasFases.semi.inicio, datasFases.semi.fim);
                    return {
                        ...jogador,
                        pontos: pontos.pontuacao,
                        cravadas: pontos.cravadas,
                        saldos: pontos.saldos,
                        acertos: pontos.acertos
                    };
                });

                // Ordenar jogadores por pontuação e critérios de desempate
                vencedores.sort((a, b) => {
                    if (b.pontos !== a.pontos) {
                        return b.pontos - a.pontos;
                    } else if (b.cravadas !== a.cravadas) {
                        return b.cravadas - a.cravadas;
                    } else if (b.saldos !== a.saldos) {
                        return b.saldos - a.saldos;
                    } else if (b.acertos !== a.acertos) {
                        return b.acertos - a.acertos;
                    } else {
                        return 0;
                    }
                });

                classificacao[i] = vencedores;

                let tbody = $(`#jogo${i} tbody`);
                tbody.empty();

                vencedores.forEach((jogador, index) => {
                    let escudo = 'https://www.resultadismo.com/images/escudos/padrao.png';
                    let linha = `
                        <tr>
                            <td>${index + 1}°</td>
                            <td><img src="${escudo}" data-codigo="${jogador.codigo}" alt="Escudo" width="30"></td>
                            <td data-codigo="${jogador.codigo}">${jogador.codigo}</td>
                            <td>${jogador.pontos}</td>
                            <td>${jogador.cravadas}</td>
                            <td>${jogador.saldos}</td>
                            <td>${jogador.acertos}</td>
                        </tr>
                    `;
                    tbody.append(linha);
                });
            }
        }
    }

    // Final (jogo 15)
    if (dataHojeFormatada >= datasFases.final.inicio.toISOString().split('T')[0]) {
        let jogoAnterior13 = classificacao[13];
        let jogoAnterior14 = classificacao[14];
        if (jogoAnterior13 && jogoAnterior14) {
            let vencedores = [jogoAnterior13[0], jogoAnterior14[0]].map(jogador => {
                let pontos = calcularPontosJogosNoPeriodo(jogador, datasFases.final.inicio, datasFases.final.fim);
                return {
                    ...jogador,
                    pontos: pontos.pontuacao,
                    cravadas: pontos.cravadas,
                    saldos: pontos.saldos,
                    acertos: pontos.acertos
                };
            });

            // Ordenar jogadores por pontuação e critérios de desempate
            vencedores.sort((a, b) => {
                if (b.pontos !== a.pontos) {
                    return b.pontos - a.pontos;
                } else if (b.cravadas !== a.cravadas) {
                    return b.cravadas - a.cravadas;
                } else if (b.saldos !== a.saldos) {
                    return b.saldos - a.saldos;
                } else if (b.acertos !== a.acertos) {
                    return b.acertos - a.acertos;
                } else {
                    return 0;
                }
            });

            classificacao[15] = vencedores;

            let tbody = $(`#jogo15 tbody`);
            tbody.empty();

            vencedores.forEach((jogador, index) => {
                let escudo = 'https://www.resultadismo.com/images/escudos/padrao.png';
                let linha = `
                    <tr>
                        <td>${index + 1}°</td>
                        <td><img src="${escudo}" data-codigo="${jogador.codigo}" alt="Escudo" width="30"></td>
                        <td data-codigo="${jogador.codigo}">${jogador.codigo}</td>
                        <td>${jogador.pontos}</td>
                        <td>${jogador.cravadas}</td>
                        <td>${jogador.saldos}</td>
                        <td>${jogador.acertos}</td>
                    </tr>
                `;
                tbody.append(linha);
            });
        }
    }
}


function calcularPontosJogosNoPeriodo(jogador, dataInicial, dataFinal) {

    // Inicializar os pontos do jogador
    let pontos = {
        pontuacao: 0,
        cravadas: 0,
        saldos: 0,
        acertos: 0
    };

    // Filtrar os jogos que estão dentro do período especificado
    let jogosNoPeriodo = filtrarJogosPorPeriodo(dataInicial, dataFinal);

    // Calcular os pontos com base nos jogos filtrados
    jogosNoPeriodo.forEach(jogo => {

        if (jogador.codigo && jogo[jogador.codigo]) {
            let palpiteJogador = jogo[jogador.codigo];
            if (palpiteJogador && jogo.resultado) {
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
        }

    });

    return pontos;
}

function filtrarJogosPorPeriodo(dataInicial, dataFinal) {
    let jogos = window.jogos.data || [];
    let dataInicialTime = ajustarAnoPara2024(dataInicial).getTime();
    let dataFinalTime = ajustarAnoPara2024(dataFinal).getTime();

    return jogos.filter(jogo => {
        let dataJogo = ajustarAnoPara2024(new Date(jogo.data.split('/').reverse().join('-')));
        let dataJogoTime = dataJogo.getTime();
        return dataJogoTime >= dataInicialTime && dataJogoTime <= dataFinalTime;
    });
}


function atualizarFiltrosDatas() {
    if (datasFases.oitavas) {
        let dataTextoOitavas = `${datasFases.oitavas.inicio.getDate().toString().padStart(2, '0')}/${(datasFases.oitavas.inicio.getMonth() + 1).toString().padStart(2, '0')} a ${datasFases.oitavas.fim.getDate().toString().padStart(2, '0')}/${(datasFases.oitavas.fim.getMonth() + 1).toString().padStart(2, '0')}`;
        $('#pills-oitavas-tab').text(dataTextoOitavas);
    }

    if (datasFases.quartas) {
        let dataTextoquartas = `${datasFases.quartas.inicio.getDate().toString().padStart(2, '0')}/${(datasFases.quartas.inicio.getMonth() + 1).toString().padStart(2, '0')} a ${datasFases.quartas.fim.getDate().toString().padStart(2, '0')}/${(datasFases.quartas.fim.getMonth() + 1).toString().padStart(2, '0')}`;
        $('#pills-quartas-tab').text(dataTextoquartas);
    }

    if (datasFases.semi) {
        let dataTextosemi = `${datasFases.semi.inicio.getDate().toString().padStart(2, '0')}/${(datasFases.semi.inicio.getMonth() + 1).toString().padStart(2, '0')} a ${datasFases.semi.fim.getDate().toString().padStart(2, '0')}/${(datasFases.semi.fim.getMonth() + 1).toString().padStart(2, '0')}`;
        $('#pills-semi-tab').text(dataTextosemi);
    }

    if (datasFases.final) {
        let dataTextofinal = `${datasFases.final.inicio.getDate().toString().padStart(2, '0')}/${(datasFases.final.inicio.getMonth() + 1).toString().padStart(2, '0')} a ${datasFases.final.fim.getDate().toString().padStart(2, '0')}/${(datasFases.final.fim.getMonth() + 1).toString().padStart(2, '0')}`;
        $('#pills-final-tab').text(dataTextofinal);
    }
}