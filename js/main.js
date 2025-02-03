$(document).ready(function () {
    const apiUrls = {
        dados: "https://script.google.com/macros/s/AKfycbz8G_SAowaGbTXSoL1Up7RnnDpEL5CGhzSc9VeLKpTm5bLqPAMWLtqS2zQBWw0NjdHCpg/exec",
        jogos: "https://script.google.com/macros/s/AKfycby8KiefFil0gElim5WOmU6rxeaYGezA1qy-MCMhsSN8f33VN449grLj-q6rFhgO3_MC/exec",
        // pontos: "https://script.google.com/macros/s/AKfycbwz50LSFr5lQP0TfWqzKKOmQQ5cT_ltXhZU-MbsHDFxuvoOXpU6CbDIqZ231oHTw-w/exec"
    };

    let carregados = 0;
    let erro = false;


    const localDataKeys = Object.keys(apiUrls);

    localDataKeys.forEach(key => {
        const localData = localStorage.getItem(key);
        if (localData) {
            window[key] = JSON.parse(localData);
            $(document).trigger(`${key}Pronto`);
            console.log(`${key} tem dados no localStorage`);
            carregarDados(apiUrls[key], key);
        } else {
            carregarDados(apiUrls[key], key);
            console.log(`${key} não tem dados no localStorage`);
        }
    });

    if (localDataKeys.every(key => window[key])) {
        executarFuncoesPagina(); // Executar no carregamento inicial após todos os dados serem carregados
        $('body').removeClass('loading');
        console.log("Loading retirado");
    }

    function checkLoginStatus() {
        const loggedInUser = localStorage.getItem('logado');
        const jogadorElements = document.querySelectorAll('.jogador-logado');

        if (loggedInUser) {
            console.log(`Usuário logado: ${loggedInUser}`);

            // Set data-codigo attribute for all .jogador elements
            jogadorElements.forEach(jogador => {
                jogador.setAttribute('data-codigo', loggedInUser);
            });
        } else {
            console.log('Usuário deslogado');
        }

        atualizarElementosGlobais(dados)
    }

    // Call the function to check login status
    checkLoginStatus();

    function carregarDados(url, key) {
        $.getJSON(url, function (data) {
            // Atualiza localStorage e dispara evento
            localStorage.setItem(key, JSON.stringify(data));
            window[key] = data;
            $(document).trigger(`${key}Pronto`);
            console.log(`${key} Atualizado localStorage`);
        }).fail(function () {
            erro = true;
            mostrarErroCarregamento();
            console.log("Deu erro");
        }).always(function () {
            carregados++;
            verificarConclusao();

        });
    }

    function verificarConclusao() {
        if (carregados === 2) {
            if (!erro) {
                executarFuncoesPagina(); // Executar após conclusão
                mostrarSucessoCarregamento();
            }
            $(document).trigger("dadosCompletos");
        }
    }


    function mostrarErroCarregamento() {
        $('#carregando-text').html('Falhou, tentar novamente: <a class="navbar-toggler" href=""><img src="../images/icons/atualizar.svg" height="24px" alt="atualizar"></a>');
        $('#carregando').addClass('erro');
        $('#carregando-icon').replaceWith(`
            <svg id="erro" fill="#c21313" viewBox="0 0 24 24">
                <path class="st0" d="M19.2,5.6c-1.9-.1-3.8-.8-5.4-2-1.1-.8-2.6-.8-3.6,0-1.6,1.1-3.4,1.8-5.4,2-1,.1-1.8,1-1.8,2v5.5c0,4.2,4.6,7.2,7.4,8.6.5.3,1,.4,1.6.4s1.1-.1,1.6-.4c2.8-1.4,7.4-4.4,7.4-8.6v-5.5c0-1-.8-1.9-1.8-2ZM19,13c0,3.3-4.4,5.8-6.3,6.8-.4.2-.9.2-1.4,0-1.9-1-6.3-3.6-6.3-6.8v-5.4c2.3-.2,4.5-1,6.4-2.4.2-.1.4-.2.6-.2s.4,0,.6.2c1.9,1.4,4.1,2.2,6.4,2.4v5.5Z"/>
                <path class="st0" d="M10.3,9.4c-.4-.4-1-.4-1.4,0-.4.4-.4,1,0,1.4l1.7,1.7-1.7,1.7c-.4.4-.4,1,0,1.4s.5.3.7.3.5,0,.7-.3l1.7-1.7,1.7,1.7c.2.2.5.3.7.3s.5,0,.7-.3c.4-.4.4-1,0-1.4l-1.7-1.7,1.7-1.7c.4-.4.4-1,0-1.4-.4-.4-1-.4-1.4,0l-1.7,1.7-1.7-1.7Z"/>
            </svg>
        `);
    }

    function mostrarSucessoCarregamento() {
        $('#carregando').addClass('success');
        $('#carregando-text').text('informações atualizadas');
        $('#carregando-icon').replaceWith(`
            <svg id="success" fill="#bf9000" viewBox="0 0 24 24">
                <path class="st0" d="M12,22c-.5,0-1.1-.1-1.6-.4-2.8-1.4-7.4-4.4-7.4-8.6v-5.5c0-1,.8-1.9,1.8-2,2-.2,3.8-.8,5.4-2,1.1-.8,2.5-.8,3.6,0,1.6,1.1,3.4,1.8,5.4,2,1,.1,1.8,1,1.8,2v5.5c0,4.2-4.6,7.2-7.4,8.6-.5.3-1,.4-1.6.4ZM12,5c-.2,0-.4,0-.6.2-1.9,1.4-4.1,2.2-6.4,2.4v5.4c0,3.3,4.4,5.9,6.3,6.8.4.2.9.2,1.4,0,1.9-1,6.3-3.6,6.3-6.8v-5.5c-2.3-.2-4.5-1-6.4-2.4-.2-.1-.4-.2-.6-.2Z"/>
                <path class="st0" d="M11.2,15.4c-.3,0-.5,0-.7-.3l-2.3-2.3c-.4-.4-.4-1,0-1.4.4-.4,1-.4,1.4,0l1.6,1.6,3.2-3.2c.4-.4,1-.4,1.4,0,.4.4.4,1,0,1.4l-3.9,3.9c-.2.2-.5.3-.7.3Z"/>
            </svg>
        `);
        $('body').removeClass('loading');
        console.log("Loading retirado");
        setTimeout(() => $('body').removeClass('atualizando'), 3000);
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

});

$(document).ready(function () {
    // Carregar o menu e, em seguida, adicionar a classe 'active' ao link correspondente
    $("#menu").load("components/menu-new.html", function () {
      const currentPath = window.location.pathname;
      const menuItems = document.querySelectorAll('.nav-item .nav-link');

      menuItems.forEach((link) => {
        const linkPath = link.getAttribute('href');
        if (linkPath === currentPath || currentPath.endsWith(linkPath)) {
          link.classList.add('active');
        }
      });
    });

    $("#header").load("components/header.html", function () {
      const loggedInUser = localStorage.getItem('logado');
      const jogadorElements = document.querySelectorAll('.jogador-logado');

      if (loggedInUser) {
        
        jogadorElements.forEach(jogador => {
          jogador.setAttribute('data-codigo', loggedInUser);
        });
        $('[data-codigo]').each(function () {
          const codigo = $(this).data('codigo');
          const elemento = $(this);
          window.dados.data.forEach(item => {
            if (item.codigo === codigo) {
              if (elemento.is('img')) {
                elemento.attr('src', item.imagem);
              }
            }
          });
        });
        $('.navbar-toggler').addClass('logado');
      } else {
        console.log('Usuário deslogado');
      }

      // Add event listener for .navbar-toggler after header is loaded
      document.querySelector('.navbar-toggler').addEventListener('click', function () {
        if (!loggedInUser) {
          // Redirect to /login if no user is logged in
          window.location.href = '/login';
        } else {
          // Execute openOptions() if user is logged in
          abrirOptions();
        }
      });
    });

    // atualizarElementosGlobais(window.dados);

  });

  $("footer").load("components/footer.html");
  $("#carregando").load("components/carregando.html");
