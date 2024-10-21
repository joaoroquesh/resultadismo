$(document).ready(function () {
    $(document).on('pontosPronto', function () {
        if (typeof window.pontos !== 'undefined' && window.pontos.data) {
            construirClassificacao(window.pontos.data);
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

    // Construir o HTML da tabela de classificação
    let tbody = $('#classificacao tbody');
    tbody.empty(); // Limpar qualquer conteúdo existente

    classificacaoArray.forEach((jogador, index) => {
        let nome = jogador.email;
        let escudo = 'https://www.resultadismo.com/images/escudos/padrao.png';

        let linha = `
            <tr>
                <td><img src="${escudo}" data-codigo="${nome}" alt="Escudo" width="30"></td>
                <td>${index + 1}</td>
                <td data-codigo="${nome}"></td>
                <td>${jogador.pontuacao}</td>
                <td>${jogador.cravadas}</td>
                <td>${jogador.saldos}</td>
                <td>${jogador.acertos}</td>
            </tr>
        `;
        tbody.append(linha);
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

    // Listar os nomes dos campeonatos encontrados no console
    console.log("Nomes dos campeonatos encontrados:", nomesCampeonatos);

    // Construir o filtro de seleção de campeonatos
    let selectCampeonato = $('#filtroCampeonato');
    selectCampeonato.empty();
    selectCampeonato.append('<option value="">Selecione um campeonato</option>');
    nomesCampeonatos.forEach(campeonato => {
        selectCampeonato.append(`<option value="${campeonato.codigo}">${campeonato.nome}</option>`);
    });

    // Adicionar evento de filtro para a classificação
    selectCampeonato.on('change', function () {
        let campeonatoSelecionado = $(this).val();
        if (campeonatoSelecionado) {
            let pontosFiltrados = pontosData.filter(jogo => jogo.codigo.slice(0, 2) === campeonatoSelecionado);
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

    // Obter os nomes dos meses e ordenar em ordem cronológica
    let nomesMeses = Array.from(meses).sort((a, b) => a - b).map(mes => {
        return { codigo: mes, nome: obterNomeMes(mes) };
    });

    // Listar os nomes dos meses encontrados no console
    console.log("Meses encontrados:", nomesMeses);

    // Construir o filtro de seleção de meses
    let selectMes = $('#filtroMes');
    selectMes.empty();
    selectMes.append('<option value="">Selecione um mês</option>');
    nomesMeses.forEach(mes => {
        selectMes.append(`<option value="${mes.codigo}">${mes.nome}</option>`);
    });

    // Adicionar evento de filtro para a classificação
    selectMes.on('change', function () {
        let mesSelecionado = $(this).val();
        if (mesSelecionado) {
            let pontosFiltrados = pontosData.filter(jogo => jogo.data.split('/')[1] === mesSelecionado);
            construirClassificacao(pontosFiltrados);
        } else {
            construirClassificacao(pontosData);
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




// $( document ).ready(function() {

//   const url ='https://script.googleusercontent.com/macros/echo?user_content_key=LjTtc6OpvJI3Jqp4wK3fpWlrFnFIpuEfsvtU5MMdo7q39FsAwePEXzubU2GjsUikMqqOO--9v7HcODnkRX0cCzZCeykwZmWnm5_BxDlH2jW0nuo2oDemN9CCS2h10ox_1xSncGQajx_ryfhECjZEnOrK8Sz279c9adskH55hnF9MoYrHD91IwEBnMTZfHczrkUqwBVuHtBfz7K7OVHY-GrmsLHKHXYNERl2louKEv-oPp-vE3a0lxdz9Jw9Md8uu&lib=MZJdNykQjw8RX6aFaQzkrGvlUalP-BxzV';

//    var model = "<tr><td>{pos}</td>"+
//               "<td>{usuario}</td>"+
//               "<td>{ponto}</td>"+
//               "<td>{cravadas}</td>"+
//               "<td>{saldo}</td>"+
//               "<td>{acertos}</td></tr>";
            


//   $(".list-results-content").empty();  


//       fetch(url).then(rep => rep.json())
//           .then((data) => {
//               data.data.forEach((el) => {
                
//                  line = model;
//                  line = line.replace("{pos}", el.pos);
//                  line = line.replace("{usuario}", el.usuario);
//                  line = line.replace("{nome}", el.nome);
//                  line = line.replace("{ponto}", el.ponto);
//                  line = line.replace("{cravadas}", el.cravadas);
//                  line = line.replace("{saldo}", el.saldo);
//                  line = line.replace("{acertos}", el.acertos);
//                  $(".infos-dados").append(line);

                  
//               })
//               $('.preloader').fadeOut(500);
//           })
          


// });  


