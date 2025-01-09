document.querySelector('.form').addEventListener('submit', function (event) {
  event.preventDefault(); // Prevent default form submission to stop page reload

  const emailInput = document.getElementById('email').value;
  const passwordInput = document.getElementById('senha').value;

  // Fetch JSON data from apiUrls
  const userData = Array.isArray(window.dados?.data) ? window.dados.data : [];

  // Find user in the JSON data
  const user = userData.find(
    (user) => user.codigo === emailInput && user.senha.toString() === passwordInput
  );

  const infoElement = document.querySelector('.info-text');

  if (user) {
    // User found, store email in localStorage
    localStorage.setItem('logado', user.codigo);

    // Redirect or display success message (adjust as needed)
    window.location.href = '/palpite'; // Replace with the desired page
  } else {
    // User not found, display error message
    infoElement.textContent = 'Nenhuma conta encontrada';
    infoElement.classList.add('fw-700');
  }
});



function executarFuncoesPagina() {
  console.log("executado");
}