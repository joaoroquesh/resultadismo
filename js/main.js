$(document).ready(function () {
    // URLs dos JSONs atualizados
    const APIpontos = "https://script.google.com/macros/s/AKfycbwz50LSFr5lQP0TfWqzKKOmQQ5cT_ltXhZU-MbsHDFxuvoOXpU6CbDIqZ231oHTw-w/exec";
    const APIdados = "https://script.google.com/macros/s/AKfycbz8G_SAowaGbTXSoL1Up7RnnDpEL5CGhzSc9VeLKpTm5bLqPAMWLtqS2zQBWw0NjdHCpg/exec";
    const APIjogos = "https://script.google.com/macros/s/AKfycby8KiefFil0gElim5WOmU6rxeaYGezA1qy-MCMhsSN8f33VN449grLj-q6rFhgO3_MC/exec";

    // Caminhos dos arquivos locais
    const localPontos = '../json/pontos.json';
    const localDados = '../json/dados.json';
    const localJogos = '../json/jogos.json';

    // Contador de JSONs carregados
    let carregados = 0;

    // Primeiro: Carregar dados locais e disponibilizar globalmente
    carregarDadosLocais('dados', localDados);

    // Depois: Atualizar os dados de forma assíncrona das URLs e salvar no cache
    atualizarDadosAssincronos('pontos', APIpontos);
    atualizarDadosAssincronos('dados', APIdados);
    atualizarDadosAssincronos('jogos', APIjogos);

    // Função para carregar dados locais e disponibilizar no window
    function carregarDadosLocais(nome, localUrl) {
        $.getJSON(localUrl, function (data) {
            // Carregar dados locais e armazenar globalmente
            window[nome] = data;
            console.log(`${nome} carregado dos arquivos locais.`);
            $(document).trigger(`${nome}Pronto`); // Disparar evento para indicar que os dados locais foram carregados
        }).fail(function () {
            console.error(`Falha ao carregar ${nome} do arquivo local.`);
        });
    }

    // Função para buscar e atualizar dados de URLs e armazenar no localStorage
    function atualizarDadosAssincronos(nome, apiUrl) {
        $.getJSON(apiUrl, function (data) {
            // Salvar os dados no localStorage e no window para uso posterior
            localStorage.setItem(nome, JSON.stringify(data));
            window[nome] = data;
            console.log(`${nome} atualizado dos arquivos remotos.`);
            $(document).trigger(`${nome}Atualizado`); // Disparar evento para indicar que os dados online foram carregados e atualizados
        }).fail(function () {
            console.error(`Falha ao atualizar ${nome} dos arquivos remotos.`);
        });
    }

    // Atualizar elementos globais sempre que os dados forem atualizados
    $(document).on('dadosAtualizado pontosAtualizado jogosAtualizado', function () {
        carregados++;
        if (carregados === 3) {
            // Executar as funções somente após todos os dados terem sido atualizados
            if (typeof window.dados !== 'undefined' && window.dados.data) {
                atualizarElementosGlobais(window.dados);
            }
            
            // Ocultar o elemento de carregamento quando tudo estiver atualizado
            // $('body').removeClass('loading');
            console.log("Todos os dados foram atualizados.");
        }
    });

    // Atualizar elementos globais e carregar classificação inicial com os dados locais
    $(document).on('dadosPronto pontosPronto', function () {
        if (typeof window.dados !== 'undefined' && window.dados.data) {
            atualizarElementosGlobais(window.dados);
        }
        if (typeof window.pontos !== 'undefined' && window.pontos.data) {
            construirClassificacao(window.pontos.data);
        }
    });
});


// Chame essa função quando os dados estiverem carregados
function carregarDados(dados) {
    // Atualizar window.dados com os dados carregados
    window.dados = dados;

    // Disparar o evento 'dadosProntos' para indicar que os dados estão prontos para serem usados
    $(document).trigger('dadosProntos');
}

function atualizarElementosGlobais(dados) {
    // Verificar se os dados e a chave 'data' estão definidos
    if (!dados || !Array.isArray(dados.data)) {
        console.error("Os dados fornecidos são inválidos ou estão indefinidos.");
        return;
    }

    // Iterar sobre todos os elementos que tenham o atributo data-codigo
    $('[data-codigo]').each(function() {
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

// Certificar-se de que os dados são carregados e, em seguida, disparar o evento
$(document).ready(function() {
    // Simulação do carregamento dos dados
    $.getJSON('../json/dados.json', function(response) {
        carregarDados(response);
    });
});

// Executar atualização dos elementos globais quando o evento 'dadosProntos' for disparado
$(document).on('dadosProntos', function() {
    if (typeof window.dados !== 'undefined' && window.dados.data) {
        atualizarElementosGlobais(window.dados);
    }
});
