import { loadEmergencyCard, renderPatientCard } from './patient-card.js';
import { startEmergencySharing, stopEmergencySharing } from './emergency-alerts.js';

const $ = (id) => document.getElementById(id);
const status = $('emergency-status');
const slot = $('emergency-card');
const actions = $('emergency-actions');
const locationStatus = $('emergency-location-status');
const confirmDialog = $('emergency-confirm-dialog');
const sendButton = $('emergency-location-button');
const stopButton = $('emergency-stop-button');
let currentCard = null;

function setLocationStatus(message, isError = false) {
    locationStatus.textContent = message;
    locationStatus.classList.toggle('error', isError);
}

async function sendLocation() {
    sendButton.disabled = true;
    setLocationStatus('Obteniendo tu ubicación…');
    try {
        await startEmergencySharing(currentCard, (message) => setLocationStatus(message, true));
        setLocationStatus('Ubicación enviada. El equipo de despacho ya puede verla.');
        sendButton.hidden = true;
        stopButton.hidden = false;
    } catch (error) {
        console.error(error);
        setLocationStatus(error.message || 'No se pudo compartir la ubicación. Revisa los permisos e inténtalo de nuevo.', true);
        sendButton.disabled = false;
    }
}

function bindActions() {
    $('emergency-confirm-close').addEventListener('click', () => confirmDialog.close());
    $('emergency-confirm-cancel').addEventListener('click', () => confirmDialog.close());
    sendButton.addEventListener('click', () => confirmDialog.showModal());
    $('emergency-confirm-send').addEventListener('click', () => {
        confirmDialog.close();
        sendLocation();
    });
    stopButton.addEventListener('click', async () => {
        stopButton.disabled = true;
        try {
            await stopEmergencySharing();
            setLocationStatus('Se detuvo el envío de ubicación.');
            sendButton.hidden = false;
            stopButton.hidden = true;
        } catch (error) {
            console.error(error);
            setLocationStatus('No se pudo detener el envío. Recarga la página.', true);
        } finally {
            stopButton.disabled = false;
        }
    });
    window.addEventListener('pagehide', () => { stopEmergencySharing().catch(() => {}); });
}

async function showCard() {
    const token = new URLSearchParams(window.location.search).get('t') || '';
    if (!token) {
        status.textContent = 'Este enlace no incluye una tarjeta. Pide al asegurado que comparta su código QR.';
        status.classList.add('error');
        return;
    }
    try {
        const card = await loadEmergencyCard(token);
        if (!card || card.active === false) {
            status.textContent = 'La tarjeta no está disponible o fue desactivada.';
            status.classList.add('error');
            slot.replaceChildren();
            return;
        }
        currentCard = card;
        status.textContent = 'Tarjeta verificada.';
        status.classList.remove('error');
        renderPatientCard(slot, card, {
            subtitle: 'Tarjeta de asegurado',
            footer: 'Datos registrados por la administración de MediSync. Última actualización: ' + new Date(card.updatedAt?.toDate?.() || card.updatedAt || Date.now()).toLocaleDateString('es')
        });
        actions.hidden = false;
        bindActions();
    } catch (error) {
        console.error(error);
        status.textContent = 'No se pudo cargar la tarjeta. Revisa tu conexión e inténtalo de nuevo.';
        status.classList.add('error');
    }
}

showCard();
