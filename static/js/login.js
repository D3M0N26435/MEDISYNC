import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';

const firebaseConfig = JSON.parse(document.getElementById('firebase-config').textContent);
const auth = getAuth(initializeApp(firebaseConfig));
const form = document.getElementById('login-form');
const submitButton = document.getElementById('login-submit');
const result = document.getElementById('resultado');

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    submitButton.textContent = 'Verificando…';
    result.textContent = '';

    try {
        const email = document.getElementById('correo').value.trim();
        const password = document.getElementById('password').value;
        const credential = await signInWithEmailAndPassword(auth, email, password);
        const idToken = await credential.user.getIdToken();
        const response = await fetch('/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ idToken })
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(payload.error || 'No se pudo validar tu cuenta. Inténtalo de nuevo.');
        }

        result.style.color = '#16a34a';
        result.textContent = '¡Acceso concedido! Redirigiendo…';
        window.location.replace(payload.redirect);
    } catch (error) {
        await signOut(auth).catch(() => {});
        result.style.color = '#dc2626';
        result.textContent = error.message || 'Correo o contraseña incorrectos.';
        submitButton.disabled = false;
        submitButton.textContent = 'Acceder al Sistema';
    }
});
