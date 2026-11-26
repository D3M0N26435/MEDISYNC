import { loadEmergencyCard, renderPatientCard } from './patient-card.js';

const $ = (id) => document.getElementById(id);
const status = $('emergency-status');
const slot = $('emergency-card');

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
        status.textContent = 'Tarjeta verificada.';
        status.classList.remove('error');
        renderPatientCard(slot, card, {
            subtitle: 'Tarjeta de asegurado',
            footer: 'Datos registrados por la administración de MediSync. Última actualización: ' + new Date(card.updatedAt?.toDate?.() || card.updatedAt || Date.now()).toLocaleDateString('es')
        });
    } catch (error) {
        console.error(error);
        status.textContent = 'No se pudo cargar la tarjeta. Revisa tu conexión e inténtalo de nuevo.';
        status.classList.add('error');
    }
}

showCard();
