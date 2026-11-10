import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
    Timestamp,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    updateDoc,
    where,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { auth, db } from './firebase.js';
import { attachMedicationAutocomplete, medicationDisplayName, normalizeText } from './medication-autocomplete.js';

const $ = (id) => document.getElementById(id);
let currentUser = null;
let appointments = [];
let selectedAppointment = null;
let medicationCatalog = [];
let medicineRowSequence = 0;

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

function statusLabel(status) {
    return ({
        scheduled: 'Programada',
        attended: 'Atendido',
        completed: 'Atendido',
        no_show: 'No asistió',
        cancelled: 'Cancelado'
    })[status] || status || 'Estado desconocido';
}

function statusClass(status) {
    return ({
        scheduled: 'scheduled',
        attended: 'attended',
        completed: 'attended',
        no_show: 'no-show',
        cancelled: 'no-show'
    })[status] || 'scheduled';
}

function renderAppointments() {
    const container = $('doctor-appointments');
    container.replaceChildren();
    const statusPriority = { scheduled: 0, completed: 1, attended: 1, no_show: 2 };
    const ordered = [...appointments].sort((a, b) =>
        (statusPriority[a.status] ?? 3) - (statusPriority[b.status] ?? 3)
        || `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
    );
    if (!ordered.length) {
        container.append(textElement('p', 'No tienes citas reservadas por el momento.', 'empty-state'));
        return;
    }

    ordered.forEach((appointment) => {
        const canAttend = appointment.status === 'scheduled';
        const card = document.createElement('article');
        card.className = `doctor-appointment-card ${statusClass(appointment.status)}`;
        card.dataset.appointmentId = appointment.id;

        const header = document.createElement('div');
        header.className = 'card-header';

        const title = textElement('h3', appointment.patientName || 'Paciente');
        const time = textElement('div', `${dateLabel(appointment.date)} · ${appointment.time || ''}`, 'patient-time');
        header.append(title, time);

        const center = textElement('div', `${appointment.centerName || 'Centro de salud'} · ${appointment.specialty || ''}`, 'patient-center');

        const badge = textElement('span', statusLabel(appointment.status), 'status-badge');
        badge.classList.add(statusClass(appointment.status));

        const actions = document.createElement('div');
        actions.className = 'card-actions';

        if (canAttend) {
            const btnAttend = textElement('button', 'Atender', 'btn-action');
            btnAttend.type = 'button';
            btnAttend.dataset.action = 'attend';

            const btnNoShow = textElement('button', 'No asistió', 'btn-action secondary');
            btnNoShow.type = 'button';
            btnNoShow.dataset.action = 'no-show';

            actions.append(btnAttend, btnNoShow);
        }

        const btnHistory = textElement('button', 'Historial', 'btn-action secondary');
        btnHistory.type = 'button';
        btnHistory.dataset.action = 'history';
        actions.append(btnHistory);

        card.append(header, center, badge, actions);
        container.append(card);
    });
}

function addMedicineRow(item = {}) {
    const row = document.createElement('div');
    row.className = 'doctor-medicine-row';

    const nameField = document.createElement('div');
    nameField.className = 'doctor-medicine-field';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Medicamento';
    const name = document.createElement('input');
    name.type = 'text';
    name.id = `doctor-medicine-name-${++medicineRowSequence}`;
    name.maxLength = 280;
    name.placeholder = 'Escribe o elige un medicamento';
    name.dataset.medicineName = '';
    name.value = item.name || '';
    nameLabel.htmlFor = name.id;
    nameField.append(nameLabel, name);

    const directionsLabel = document.createElement('label');
    directionsLabel.textContent = 'Dosis e indicaciones';
    const directions = document.createElement('input');
    directions.type = 'text';
    directions.maxLength = 500;
    directions.placeholder = 'Indicación profesional';
    directions.dataset.medicineDirections = '';
    directions.value = item.instructions || '';
    directionsLabel.append(directions);

    const remove = textElement('button', '−', 'icon-button remove-medicine');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Quitar medicamento');

    attachMedicationAutocomplete({
        input: name,
        getMedications: () => medicationCatalog,
        onSelect: (medication) => {
            name.value = medicationDisplayName(medication);
            row.dataset.medicationId = medication.id;
            directions.focus();
        },
        onInput: () => {
            row.dataset.medicationId = '';
        },
        getMeta: (medication) => medication.presentation || ''
    });

    row.append(nameField, directionsLabel, remove);
    $('prescription-items').append(row);
}

function openRecordEditor(appointmentId) {
    selectedAppointment = appointments.find((item) => item.id === appointmentId);
    if (!selectedAppointment) return;
    if (selectedAppointment.status !== 'scheduled') {
        showFeedback('Esta cita ya fue registrada. Abre el historial para consultar la atención.', true);
        return;
    }
    $('record-form').reset();
    $('record-appointment-id').value = appointmentId;
    $('record-patient-id').value = selectedAppointment.patientId;
    $('record-appointment-title').textContent = 'Registrar consulta';
    $('record-patient-summary').textContent = `${selectedAppointment.patientName || 'Paciente'} · ${selectedAppointment.specialty} · ${dateLabel(selectedAppointment.date)} ${selectedAppointment.time}`;
    $('prescription-items').replaceChildren();
    $('prescription-expiry').min = new Date().toISOString().slice(0, 10);
    $('record-editor').hidden = false;
    $('record-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function markNoShow(appointmentId) {
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment || !currentUser) return;
    if (appointment.status !== 'scheduled') {
        showFeedback('Solo se puede marcar como no asistida una cita programada.', true);
        return;
    }
    if (!window.confirm(`¿Marcar como no asistió a ${appointment.patientName || 'el paciente'}?`)) return;

    try {
        showFeedback('Marcando la cita como no asistida…');
        await updateDoc(doc(db, 'appointments', appointmentId), {
            status: 'no_show',
            updatedAt: serverTimestamp()
        });
        if ($('record-appointment-id').value === appointmentId) {
            $('record-editor').hidden = true;
        }
        showFeedback('La cita quedó registrada como no asistida.');
        await loadAppointments();
    } catch (error) {
        console.error(error);
        showFeedback('No se pudo actualizar el estado de la cita.', true);
    }
}

function openPatientHistory(appointmentId) {
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment) return;
    $('history-patient-name').textContent = `Historial de ${appointment.patientName || 'Paciente'}`;
    $('history-patient-info').textContent = `${appointment.centerName || 'Centro'} · ${appointment.specialty || ''} · Cita: ${dateLabel(appointment.date)} ${appointment.time}`;
    $('patient-history').hidden = false;
    $('patient-history').scrollIntoView({ behavior: 'smooth', block: 'start' });
    loadPatientHistory(appointment.patientId);
}

async function loadPatientHistory(patientId) {
    if (!currentUser) return;
    try {
        const [recordsSnapshot, prescriptionsSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'medicalRecords'), where('doctorId', '==', currentUser.uid))),
            getDocs(query(collection(db, 'prescriptions'), where('doctorId', '==', currentUser.uid)))
        ]);

        const records = recordsSnapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .filter((record) => record.patientId === patientId);
        const prescriptions = prescriptionsSnapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .filter((prescription) => prescription.patientId === patientId);

        const historyContainer = $('history-list');
        historyContainer.replaceChildren();
        if (!records.length) {
            historyContainer.append(textElement('p', 'Sin registros clínicos previos.', 'empty-state'));
        } else {
            [...records].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).forEach((record) => {
                const card = document.createElement('article');
                card.className = 'clinical-card';
                const copy = document.createElement('div');
                copy.className = 'clinical-card-copy';
                copy.append(textElement('h4', record.diagnosis || 'Atención'));
                copy.append(textElement('p', `${displayDate(record.date)} · ${record.doctorName || 'Profesional de salud'}`));
                if (record.notes) copy.append(textElement('p', `Notas: ${record.notes}`));
                if (record.treatmentPlan) copy.append(textElement('p', `Plan: ${record.treatmentPlan}`));
                card.append(copy);
                historyContainer.append(card);
            });
        }

        const rxContainer = document.createElement('div');
        rxContainer.className = 'clinical-list';
        if (!prescriptions.length) {
            rxContainer.append(textElement('p', 'Sin recetas registradas.', 'empty-state'));
        } else {
            [...prescriptions].sort((a, b) => (b.issuedAt?.seconds || 0) - (a.issuedAt?.seconds || 0)).forEach((prescription) => {
                const card = document.createElement('article');
                card.className = 'clinical-card';
                const copy = document.createElement('div');
                copy.className = 'clinical-card-copy';
                copy.append(textElement('h4', `Receta del ${displayDate(prescription.issuedAt)}`));
                copy.append(textElement('p', `${prescription.doctorName || 'Profesional de salud'} · ${prescription.centerName || ''}`));
                const items = document.createElement('ul');
                items.className = 'order-items';
                (prescription.items || []).forEach((item) => {
                    items.append(textElement('li', `${item.name || 'Medicamento'}${item.instructions ? ` · ${item.instructions}` : ''}`));
                });
                copy.append(items);
                card.append(copy);
                rxContainer.append(card);
            });
        }
        $('history-prescriptions').replaceChildren();
        $('history-prescriptions').append(rxContainer);
    } catch (error) {
        console.error(error);
        showFeedback('No se pudo cargar el historial del paciente.', true);
    }
}

function displayDate(value) {
    if (!value) return 'Fecha no registrada';
    if (typeof value === 'string') {
        const parts = value.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
    }
    if (value.toDate) return value.toDate().toLocaleDateString('es-BO');
    return String(value);
}

async function loadAppointments() {
    if (!currentUser) return;
    const snapshot = await getDocs(query(collection(db, 'appointments'), where('doctorId', '==', currentUser.uid)));
    appointments = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((appointment) => ['scheduled', 'completed', 'attended', 'no_show'].includes(appointment.status));
    renderAppointments();
}

async function loadMedicationCatalog() {
    if (!currentUser) return;
    try {
        const snapshot = await getDocs(collection(db, 'medications'));
        const unique = new Map();
        snapshot.docs.forEach((item) => {
            const medication = { id: item.id, ...item.data() };
            if (medication.active === false || !String(medication.name || '').trim()) return;
            const key = `${normalizeText(medication.name)}|${normalizeText(medication.presentation || '')}`;
            if (!unique.has(key)) unique.set(key, medication);
        });
        medicationCatalog = [...unique.values()]
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es')
                || String(a.presentation || '').localeCompare(String(b.presentation || ''), 'es'));
    } catch (error) {
        console.error(error);
        medicationCatalog = [];
        showFeedback('No se pudo cargar el catálogo de medicamentos. Puedes escribir el nombre manualmente.', true);
    }
}

async function saveClinicalRecord(event) {
    event.preventDefault();
    const appointmentId = $('record-appointment-id').value;
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment || !currentUser) return;
    if (appointment.status !== 'scheduled') {
        showFeedback('Esta cita ya fue registrada. Actualiza la página para ver su estado.', true);
        return;
    }

    const medicineRows = [...document.querySelectorAll('.doctor-medicine-row')];
    const hasIncompleteMedicine = medicineRows.some((row) => {
        const name = row.querySelector('[data-medicine-name]').value.trim();
        const instructions = row.querySelector('[data-medicine-directions]').value.trim();
        return (name && !instructions) || (!name && instructions);
    });
    if (hasIncompleteMedicine) {
        showFeedback('Completa el nombre y las indicaciones de cada medicamento, o elimina la fila vacía.', true);
        return;
    }

    const items = medicineRows.map((row) => ({
        name: row.querySelector('[data-medicine-name]').value.trim(),
        instructions: row.querySelector('[data-medicine-directions]').value.trim()
    })).filter((item) => item.name && item.instructions);

    const submit = $('save-record-save');
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
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const card = button.closest('.doctor-appointment-card');
    if (!card) return;
    const appointmentId = card.dataset.appointmentId;
    const action = button.dataset.action;
    if (action === 'attend') openRecordEditor(appointmentId);
    if (action === 'no-show') markNoShow(appointmentId);
    if (action === 'history') openPatientHistory(appointmentId);
});

$('record-form').addEventListener('submit', saveClinicalRecord);
$('add-prescription-item').addEventListener('click', () => addMedicineRow());
$('prescription-items').addEventListener('click', (event) => {
    const removeButton = event.target.closest('.remove-medicine');
    if (removeButton) removeButton.closest('.doctor-medicine-row').remove();
});
$('close-record-editor').addEventListener('click', () => $('record-editor').hidden = true);
$('cancel-record').addEventListener('click', () => $('record-editor').hidden = true);
$('close-history').addEventListener('click', () => $('patient-history').hidden = true);

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
    await loadMedicationCatalog();
});
