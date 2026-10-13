import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "{{apiKey}}",
    authDomain: "{{authDomain}}",
    projectId: "{{projectId}}",
    storageBucket: "{{storageBucket}}",
    messagingSenderId: "{{messagingSenderId}}",
    appId: "{{appId}}"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Función para manejar el login cuando el usuario presiona el botón de iniciar sesión
window.ejecutarLogin = async function(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Consultar el rol del usuario en Firestore
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        let rol = "patient"; // Rol por defecto si no se encuentra
        if (userSnap.exists()) {
            rol = userSnap.data().role || "patient";
        }

        // Redirección exacta según la nueva estructura de rutas en app.py
        if (rol === 'admin') {
            window.location.href = "/admin";
        } else if (rol === 'doctor') {
            window.location.href = "/doctor";
        } else if (rol === 'pharmacist') {
            window.location.href = "/pharmacist";
        } else {
            window.location.href = "/patient";
        }

    } catch (error) {// Después de iniciar sesión exitosamente con Firebase Auth:
const userRef = doc(db, "users", user.uid);
const userSnap = await getDoc(userRef);

let rol = "patient"; // por defecto
if (userSnap.exists()) {
    rol = userSnap.data().role || "patient";
}

// Redirección exacta según el rol
if (rol === 'admin') {
    window.location.href = "/admin";
} else if (rol === 'doctor') {
    window.location.href = "/doctor";
} else if (rol === 'pharmacist') {
    window.location.href = "/pharmacist";
} else {
    window.location.href = "/patient";
}
        alert("Error al iniciar sesión: " + error.message);
    }
}