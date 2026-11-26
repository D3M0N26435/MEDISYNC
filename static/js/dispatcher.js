import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { collection, doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { auth, db } from './firebase.js';
import { hasRole } from './roles.js';
import { renderPatientCard } from './patient-card.js';
import { attachMapTools } from './map-utils.js';

const $ = (id) => document.getElementById(id);
const alertsContainer = $('dispatcher-alerts');
const feedback = $('dispatcher-feedback');
const views = new Map();

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

function hasLocation(alert) {
    return Number.isFinite(alert.lat) && Number.isFinite(alert.lng);
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
    article.className = 'dispatcher-alert';

    const top = document.createElement('div');
    top.className = 'dispatcher-alert-top';
    const state = document.createElement('span');
    state.className = 'dispatcher-status';
    const time = document.createElement('span');
    top.append(state, time);

    const cardSlot = document.createElement('div');
    renderPatientCard(cardSlot, alert, { subtitle: 'Tarjeta del asegurado' });

    const mapSlot = document.createElement('div');
    mapSlot.className = 'dispatcher-map';
    mapSlot.setAttribute('aria-label', 'Mapa de la ubicación de la alerta');

    const location = document.createElement('p');
    location.className = 'dispatcher-location';

    const note = document.createElement('input');
    note.type = 'text';
    note.maxLength = 300;
    note.placeholder = 'Nota interna (opcional)';
    note.className = 'dispatcher-note';

    const actions = document.createElement('div');
    actions.className = 'dispatcher-actions';

    article.append(top, cardSlot, mapSlot, location, note, actions);

    return {
        id: alert.id,
        article,
        state,
        time,
        mapSlot,
        location,
        note,
        actions,
        status: null,
        lat: null,
        lng: null,
        name: '',
        map: null,
        marker: null,
        accuracyCircle: null,
        tools: null,
        toolsContainer: null
    };
}

function initMap(view) {
    if (view.map || !window.L) return;
    view.map = L.map(view.mapSlot, { scrollWheelZoom: false, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
    }).addTo(view.map);
    view.marker = L.marker([view.lat, view.lng], { title: 'Ubicación de la alerta' }).addTo(view.map);
    view.tools = attachMapTools({
        map: view.map,
        getDestination: () => ({ lat: view.lat, lng: view.lng, name: view.name })
    });
    const toolsContainer = view.mapSlot.nextElementSibling;
    if (toolsContainer?.classList.contains('map-tools')) view.toolsContainer = toolsContainer;
}

function updateActions(view, alert) {
    if (view.status === alert.status) return;
    view.status = alert.status;
    view.actions.replaceChildren();
    if (alert.status !== 'active') return;

    const resolve = document.createElement('button');
    resolve.type = 'button';
    resolve.className = 'btn-action';
    resolve.textContent = 'Marcar atendida';
    resolve.addEventListener('click', () => changeStatus(alert.id, 'resolved', view.note.value));

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn-action secondary';
    cancel.textContent = 'Cancelar alerta';
    cancel.addEventListener('click', () => changeStatus(alert.id, 'cancelled', view.note.value));

    view.actions.append(resolve, cancel);
}

function updateMap(view, alert) {
    view.mapSlot.hidden = !hasLocation(alert);
    if (view.toolsContainer) view.toolsContainer.hidden = !hasLocation(alert);
    if (!hasLocation(alert)) return;

    const previousLat = view.lat;
    const previousLng = view.lng;
    view.lat = alert.lat;
    view.lng = alert.lng;
    view.name = alert.name || 'Persona sin seguro';

    if (!view.map) {
        initMap(view);
        view.map.setView([view.lat, view.lng], 16);
    } else {
        const moved = Math.abs(alert.lat - previousLat) > 0.00005
            || Math.abs(alert.lng - previousLng) > 0.00005;
        if (moved) view.map.panTo([view.lat, view.lng]);
    }

    const position = [view.lat, view.lng];
    view.marker.setLatLng(position);
    view.marker.bindPopup(`Ubicación de ${view.name}<br>Actualizada: ${dateLabel(alert.updatedAt)}`);

    const radius = Math.max(Number(alert.accuracy) || 0, 10);
    if (view.accuracyCircle) {
        view.accuracyCircle.setLatLng(position);
        view.accuracyCircle.setRadius(radius);
    } else {
        view.accuracyCircle = L.circle(position, {
            radius,
            color: '#2dd4bf',
            weight: 1,
            fillColor: '#2dd4bf',
            fillOpacity: 0.1
        }).addTo(view.map);
    }
}

function updateView(view, alert) {
    view.article.className = `dispatcher-alert status-${alert.status || 'unknown'}`;
    view.state.textContent = statusLabel(alert.status);
    view.time.textContent = `Apertura: ${dateLabel(alert.createdAt)} · Actualización: ${dateLabel(alert.updatedAt)}`;
    view.location.textContent = hasLocation(alert)
        ? `Ubicación: ${alert.lat.toFixed(5)}, ${alert.lng.toFixed(5)} · precisión ${Math.round(alert.accuracy || 0)} m`
        : 'Ubicación no disponible';
    if (document.activeElement !== view.note) view.note.value = alert.note || '';
    updateActions(view, alert);
    updateMap(view, alert);
}

function renderAlerts(list) {
    if (!list.length) {
        views.forEach((view) => view.map?.remove());
        views.clear();
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = 'No hay alertas registradas.';
        alertsContainer.replaceChildren(empty);
        return;
    }

    const activeIds = new Set(list.map((alert) => alert.id));
    views.forEach((view, id) => {
        if (!activeIds.has(id)) {
            view.map?.remove();
            views.delete(id);
        }
    });

    list.forEach((alert) => {
        let view = views.get(alert.id);
        if (!view) {
            view = buildAlert(alert);
            views.set(alert.id, view);
            alertsContainer.append(view.article);
        }
        updateView(view, alert);
        // Reordena sin destruir el mapa ni perder la ruta dibujada.
        alertsContainer.append(view.article);
    });
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
            const alerts = querySnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            alerts.sort((a, b) => {
                if ((a.status === 'active') !== (b.status === 'active')) return a.status === 'active' ? -1 : 1;
                const aTime = a.createdAt?.toMillis?.() || new Date(a.createdAt || 0).getTime();
                const bTime = b.createdAt?.toMillis?.() || new Date(b.createdAt || 0).getTime();
                return bTime - aTime;
            });
            renderAlerts(alerts);
        }, (error) => {
            console.error(error);
            showFeedback('No se pudieron cargar las alertas.', true);
        });
    } catch (error) {
        console.error(error);
        window.location.replace('/');
    }
});
