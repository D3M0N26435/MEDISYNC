import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { auth, db } from './firebase.js';

const $ = (id) => document.getElementById(id);
let locationId = '';
let orders = [];

function textElement(tag, text, className = '') {
    const element = document.createElement(tag);
    element.textContent = text || '';
    if (className) element.className = className;
    return element;
}

function feedback(message, error = false) {
    $('pharmacist-feedback').textContent = message;
    $('pharmacist-feedback').classList.toggle('error', error);
}

function nextOrderAction(status) {
    if (status === 'requested') return { next: 'preparing', label: 'Preparar receta' };
    if (status === 'preparing') return { next: 'ready', label: 'Marcar lista para recoger' };
    if (status === 'ready') return { next: 'picked_up', label: 'Confirmar recogida' };
    return null;
}

function renderOrders() {
    const container = $('pharmacy-orders');
    container.replaceChildren();
    if (!orders.length) {
        container.append(textElement('p', 'No hay solicitudes pendientes en esta farmacia.', 'empty-state'));
        return;
    }
    orders.forEach(({ order, prescription }) => {
        const card = document.createElement('article');
        card.className = 'clinical-card';
        const copy = document.createElement('div');
        copy.className = 'clinical-card-copy';
        copy.append(textElement('h3', prescription?.patientName || 'Paciente'));
        copy.append(textElement('p', `Receta emitida por ${prescription?.doctorName || 'profesional de salud'} · ${prescription?.centerName || ''}`));
        copy.append(textElement('span', order.status === 'picked_up' ? 'Recogida' : order.status === 'ready' ? 'Lista para recoger' : order.status === 'preparing' ? 'En preparación' : order.status === 'rejected' ? 'No disponible' : 'Solicitada', 'order-status'));
        const items = document.createElement('ul');
        items.className = 'order-items';
        (prescription?.items || []).forEach((item) => {
            items.append(textElement('li', `${item.name || 'Medicamento'} · ${item.instructions || ''}`));
        });
        copy.append(items);
        card.append(copy);
        const action = nextOrderAction(order.status);
        if (action) {
            const button = textElement('button', action.label, 'btn-action');
            button.type = 'button';
            button.dataset.orderId = order.id;
            button.dataset.nextStatus = action.next;
            card.append(button);
        }
        container.append(card);
    });
}

async function loadOrders(user) {
    const profile = await getDoc(doc(db, 'users', user.uid));
    const userData = profile.exists() ? profile.data() : {};
    if (userData.role !== 'pharmacist' || userData.active === false) {
        window.location.replace('/');
        return;
    }
    locationId = userData.locationId || '';
    if (!locationId) {
        $('pharmacy-location-label').textContent = 'Tu cuenta no tiene una farmacia asignada.';
        orders = [];
        renderOrders();
        return;
    }
    const location = await getDoc(doc(db, 'locations', locationId));
    $('pharmacy-location-label').textContent = location.exists()
        ? `${location.data().name} · ${location.data().address}`
        : 'Farmacia asignada';

    const snapshot = await getDocs(query(collection(db, 'prescriptionOrders'), where('pharmacyId', '==', locationId)));
    orders = await Promise.all(snapshot.docs.map(async (item) => {
        const order = { id: item.id, ...item.data() };
        try {
            const prescriptionSnapshot = await getDoc(doc(db, 'prescriptions', order.prescriptionId));
            return { order, prescription: prescriptionSnapshot.exists() ? prescriptionSnapshot.data() : null };
        } catch (error) {
            console.error(error);
            return { order, prescription: null };
        }
    }));
    renderOrders();
}

async function updateOrder(event) {
    const button = event.target.closest('[data-order-id]');
    if (!button) return;
    button.disabled = true;
    try {
        await updateDoc(doc(db, 'prescriptionOrders', button.dataset.orderId), {
            status: button.dataset.nextStatus,
            updatedAt: serverTimestamp()
        });
        feedback('Estado de la solicitud actualizado.');
        await loadOrders(auth.currentUser);
    } catch (error) {
        console.error(error);
        feedback('No se pudo actualizar la solicitud. Verifica la farmacia asignada y las reglas de Firestore.', true);
        button.disabled = false;
    }
}

$('pharmacy-orders').addEventListener('click', updateOrder);
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace('/');
        return;
    }
    try {
        await loadOrders(user);
    } catch (error) {
        console.error(error);
        feedback('No se pudieron cargar las solicitudes. Comprueba tu conexión y las reglas de Firestore.', true);
    }
});
