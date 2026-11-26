import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from './firebase.js';

let activeShare = null;

function currentPosition(options = {}) {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 15000,
            ...options
        });
    });
}

export async function startEmergencySharing(card, onError) {
    if (!navigator.geolocation) throw new Error('Este navegador no puede compartir la ubicación.');
    const position = await currentPosition();
    const alertRef = await addDoc(collection(db, 'emergencyAlerts'), {
        cardToken: card.id,
        name: card.name || '',
        bloodType: card.bloodType || '',
        allergies: card.allergies || '',
        chronicConditions: card.chronicConditions || '',
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy || 0,
        status: 'active',
        note: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    let lastSent = Date.now();
    const watchId = navigator.geolocation.watchPosition(
        (update) => {
            const now = Date.now();
            if (now - lastSent < 5000) return;
            lastSent = now;
            updateDoc(doc(db, 'emergencyAlerts', alertRef.id), {
                lat: update.coords.latitude,
                lng: update.coords.longitude,
                accuracy: update.coords.accuracy || 0,
                updatedAt: serverTimestamp()
            }).catch((error) => {
                console.error(error);
                onError?.('Se perdió la conexión al actualizar la ubicación.');
            });
        },
        () => onError?.('No pudimos seguir tu ubicación. Revisa los permisos del navegador.'),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );

    activeShare = { alertRef, watchId };
    return alertRef.id;
}

export async function stopEmergencySharing() {
    if (!activeShare) return;
    navigator.geolocation.clearWatch(activeShare.watchId);
    await updateDoc(doc(db, 'emergencyAlerts', activeShare.alertRef.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp()
    });
    activeShare = null;
}
