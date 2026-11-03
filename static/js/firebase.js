import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = JSON.parse(document.getElementById('firebase-config').textContent);
const app = initializeApp(firebaseConfig);

export { app, firebaseConfig };
export const auth = getAuth(app);
export const db = getFirestore(app);

let sessionRenewalTimer;
onAuthStateChanged(auth, (user) => {
    window.clearTimeout(sessionRenewalTimer);
    if (!user) return;

    const renewServerSession = async () => {
        try {
            const idToken = await user.getIdToken(true);
            const response = await fetch('/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ idToken })
            });

            if (response.status === 401 || response.status === 403) {
                await signOut(auth).catch(() => {});
                await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
                window.location.replace('/');
                return;
            }
            if (!response.ok) throw new Error('No se pudo renovar la sesión del servidor.');

            window.dispatchEvent(new Event('firebase-session-renewed'));
            sessionRenewalTimer = window.setTimeout(renewServerSession, 40 * 60 * 1000);
        } catch (error) {
            console.error(error);
            sessionRenewalTimer = window.setTimeout(renewServerSession, 60 * 1000);
        }
    };

    sessionRenewalTimer = window.setTimeout(renewServerSession, 40 * 60 * 1000);
});

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
