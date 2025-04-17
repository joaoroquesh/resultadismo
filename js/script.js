import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

// Inicializar o Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAh820UjkWEVYASQRVi24VaN4c2vYpEwT4",
    authDomain: "resultadismo-c4a71.firebaseapp.com",
    projectId: "resultadismo-c4a71",
    storageBucket: "resultadismo-c4a71.firebasestorage.app",
    messagingSenderId: "642207879266",
    appId: "1:642207879266:web:91de83181431f06a00813b",
    measurementId: "G-LKLDMDMXZZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', function() {

    // Funções de Autenticação
    async function signup() {
        console.log('Função signup() chamada!');
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            // Cadastro bem-sucedido
            const user = userCredential.user;
            console.log('Usuário cadastrado:', user);
            updateUI(user);
        } catch (error) {
            console.error('Erro ao cadastrar:', error);
            alert('Erro ao cadastrar: ' + error.message);
        }
    }

    async function login() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            // Login bem-sucedido
            const user = userCredential.user;
            console.log('Usuário logado:', user);
            updateUI(user);
        } catch (error) {
            console.error('Erro ao logar:', error);
            alert('Erro ao logar: ' + error.message);
        }
    }

    function logout() {
        signOut(auth)
            .then(() => {
                // Logout bem-sucedido
                console.log('Usuário deslogado');
                updateUI(null);
            })
            .catch((error) => {
                console.error('Erro ao deslogar:', error);
                alert('Erro ao deslogar: ' + error.message);
            });
    }

    // Observar o estado de autenticação
    onAuthStateChanged(auth, (user) => {
        updateUI(user);
    });

    // Funções de Interface do Usuário
    function updateUI(user) {
        if (user) {
            // Usuário está logado
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('signup-form').style.display = 'none';
            document.getElementById('logout-button').style.display = 'block';
            document.getElementById('user-data').style.display = 'block';
            document.getElementById('user-email').textContent = user.email;
            loadData(user.uid); // Carregar dados do usuário
        } else {
            // Usuário não está logado
            document.getElementById('login-form').style.display = 'block';
            document.getElementById('signup-form').style.display = 'block';
            document.getElementById('logout-button').style.display = 'none';
            document.getElementById('user-data').style.display = 'none';
            document.getElementById('user-email').textContent = '';
        }
    }

    // Funções de Banco de Dados
    async function saveData() {
        const user = auth.currentUser;
        if (user) {
            const data = document.getElementById('data-input').value;
            try {
                await setDoc(doc(db, 'users', user.uid), {
                    data: data
                });
                console.log('Dados salvos com sucesso!');
                loadData(user.uid);
            } catch (error) {
                console.error('Erro ao salvar dados:', error);
                alert('Erro ao salvar dados: ' + error.message);
            }
        } else {
            alert('Você precisa estar logado para salvar dados.');
        }
    }

    async function loadData(userId) {
        try {
            const docRef = doc(db, 'users', userId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data().data;
                document.getElementById('saved-data').textContent = 'Dados salvos: ' + data;
            } else {
                document.getElementById('saved-data').textContent = 'Nenhum dado salvo ainda.';
            }
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
        }
    }

    // Adicionar event listeners aos botões
    const signupButton = document.getElementById('signup-button');
    if (signupButton) {
        signupButton.addEventListener('click', signup);
    }

    const loginButton = document.getElementById('login-button');
    if (loginButton) {
        loginButton.addEventListener('click', login);
    }

    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }

    const saveDataButton = document.getElementById('save-data-button');
    if (saveDataButton) {
        saveDataButton.addEventListener('click', saveData);
    }
});
