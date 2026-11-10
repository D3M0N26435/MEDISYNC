import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    updateDoc,
    where
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { auth, db } from './firebase.js';
import { attachMedicationAutocomplete, medicationDisplayName } from './medication-autocomplete.js';

const $ = (id) => document.getElementById(id);
const tabTitles = {
    venta: 'Venta directa',
    asegurados: 'Asegurados',
    medicamentos: 'Medicamentos'
};
const orderStatusLabels = {
    requested: 'Solicitada',
    preparing: 'En preparación',
    ready: 'Lista para recoger',
    picked_up: 'Recogida',
    rejected: 'No disponible'
};
const orderActions = {
    requested: [
        { next: 'preparing', label: 'Preparar receta', primary: true },
        { next: 'rejected', label: 'No disponible' }
    ],
    preparing: [
        { next: 'ready', label: 'Marcar lista para recoger', primary: true },
        { next: 'rejected', label: 'No disponible' }
    ],
    ready: [
        { next: 'picked_up', label: 'Confirmar recogida', primary: true }
    ]
};
const paymentLabels = { cash: 'Efectivo', card: 'Tarjeta', qr: 'QR', other: 'Otro' };

let currentUser = null;
let currentProfile = {};
let locationId = '';
let orders = [];
let sales = [];
let patients = [];
let medications = [];
let selectedPatient = null;
let editingMedicationId = null;
let saleRowSequence = 0;

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

function formatMoney(value) {
    const amount = Number(value);
    return `Bs ${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
}

function formatDateTime(value) {
    if (!value) return 'Fecha no registrada';
    const date = value.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Fecha no registrada';
    return date.toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' });
}

function normalize(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function patientDocument(patient) {
    return String(
        patient.carnet
        || patient.carnetIdentidad
        || patient.cedula
        || patient.documento
        || patient.documentNumber
        || patient.ci
        || patient.dni
        || ''
    ).trim();
}

function patientName(patient) {
    return patient.name || patient.displayName || 'Paciente registrado';
}

function activateTab(name) {
    if (!tabTitles[name]) return;
    document.querySelectorAll('[data-pharmacist-tab]').forEach((tab) => {
        const selected = tab.dataset.pharmacistTab === name;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-selected', String(selected));
    });
    document.querySelectorAll('.pharmacist-panel').forEach((panel) => {
        const selected = panel.id === `pharmacist-panel-${name}`;
        panel.hidden = !selected;
        panel.classList.toggle('active', selected);
    });
    $('pharmacist-page-title').textContent = tabTitles[name];
    history.replaceState(null, '', `#${name}`);
}

function activeMedications() {
    return medications.filter((medication) => medication.active !== false);
}

function addSaleItemRow(item = {}) {
    const row = document.createElement('div');
    row.className = 'sale-item-row';

    const rowId = ++saleRowSequence;
    const nameField = document.createElement('div');
    nameField.className = 'sale-product-field';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Producto';
    nameLabel.htmlFor = `sale-product-name-${rowId}`;
    const name = document.createElement('input');
    name.type = 'text';
    name.id = `sale-product-name-${rowId}`;
    name.maxLength = 160;
    name.placeholder = 'Escribe o elige un producto';
    name.dataset.saleName = '';
    name.value = item.name || '';
    nameField.append(nameLabel, name);

    const quantityLabel = document.createElement('label');
    quantityLabel.textContent = 'Cantidad';
    const quantity = document.createElement('input');
    quantity.type = 'number';
    quantity.min = '1';
    quantity.step = '1';
    quantity.inputMode = 'numeric';
    quantity.dataset.saleQuantity = '';
    quantity.value = String(item.quantity || 1);
    quantityLabel.append(quantity);

    const priceLabel = document.createElement('label');
    priceLabel.textContent = 'Precio unitario';
    const price = document.createElement('input');
    price.type = 'number';
    price.min = '0';
    price.step = '0.01';
    price.inputMode = 'decimal';
    price.dataset.salePrice = '';
    price.value = item.unitPrice ?? '';
    priceLabel.append(price);

    const subtotal = textElement('span', formatMoney(item.subtotal || 0), 'sale-item-subtotal');

    const remove = textElement('button', '−', 'icon-button remove-sale-item');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Quitar producto');

    attachMedicationAutocomplete({
        input: name,
        getMedications: activeMedications,
        onSelect: (medication) => {
            name.value = medicationDisplayName(medication);
            price.value = medication.unitPrice ?? '';
            row.dataset.medicationId = medication.id;
            updateSaleTotals();
        },
        onInput: () => {
            const hadMedication = Boolean(row.dataset.medicationId);
            row.dataset.medicationId = '';
            const typed = normalize(name.value);
            const candidates = activeMedications();
            const byName = candidates.filter((medication) => normalize(medication.name) === typed);
            const exact = candidates.find((medication) => normalize(medicationDisplayName(medication)) === typed)
                || (byName.length === 1 ? byName[0] : null);
            if (exact) {
                price.value = exact.unitPrice ?? '';
                row.dataset.medicationId = exact.id;
            } else if (hadMedication) {
                price.value = '';
            }
        },
        getMeta: (medication) => [medication.presentation || '', formatMoney(medication.unitPrice)].filter(Boolean).join(' · '),
        ariaLabel: 'Sugerencias de productos'
    });

    row.append(nameField, quantityLabel, priceLabel, subtotal, remove);
    $('sale-items').append(row);
    updateSaleTotals();
}

function updateSaleTotals() {
    let total = 0;
    document.querySelectorAll('.sale-item-row').forEach((row) => {
        const quantity = Number(row.querySelector('[data-sale-quantity]').value) || 0;
        const unitPrice = Number(row.querySelector('[data-sale-price]').value) || 0;
        const subtotal = Math.round(quantity * unitPrice * 100) / 100;
        row.querySelector('.sale-item-subtotal').textContent = formatMoney(subtotal);
        total += subtotal;
    });
    $('sale-total').textContent = formatMoney(Math.round(total * 100) / 100);
}

function resetSaleForm() {
    $('sale-form').reset();
    $('sale-items').replaceChildren();
    addSaleItemRow();
}

function renderSales() {
    const container = $('sales-list');
    container.replaceChildren();
    const recent = [...sales]
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 20);
    if (!recent.length) {
        container.append(textElement('p', 'Todavía no hay ventas registradas en esta farmacia.', 'empty-state'));
        return;
    }

    recent.forEach((sale) => {
        const card = document.createElement('article');
        card.className = 'clinical-card pharmacist-sale-record';
        const copy = document.createElement('div');
        copy.className = 'clinical-card-copy';
        copy.append(textElement('h3', sale.customerName || 'Consumidor final'));
        const items = (sale.items || []).map((item) => `${item.quantity}× ${item.name}`).join(' · ');
        copy.append(textElement('p', items || 'Sin detalle de productos'));
        copy.append(textElement('p', `${formatDateTime(sale.createdAt)} · ${paymentLabels[sale.paymentMethod] || sale.paymentMethod || 'Pago no registrado'}`));
        if (sale.customerDocument) copy.append(textElement('p', `Documento: ${sale.customerDocument}`));
        if (sale.notes) copy.append(textElement('p', `Nota: ${sale.notes}`));
        card.append(copy, textElement('strong', formatMoney(sale.total), 'sale-record-total'));
        container.append(card);
    });
}

function renderPatientResults() {
    const container = $('patient-search-results');
    container.replaceChildren();
    const term = normalize($('patient-search').value);
    if (term.length < 2) {
        $('patient-search-status').textContent = 'Escribe al menos 2 caracteres para buscar.';
        return;
    }

    const terms = term.split(/\s+/).filter(Boolean);
    const matches = patients
        .filter((patient) => {
            const haystack = normalize(
                `${patientName(patient)} ${patient.email || ''} ${patientDocument(patient)}`
            );
            return terms.every((part) => haystack.includes(part));
        })
        .sort((a, b) => patientName(a).localeCompare(patientName(b), 'es'));

    if (!matches.length) {
        $('patient-search-status').textContent = 'No se encontró un asegurado con ese carnet, correo o nombre.';
        return;
    }

    $('patient-search-status').textContent = matches.length === 1
        ? '1 asegurado encontrado.'
        : `${matches.length} asegurados encontrados.`;

    matches.slice(0, 20).forEach((patient) => {
        const card = document.createElement('article');
        card.className = 'pharmacist-patient-result';
        const copy = document.createElement('div');
        copy.className = 'clinical-card-copy';
        copy.append(textElement('h3', patientName(patient)));
        copy.append(textElement('p', patient.email || 'Sin correo registrado'));
        copy.append(textElement('p', patientDocument(patient) ? `Carnet: ${patientDocument(patient)}` : 'Sin carnet registrado'));
        const count = orders.filter(({ order }) => order.patientId === patient.id).length;
        copy.append(textElement('p', count === 1 ? '1 solicitud en esta farmacia' : `${count} solicitudes en esta farmacia`));
        const button = textElement('button', 'Ver solicitudes', 'btn-action');
        button.type = 'button';
        button.dataset.patientId = patient.id;
        card.append(copy, button);
        container.append(card);
    });
}

function selectPatient(patientId) {
    const patient = patients.find((item) => item.id === patientId);
    if (!patient) return;
    selectedPatient = patient;
    $('patient-orders-section').hidden = false;
    $('selected-patient-name').textContent = patientName(patient);
    const document = patientDocument(patient);
    $('selected-patient-info').textContent = [
        patient.email || '',
        document ? `Carnet ${document}` : ''
    ].filter(Boolean).join(' · ') || 'Sin datos de contacto registrados';
    renderSelectedPatientOrders();
    $('patient-orders-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearPatientSelection() {
    selectedPatient = null;
    $('patient-orders-section').hidden = true;
    $('pharmacy-orders').replaceChildren();
}

function renderSelectedPatientOrders() {
    const container = $('pharmacy-orders');
    container.replaceChildren();
    if (!selectedPatient) return;

    const statusPriority = { requested: 0, preparing: 1, ready: 2, picked_up: 3, rejected: 4 };
    const selectedOrders = orders
        .filter(({ order }) => order.patientId === selectedPatient.id)
        .sort((a, b) =>
            (statusPriority[a.order.status] ?? 5) - (statusPriority[b.order.status] ?? 5)
            || (b.order.createdAt?.seconds || 0) - (a.order.createdAt?.seconds || 0)
        );

    if (!selectedOrders.length) {
        container.append(textElement('p', 'Este asegurado no tiene solicitudes de receta en esta farmacia.', 'empty-state'));
        return;
    }

    selectedOrders.forEach(({ order, prescription }) => {
        const card = document.createElement('article');
        card.className = 'clinical-card pharmacist-order-card';
        const copy = document.createElement('div');
        copy.className = 'clinical-card-copy';
        copy.append(textElement('h3', prescription?.patientName || patientName(selectedPatient)));
        copy.append(textElement('p', `Receta de ${prescription?.doctorName || 'profesional de salud'} · ${prescription?.centerName || 'Centro de salud'}`));
        copy.append(textElement('span', orderStatusLabels[order.status] || order.status || 'Estado desconocido', `order-status ${order.status || ''}`));

        const items = document.createElement('ul');
        items.className = 'order-items';
        (prescription?.items || []).forEach((item) => {
            items.append(textElement('li', `${item.name || 'Medicamento'}${item.instructions ? ` · ${item.instructions}` : ''}`));
        });
        copy.append(items);
        if (prescription?.notes) copy.append(textElement('p', `Indicaciones: ${prescription.notes}`));
        copy.append(textElement('p', `Solicitada: ${formatDateTime(order.createdAt)}`));

        const actions = document.createElement('div');
        actions.className = 'pharmacist-order-actions';
        (orderActions[order.status] || []).forEach((action) => {
            const button = textElement('button', action.label, action.primary ? 'btn-action' : 'btn-action secondary');
            button.type = 'button';
            button.dataset.orderId = order.id;
            button.dataset.nextStatus = action.next;
            actions.append(button);
        });
        if (actions.childElementCount) copy.append(actions);

        card.append(copy);
        container.append(card);
    });
}

function renderMedicationList() {
    const container = $('medications-list');
    container.replaceChildren();
    const terms = normalize($('medication-search').value).split(/\s+/).filter(Boolean);
    const matches = medications.filter((medication) => {
        if (!terms.length) return true;
        const haystack = normalize(`${medication.name || ''} ${medication.presentation || ''}`);
        return terms.every((part) => haystack.includes(part));
    });

    if (!medications.length) {
        $('medication-list-status').textContent = 'Todavía no hay medicamentos registrados en esta farmacia.';
        container.append(textElement('p', 'Usa el formulario para añadir el primero.', 'empty-state'));
        return;
    }
    if (!matches.length) {
        $('medication-list-status').textContent = 'No se encontraron medicamentos con ese nombre o presentación.';
        container.append(textElement('p', 'Prueba con otra búsqueda.', 'empty-state'));
        return;
    }

    $('medication-list-status').textContent = terms.length
        ? `${matches.length} de ${medications.length} medicamentos.`
        : `${medications.length} medicamentos registrados.`;

    matches.forEach((medication) => {
        const card = document.createElement('article');
        card.className = 'clinical-card pharmacist-medication-card';
        const copy = document.createElement('div');
        copy.className = 'clinical-card-copy';
        copy.append(textElement('h3', medication.name || 'Medicamento sin nombre'));
        copy.append(textElement('p', medication.presentation || 'Sin presentación'));
        copy.append(textElement('p', `Precio unitario: ${formatMoney(medication.unitPrice)}`));
        const active = medication.active !== false;
        copy.append(textElement('span', active ? 'Disponible' : 'Inactivo', `order-status ${active ? 'ready' : 'picked_up'}`));

        const actions = document.createElement('div');
        actions.className = 'pharmacist-medication-actions';
        const edit = textElement('button', 'Editar', 'btn-action secondary');
        edit.type = 'button';
        edit.dataset.editMedication = medication.id;
        const remove = textElement('button', 'Eliminar', 'btn-action secondary medication-delete');
        remove.type = 'button';
        remove.dataset.deleteMedication = medication.id;
        actions.append(edit, remove);

        card.append(copy, actions);
        container.append(card);
    });
}

function resetMedicationForm() {
    editingMedicationId = null;
    $('medication-form').reset();
    $('medication-status').value = 'active';
    $('medication-form-title').textContent = 'Nuevo medicamento';
    $('medication-submit').textContent = 'Guardar medicamento';
    $('medication-cancel').hidden = true;
}

function startEditMedication(id) {
    const medication = medications.find((item) => item.id === id);
    if (!medication) return;
    editingMedicationId = id;
    $('medication-name').value = medication.name || '';
    $('medication-presentation').value = medication.presentation || '';
    $('medication-price').value = medication.unitPrice ?? '';
    $('medication-status').value = medication.active === false ? 'inactive' : 'active';
    $('medication-form-title').textContent = 'Editar medicamento';
    $('medication-submit').textContent = 'Guardar cambios';
    $('medication-cancel').hidden = false;
    $('medication-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('medication-name').focus();
}

async function saveMedication(event) {
    event.preventDefault();
    if (!currentUser || !locationId) {
        feedback('Tu cuenta no tiene una farmacia asignada.', true);
        return;
    }

    const name = $('medication-name').value.trim();
    const presentation = $('medication-presentation').value.trim();
    const unitPrice = Math.round(Number.parseFloat($('medication-price').value) * 100) / 100;
    const active = $('medication-status').value === 'active';

    if (!name) {
        feedback('Escribe el nombre del medicamento.', true);
        $('medication-name').focus();
        return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        feedback('Escribe un precio válido para el medicamento.', true);
        $('medication-price').focus();
        return;
    }

    const duplicate = medications.some((medication) => medication.id !== editingMedicationId
        && normalize(medication.name) === normalize(name)
        && normalize(medication.presentation || '') === normalize(presentation));
    if (duplicate) {
        feedback('Ya existe un medicamento con ese nombre y presentación.', true);
        return;
    }

    const wasEditing = Boolean(editingMedicationId);
    const submit = $('medication-submit');
    submit.disabled = true;
    feedback(wasEditing ? 'Guardando cambios…' : 'Guardando medicamento…');

    try {
        if (wasEditing) {
            await updateDoc(doc(db, 'medications', editingMedicationId), {
                name,
                presentation,
                unitPrice,
                active,
                updatedAt: serverTimestamp()
            });
        } else {
            await addDoc(collection(db, 'medications'), {
                pharmacyId: locationId,
                name,
                presentation,
                unitPrice,
                active,
                createdBy: currentUser.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }
    } catch (error) {
        console.error(error);
        feedback('No se pudo guardar el medicamento. Comprueba las reglas de Firestore e inténtalo de nuevo.', true);
        submit.disabled = false;
        return;
    }

    resetMedicationForm();
    feedback(wasEditing ? 'Medicamento actualizado.' : 'Medicamento añadido al catálogo.');
    try {
        await loadMedications();
    } catch (error) {
        console.error(error);
        feedback('Medicamento guardado, pero no se pudo actualizar la lista. Recarga la página para verlo.', true);
    } finally {
        submit.disabled = false;
    }
}

async function removeMedication(id) {
    const medication = medications.find((item) => item.id === id);
    if (!medication) return;
    if (!window.confirm(`¿Eliminar "${medication.name || 'este medicamento'}" del catálogo? Las ventas ya registradas no cambian.`)) return;

    feedback('Eliminando medicamento…');
    try {
        await deleteDoc(doc(db, 'medications', id));
    } catch (error) {
        console.error(error);
        feedback('No se pudo eliminar el medicamento. Comprueba las reglas de Firestore e inténtalo de nuevo.', true);
        return;
    }

    if (editingMedicationId === id) resetMedicationForm();
    feedback('Medicamento eliminado del catálogo.');
    try {
        await loadMedications();
    } catch (error) {
        console.error(error);
        feedback('Medicamento eliminado, pero no se pudo actualizar la lista. Recarga la página para verlo.', true);
    }
}

async function loadMedications() {
    if (!locationId) {
        medications = [];
        renderMedicationList();
        return;
    }
    const snapshot = await getDocs(query(collection(db, 'medications'), where('pharmacyId', '==', locationId)));
    medications = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
    if (editingMedicationId && !medications.some((medication) => medication.id === editingMedicationId)) {
        resetMedicationForm();
    }
    renderMedicationList();
}

async function loadOrders() {
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
    renderSelectedPatientOrders();
    renderPatientResults();
}

async function loadSales() {
    const snapshot = await getDocs(query(collection(db, 'pharmacySales'), where('pharmacyId', '==', locationId)));
    sales = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderSales();
}

async function loadPatients() {
    const snapshot = await getDocs(query(collection(db, 'users'), where('role', '==', 'patient')));
    patients = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => patientName(a).localeCompare(patientName(b), 'es'));
    renderPatientResults();
}

async function loadPharmacistData(user) {
    const profile = await getDoc(doc(db, 'users', user.uid));
    const userData = profile.exists() ? profile.data() : {};
    if (userData.role !== 'pharmacist' || userData.active === false) {
        window.location.replace('/');
        return;
    }

    currentUser = user;
    currentProfile = userData;
    locationId = userData.locationId || '';
    if (!locationId) {
        $('pharmacy-location-label').textContent = 'Tu cuenta no tiene una farmacia asignada.';
        orders = [];
        sales = [];
        patients = [];
        medications = [];
        renderSales();
        renderSelectedPatientOrders();
        renderPatientResults();
        renderMedicationList();
        $('medication-list-status').textContent = 'Tu cuenta no tiene una farmacia asignada.';
        $('medications-list').replaceChildren(textElement('p', 'No se puede gestionar el catálogo sin una farmacia asignada.', 'empty-state'));
        return;
    }

    const location = await getDoc(doc(db, 'locations', locationId));
    const locationData = location.exists() ? location.data() : {};
    $('pharmacy-location-label').textContent = [
        locationData.name || '',
        locationData.address || ''
    ].filter(Boolean).join(' · ') || 'Farmacia asignada';

    const results = await Promise.allSettled([loadOrders(), loadSales(), loadPatients(), loadMedications()]);
    const [ordersResult, salesResult, patientsResult, medicationsResult] = results;
    if (ordersResult.status === 'rejected') {
        console.error(ordersResult.reason);
        feedback('No se pudieron cargar las solicitudes de receta.', true);
    }
    if (salesResult.status === 'rejected') {
        console.error(salesResult.reason);
        feedback('No se pudieron cargar las ventas registradas.', true);
    }
    if (patientsResult.status === 'rejected') {
        console.error(patientsResult.reason);
        patients = [];
        renderPatientResults();
        feedback('No se pudo cargar el buscador de asegurados. Comprueba que las reglas de Firestore estén desplegadas.', true);
    }
    if (medicationsResult.status === 'rejected') {
        console.error(medicationsResult.reason);
        medications = [];
        $('medication-list-status').textContent = 'No se pudo cargar el catálogo de medicamentos.';
        $('medications-list').replaceChildren(textElement('p', 'Comprueba que las reglas de Firestore estén desplegadas y recarga la página.', 'empty-state'));
        feedback('No se pudo cargar el catálogo de medicamentos. Comprueba que las reglas de Firestore estén desplegadas.', true);
    }
}

async function saveSale(event) {
    event.preventDefault();
    if (!currentUser || !locationId) {
        feedback('Tu cuenta no tiene una farmacia asignada.', true);
        return;
    }

    const rows = [...document.querySelectorAll('.sale-item-row')].map((row) => ({
        name: row.querySelector('[data-sale-name]').value.trim(),
        quantity: Number.parseInt(row.querySelector('[data-sale-quantity]').value, 10),
        unitPrice: Number.parseFloat(row.querySelector('[data-sale-price]').value)
    })).filter((item) => item.name);

    if (!rows.length) {
        feedback('Añade al menos un producto a la venta.', true);
        return;
    }
    if (rows.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
        feedback('Revisa la cantidad y el precio de cada producto.', true);
        return;
    }

    const items = rows.map((item) => ({
        ...item,
        subtotal: Math.round(item.quantity * item.unitPrice * 100) / 100
    }));
    const total = Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
    const submit = $('sale-submit');
    submit.disabled = true;
    feedback('Registrando la venta…');

    try {
        await addDoc(collection(db, 'pharmacySales'), {
            pharmacyId: locationId,
            pharmacistId: currentUser.uid,
            pharmacistName: currentProfile.name || currentUser.displayName || 'Farmacéutico',
            customerName: $('sale-customer-name').value.trim() || 'Consumidor final',
            customerDocument: $('sale-customer-document').value.trim(),
            items,
            total,
            paymentMethod: $('sale-payment').value,
            notes: $('sale-notes').value.trim(),
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.error(error);
        feedback('No se pudo registrar la venta. Comprueba las reglas de Firestore e inténtalo de nuevo.', true);
        submit.disabled = false;
        return;
    }

    resetSaleForm();
    feedback('Venta registrada correctamente.');
    try {
        await loadSales();
    } catch (error) {
        console.error(error);
        feedback('Venta registrada, pero no se pudo actualizar la lista. Recarga la página para verla.', true);
    } finally {
        submit.disabled = false;
    }
}

async function updateOrder(event) {
    const button = event.target.closest('[data-order-id]');
    if (!button) return;
    const { orderId, nextStatus } = button.dataset;
    if (!orderId || !nextStatus) return;
    if (nextStatus === 'rejected' && !window.confirm('¿Marcar esta solicitud como no disponible?')) return;
    if (nextStatus === 'picked_up' && !window.confirm('¿Confirmar que el asegurado retiró la receta?')) return;

    button.disabled = true;
    feedback('Actualizando la solicitud…');
    try {
        await updateDoc(doc(db, 'prescriptionOrders', orderId), {
            status: nextStatus,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error(error);
        feedback('No se pudo actualizar la solicitud. Verifica la farmacia asignada y las reglas de Firestore.', true);
        button.disabled = false;
        return;
    }

    feedback('Solicitud actualizada.');
    try {
        await loadOrders();
    } catch (error) {
        console.error(error);
        button.disabled = false;
        feedback('Solicitud actualizada, pero no se pudo refrescar la lista. Recarga la página para verla.', true);
    }
}

function bindEvents() {
    document.querySelectorAll('[data-pharmacist-tab]').forEach((tab) => tab.addEventListener('click', (event) => {
        event.preventDefault();
        activateTab(tab.dataset.pharmacistTab);
    }));
    $('add-sale-item').addEventListener('click', () => addSaleItemRow());
    $('sale-items').addEventListener('input', updateSaleTotals);
    $('sale-items').addEventListener('click', (event) => {
        const remove = event.target.closest('.remove-sale-item');
        if (!remove) return;
        remove.closest('.sale-item-row')?.remove();
        updateSaleTotals();
    });
    $('sale-form').addEventListener('submit', saveSale);
    $('patient-search').addEventListener('input', renderPatientResults);
    $('patient-search-results').addEventListener('click', (event) => {
        const button = event.target.closest('[data-patient-id]');
        if (button) selectPatient(button.dataset.patientId);
    });
    $('clear-patient-selection').addEventListener('click', clearPatientSelection);
    $('pharmacy-orders').addEventListener('click', updateOrder);
    $('medication-form').addEventListener('submit', saveMedication);
    $('medication-cancel').addEventListener('click', resetMedicationForm);
    $('medication-search').addEventListener('input', renderMedicationList);
    $('medications-list').addEventListener('click', (event) => {
        const edit = event.target.closest('[data-edit-medication]');
        if (edit) {
            startEditMedication(edit.dataset.editMedication);
            return;
        }
        const remove = event.target.closest('[data-delete-medication]');
        if (remove) removeMedication(remove.dataset.deleteMedication);
    });
    window.addEventListener('hashchange', () => activateTab(location.hash.slice(1)));
}

bindEvents();
addSaleItemRow();

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace('/');
        return;
    }
    const initialTab = location.hash.slice(1);
    if (tabTitles[initialTab]) activateTab(initialTab);
    try {
        await loadPharmacistData(user);
    } catch (error) {
        console.error(error);
        feedback('No se pudieron cargar los datos de la farmacia. Comprueba tu conexión e inténtalo de nuevo.', true);
    }
});
