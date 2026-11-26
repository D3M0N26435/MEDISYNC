import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { collection, doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { auth, db } from './firebase.js';
import { hasRole } from './roles.js';
import { renderPatientCard } from './patient-card.js';

const $ = (id) => document.getElementById(id);
const alertsContainer = $('dispatcher-alerts');
const feedback = $('dispatcher-feedback');
let alerts = [];

function showFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.className = `admin-feedback visible ${isError ? 'error' : 'success'}`;
}

function dateLabel(value) {
    if (!value) return '—';
    const date = value.toDate ? value.toDate() : new Date(value);
    return date.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
}

function statusLabel(status) {
    return ({ active: 'Activa', resolved: 'Atendida', cancelled: 'Cancelada' })[status] || status || '—';
}

async function changeStatus(alertId, status, note) {
    try {
        await updateDoc(doc(db, 'emergencyAlerts', alertId), {
            status,
            note: String(note || '').slice(0, 300),
            updatedAt: serverTimestamp()
        });
        showFeedback(status === 'resolved' ? 'Alerta marcada como atendida.' : 'Alerta cancelada.');
    } catch (error) {
        console.error(error);
        showFeedback('No se pudo actualizar la alerta. Revisa que las reglas estén desplegadas.', true);
    }
}

function buildAlert(alert) {
    const article = document.createElement('article');
    article.className = `dispatcher-alert status-${alert.status || 'unknown'}`;

    const top = document.createElement('div');
    top.className = 'dispatcher-alert-top';
    const state = document.createElement('span');
    state.className = 'dispatcher-status';
    state.textContent = statusLabel(alert.status);
    const time = document.createElement('span');
    time.textContent = `Apertura: ${dateLabel(alert.createdAt)} · Actualización: ${dateLabel(alert.updatedAt)}`;
    top.append(state, time);

    const cardSlot = document.createElement('div');
    renderPatientCard(cardSlot, alert, { subtitle: 'Tarjeta del asegurado' });

    const location = document.createElement('p');
    location.className = 'dispatcher-location';
    const hasLocation = Number.isFinite(alert.lat) && Number.isFinite(alert.lng);
    location.textContent = hasLocation
        ? `Ubicación: ${alert.lat.toFixed(5)}, ${alert.lng.toFixed(5)} · precisión ${Math.round(alert.accuracy || 0)} m`
        : 'Ubicación no disponible';

    const mapLink = document.createElement('a');
    mapLink.className = 'btn-action secondary';
    mapLink.target = '_blank';
    mapLink.rel = 'noopener';
    mapLink.textContent = 'Ver en el mapa';
    mapLink.href = hasLocation
        ? `https://www.openstreetmap.org/?mlat=${alert.lat}&mlon=${alert.lng}#map=17/${alert.lat}/${alert.lng}`
        : '#';
    mapLink.hidden = !hasLocation;

    const note = document.createElement('input');
    note.type = 'text';
    note.maxLength = 300;
    note.placeholder = 'Nota interna (opcional)';
    note.className = 'dispatcher-note';

    const actions = document.createElement('div');
    actions.className = 'dispatcher-actions';
    if (alert.status === 'active') {
        const resolve = document.createElement('button');
        resolve.type = 'button';
        resolve.className = 'btn-action';
        resolve.textContent = 'Marcar atendida';
        resolve.addEventListener('click', () => changeStatus(alert.id, 'resolved', note.value));
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'btn-action secondary';
        cancel.textContent = 'Cancelar alerta';
        cancel.addEventListener('click', () => changeStatus(alert.id, 'cancelled', note.value));
        actions.append(resolve, cancel);
    }

    article.append(top, cardSlot, location, mapLink, note, actions);
    return article;
}

function renderAlerts() {
    alertsContainer.replaceChildren();
    if (!alerts.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = 'No hay alertas registradas.';
        alertsContainer.append(empty);
        return;
    }
    const sorted = [...alerts].sort((a, b) => {
        if ((a.status === 'active') !== (b.status === 'active')) return a.status === 'active' ? -1 : 1;
        const aTime = a.createdAt?.toMillis?.() || new Date(a.createdAt || 0).getTime();
        const bTime = b.createdAt?.toMillis?.() || new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
    });
    sorted.forEach((alert) => alertsContainer.append(buildAlert(alert)));
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace('/');
        return;
    }
    try {
        const snapshot = await getDoc(doc(db, 'users', user.uid));
        const profile = snapshot.exists() ? snapshot.data() : {};
        if (!hasRole(profile, 'dispatcher') || profile.active === false) {
            window.location.replace('/');
            return;
        }
        onSnapshot(collection(db, 'emergencyAlerts'), (querySnapshot) => {
            alerts = querySnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            renderAlerts();
        }, (error) => {
            console.error(error);
            showFeedback('No se pudieron cargar las alertas.', true);
        });
    } catch (error) {
        console.error(error);
        window.location.replace('/');
    }
});
