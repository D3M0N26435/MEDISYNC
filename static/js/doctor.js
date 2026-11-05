import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
    Timestamp,
    collection,
    doc,
    getDocs,
    query,
    serverTimestamp,
    where,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { auth, db } from './firebase.js';

const $ = (id) => document.getElementById(id);
let currentUser = null;
let appointments = [];
let selectedAppointment = null;

function textElement(tag, text, className = '') {
    const element = document.createElement(tag);
    element.textContent = text || '';
    if (className) element.className = className;
    return element;
}

function showFeedback(message, error = false) {
    const feedback = $('doctor-feedback');
    feedback.textContent = message;
    feedback.classList.toggle('error', error);
}

function dateLabel(value) {
    if (!value) return 'Fecha pendiente';
    const parts = value.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}

function renderAppointments() {
    const container = $('doctor-appointments');
    container.replaceChildren();
    const ordered = [...appointments].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    if (!ordered.length) {
        container.append(textElement('p', 'No tienes consultas reservadas por el momento.', 'empty-state'));
        return;
    }

    ordered.forEach((appointment) => {
        const card = document.createElement('article');
        card.className = 'clinical-card';
        const content = document.createElement('div');
        content.className = 'clinical-card-copy';
        content.append(textElement('h3', `${appointment.specialty || 'Consulta'} · ${dateLabel(appointment.date)} ${appointment.time || ''}`));
        content.append(textElement('p', `Paciente: ${appointment.patientName || 'Sin nombre registrado'}`));
        content.append(textElement('p', `${appointment.centerName || 'Centro de salud'} · ${appointment.patientId}`));
        card.append(content);
        const button = textElement('button', 'Registrar atención', 'btn-action');
        button.type = 'button';
        button.dataset.recordAppointment = appointment.id;
        card.append(button);
        container.append(card);
    });
}

function addMedicineRow(item = {}) {
    const row = document.createElement('div');
    row.className = 'doctor-medicine-row';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Medicamento';
    const name = document.createElement('input');
    name.type = 'text';
    name.maxLength = 160;
    name.required = true;
    name.placeholder = 'Nombre y concentración';
    name.dataset.medicineName = '';
    name.value = item.name || '';
    nameLabel.append(name);
    const directionsLabel = document.createElement('label');
    directionsLabel.textContent = 'Dosis e indicaciones';
    const directions = document.createElement('input');
    directions.type = 'text';
    directions.maxLength = 500;
    directions.required = true;
    directions.placeholder = 'Indicación profesional';
    directions.dataset.medicineDirections = '';
    directions.value = item.instructions || '';
    directionsLabel.append(directions);
    const remove = textElement('button', '−', 'icon-button remove-medicine');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Quitar medicamento');
    row.append(nameLabel, directionsLabel, remove);
    $('prescription-items').append(row);
}

function openRecordEditor(appointmentId) {
    selectedAppointment = appointments.find((item) => item.id === appointmentId);
    if (!selectedAppointment) return;
    $('record-form').reset();
    $('record-appointment-id').value = appointmentId;
    $('record-appointment-summary').textContent = `${selectedAppointment.patientName || 'Paciente'} · ${selectedAppointment.specialty} · ${dateLabel(selectedAppointment.date)} ${selectedAppointment.time}`;
    $('prescription-items').replaceChildren();
    $('prescription-expiry').min = new Date().toISOString().slice(0, 10);
    $('record-editor').hidden = false;
    $('record-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadAppointments() {
    if (!currentUser) return;
    const snapshot = await getDocs(query(collection(db, 'appointments'), where('doctorId', '==', currentUser.uid)));
    appointments = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((appointment) => appointment.status === 'scheduled');
    renderAppointments();
}

async function saveClinicalRecord(event) {
    event.preventDefault();
    const appointmentId = $('record-appointment-id').value;
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment || !currentUser) return;

    const items = [...document.querySelectorAll('.doctor-medicine-row')].map((row) => ({
        name: row.querySelector('[data-medicine-name]').value.trim(),
        instructions: row.querySelector('[data-medicine-directions]').value.trim()
    })).filter((item) => item.name && item.instructions);
    const submit = $('save-record');
    submit.disabled = true;
    showFeedback('Guardando la atención…');

    const appointmentRef = doc(db, 'appointments', appointmentId);
    const recordRef = doc(collection(db, 'medicalRecords'));
    const record = {
        appointmentId,
        patientId: appointment.patientId,
        patientName: appointment.patientName || 'Paciente',
        doctorId: currentUser.uid,
        doctorName: appointment.doctorName || currentUser.displayName || 'Profesional de salud',
        centerId: appointment.centerId,
        centerName: appointment.centerName,
        date: appointment.date,
        specialty: appointment.specialty,
        diagnosis: $('record-diagnosis').value.trim(),
        notes: $('record-notes').value.trim(),
        treatmentPlan: $('record-treatment').value.trim(),
        createdAt: serverTimestamp()
    };

    try {
        const batch = writeBatch(db);
        batch.update(appointmentRef, { status: 'completed', updatedAt: serverTimestamp() });
        batch.set(recordRef, record);
        if (items.length) {
            const prescriptionRef = doc(collection(db, 'prescriptions'));
            const expiryValue = $('prescription-expiry').value;
            const expiresAt = expiryValue ? Timestamp.fromDate(new Date(`${expiryValue}T23:59:59`)) : null;
            batch.set(prescriptionRef, {
                appointmentId,
                patientId: appointment.patientId,
                patientName: appointment.patientName || 'Paciente',
                doctorId: currentUser.uid,
                doctorName: appointment.doctorName || currentUser.displayName || 'Profesional de salud',
                centerId: appointment.centerId,
                centerName: appointment.centerName,
                specialty: appointment.specialty,
                items,
                notes: $('record-treatment').value.trim(),
                status: 'active',
                issuedAt: serverTimestamp(),
                expiresAt
            });
        }
        await batch.commit();
        $('record-editor').hidden = true;
        showFeedback(items.length ? 'Atención registrada y receta emitida.' : 'Atención registrada.');
        await loadAppointments();
    } catch (error) {
        console.error(error);
        showFeedback('No se pudo guardar. Comprueba las reglas de Firestore e inténtalo de nuevo.', true);
    } finally {
        submit.disabled = false;
    }
}

$('doctor-appointments').addEventListener('click', (event) => {
    const button = event.target.closest('[data-record-appointment]');
    if (button) openRecordEditor(button.dataset.recordAppointment);
});
$('record-form').addEventListener('submit', saveClinicalRecord);
$('add-prescription-item').addEventListener('click', () => addMedicineRow());
$('prescription-items').addEventListener('click', (event) => {
    const removeButton = event.target.closest('.remove-medicine');
    if (removeButton) removeButton.closest('.doctor-medicine-row').remove();
});
$('close-record-editor').addEventListener('click', () => $('record-editor').hidden = true);
$('cancel-record').addEventListener('click', () => $('record-editor').hidden = true);

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace('/');
        return;
    }
    currentUser = user;
    try {
        await loadAppointments();
    } catch (error) {
        console.error(error);
        showFeedback('No se pudieron cargar tus consultas. Comprueba tu conexión y las reglas de Firestore.', true);
    }
});
