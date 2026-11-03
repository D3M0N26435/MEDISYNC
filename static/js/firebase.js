import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = JSON.parse(document.getElementById('firebase-config').textContent);
const app = initializeApp(firebaseConfig);

export { app, firebaseConfig };
export const auth = getAuth(app);
export const db = getFirestore(app);

export async function closeSession() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error('No se pudo cerrar la sesión de Firebase.', error);
    }

    try {
        await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (error) {
        console.error('No se pudo cerrar la sesión del servidor.', error);
    }

    window.location.replace('/');
}
