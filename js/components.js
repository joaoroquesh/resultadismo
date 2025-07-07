// Função utilitária para calcular o caminho correto dos componentes
function getComponentPath(component) {
    // Conta quantos níveis acima está a página atual em relação à raiz
    const pathDepth = window.location.pathname.split('/').filter(Boolean).length - 1;
    // Se estiver na raiz, usa 'components/', senão usa '../components/' para cada nível acima
    if (pathDepth === 0) {
        return `components/${component}`;
    } else {
        return `${'../'.repeat(pathDepth)}components/${component}`;
    }
}

$(document).ready(function () {
  // Carregar o menu e, em seguida, adicionar a classe 'active' ao link correspondente
  $("#menu").load(getComponentPath("menu-new.html"), function () {
    const currentPath = window.location.pathname;
    const menuItems = document.querySelectorAll('.nav-item .nav-link');

    menuItems.forEach((link) => {
      const linkPath = link.getAttribute('href');
      if (linkPath === currentPath || currentPath.endsWith(linkPath)) {
        link.classList.add('active');
      }
    });
  });

  $("#header").load(getComponentPath("header.html"), function () {
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

});

$("footer").load(getComponentPath("footer.html"));
$("#carregando").load(getComponentPath("carregando.html"));