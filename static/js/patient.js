import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
    Timestamp,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    where,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { auth, db } from './firebase.js';
import { attachMapTools } from './map-utils.js';

const $ = (id) => document.getElementById(id);
const state = {
    user: null,
    profile: {},
    locations: [],
    doctors: [],
    appointments: [],
    prescriptions: [],
    orders: [],
    records: [],
    appointmentMap: null,
    pharmacyMap: null,
    appointmentMapTools: null,
    pharmacyMapTools: null,
    appointmentMarkers: null,
    pharmacyMarkers: null
};

const tabTitles = {
    agendar: 'Agendar una consulta',
    recetas: 'Mis recetas',
    historial: 'Historial clínico',
    medibot: 'MediBot'
};

function setFeedback(id, message, isError = false) {
    const element = $(id);
    element.textContent = message;
    element.classList.toggle('error', isError);
}

function activateTab(name) {
    if (!tabTitles[name]) return;
    document.querySelectorAll('[data-patient-tab]').forEach((tab) => {
        const selected = tab.dataset.patientTab === name;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-selected', String(selected));
    });
    document.querySelectorAll('.patient-panel').forEach((panel) => {
        const selected = panel.id === `patient-panel-${name}`;
        panel.hidden = !selected;
        panel.classList.toggle('active', selected);
    });
    $('patient-page-title').textContent = tabTitles[name];
    history.replaceState(null, '', `#${name}`);
    if (name === 'agendar') window.setTimeout(() => state.appointmentMap?.invalidateSize(), 60);
    if (name === 'recetas') window.setTimeout(() => state.pharmacyMap?.invalidateSize(), 60);
}

function textElement(tag, text, className = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text || '';
    return element;
}

function setSelectOptions(select, placeholder, items, getLabel) {
    select.replaceChildren(new Option(placeholder, ''));
    items.forEach((item) => select.add(new Option(getLabel(item), item.id)));
}

function validCoordinates(location) {
    const lat = Number(location.lat);
    const lng = Number(location.lng);
    return Number.isFinite(lat) && lat >= -90 && lat <= 90
        && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

function mapPopup(location, buttonText, onSelect) {
    const content = document.createElement('div');
    content.append(textElement('strong', location.name));
    content.append(textElement('div', location.address));
    const button = textElement('button', buttonText);
    button.type = 'button';
    button.className = 'map-select-button';
    button.addEventListener('click', onSelect);
    content.append(button);
    return content;
}

function createMap(elementId, locations, selectLocation, layerKey, getDestination) {
    if (!window.L || !$(elementId)) return;
    const center = locations.find(validCoordinates);
    const initialView = center
        ? [Number(center.lat), Number(center.lng)]
        : [-17.9647, -67.106];
    const map = L.map(elementId).setView(initialView, center ? 12 : 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    const markers = L.layerGroup().addTo(map);
    locations.filter(validCoordinates).forEach((location) => {
        const marker = L.marker([Number(location.lat), Number(location.lng)]).addTo(markers);
        marker.bindPopup(mapPopup(location, 'Elegir esta sede', () => selectLocation(location.id)));
        marker.on('click', () => selectLocation(location.id));
    });
    state[layerKey] = markers;
    const tools = attachMapTools({ map, getDestination });
    return { map, tools };
}

function populateCenters() {
    const centers = state.locations.filter((location) =>
        ['health_center', 'hospital'].includes(location.type) && location.active !== false
    );
    setSelectOptions($('appointment-center'), 'Selecciona un centro', centers, (item) => item.name);
    $('appointment-centers-empty').hidden = centers.some(validCoordinates);
    const appointmentMap = createMap(
        'appointment-map',
        centers,
        (id) => {
            $('appointment-center').value = id;
            handleCenterChange();
        },
        'appointmentMarkers',
        () => {
            const center = state.locations.find((item) => item.id === $('appointment-center').value);
            return center ? { lat: center.lat, lng: center.lng, name: center.name } : null;
        }
    );
    state.appointmentMap = appointmentMap?.map || null;
    state.appointmentMapTools = appointmentMap?.tools || null;
    if (!centers.length) $('appointment-center').disabled = true;
}

function populatePharmacies() {
    const pharmacies = state.locations.filter((location) =>
        location.type === 'pharmacy' && location.active !== false
    );
    setSelectOptions($('prescription-pharmacy'), 'Selecciona una farmacia', pharmacies, (item) => item.name);
    $('pharmacies-empty').hidden = pharmacies.some(validCoordinates);
    const pharmacyMap = createMap(
        'pharmacy-map',
        pharmacies,
        (id) => {
            state.pharmacyMapTools?.clearRoute();
            $('prescription-pharmacy').value = id;
        },
        'pharmacyMarkers',
        () => {
            const pharmacy = state.locations.find((item) => item.id === $('prescription-pharmacy').value);
            return pharmacy ? { lat: pharmacy.lat, lng: pharmacy.lng, name: pharmacy.name } : null;
        }
    );
    state.pharmacyMap = pharmacyMap?.map || null;
    state.pharmacyMapTools = pharmacyMap?.tools || null;
}

function activeDoctorsAt(centerId) {
    return state.doctors.filter((doctor) =>
        doctor.active !== false
        && doctor.locationId === centerId
        && Array.isArray(doctor.specialties)
        && doctor.specialties.length > 0
    );
}

function handleCenterChange() {
    state.appointmentMapTools?.clearRoute();
    const centerId = $('appointment-center').value;
    const specialtySelect = $('appointment-specialty');
    const doctorSelect = $('appointment-doctor');
    const specialties = [...new Set(activeDoctorsAt(centerId).flatMap((doctor) => doctor.specialties))]
        .filter((specialty) => typeof specialty === 'string' && specialty.trim())
        .sort((a, b) => a.localeCompare(b, 'es'));

    setSelectOptions(specialtySelect, centerId ? 'Selecciona una especialidad' : 'Primero selecciona un centro', specialties.map((name) => ({ id: name, name })), (item) => item.name);
    specialtySelect.disabled = !centerId || specialties.length === 0;
    if (centerId && specialties.length === 0) specialtySelect.options[0].textContent = 'Este centro aún no tiene especialidades registradas';
    setSelectOptions(doctorSelect, 'Primero selecciona una especialidad', [], (item) => item.name);
    doctorSelect.disabled = true;
    resetAppointmentDateAndTime();
}

function handleSpecialtyChange() {
    const centerId = $('appointment-center').value;
    const specialty = $('appointment-specialty').value;
    const doctors = activeDoctorsAt(centerId).filter((doctor) => doctor.specialties.includes(specialty));
    const select = $('appointment-doctor');
    setSelectOptions(select, specialty ? 'Selecciona un doctor' : 'Primero selecciona una especialidad', doctors, (doctor) => doctor.name || 'Profesional de salud');
    select.disabled = !specialty || doctors.length === 0;
    resetAppointmentDateAndTime();
}

function resetAppointmentDateAndTime() {
    const date = $('appointment-date');
    date.value = '';
    date.disabled = !$('appointment-doctor').value;
    const time = $('appointment-time');
    setSelectOptions(time, 'Selecciona fecha y doctor', [], (item) => item.name);
    time.disabled = true;
    $('appointment-submit').disabled = true;
}

function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function isDoctorOnLeave(doctor, dateString) {
    return (doctor.vacationPeriods || []).some((period) =>
        period.start && period.end && period.start <= dateString && period.end >= dateString
    );
}

function timeSlotsForDay(doctor, dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    if (Number.isNaN(date.getTime()) || isDoctorOnLeave(doctor, dateString)) return [];
    const weekday = date.getDay();
    const schedules = (doctor.weeklyAvailability || []).filter((item) => Number(item.weekday) === weekday);
    const slots = new Set();

    schedules.forEach((schedule) => {
        if (Array.isArray(schedule.slots) && schedule.slots.length) {
            schedule.slots.forEach((timeKey) => {
                if (!/^\d{4}$/.test(timeKey)) return;
                const time = `${timeKey.slice(0, 2)}:${timeKey.slice(2)}`;
                const startsAt = new Date(`${dateString}T${time}:00`);
                if (startsAt > new Date()) slots.add(time);
            });
            return;
        }
        const [startHour, startMinute] = String(schedule.start || '').split(':').map(Number);
        const [endHour, endMinute] = String(schedule.end || '').split(':').map(Number);
        const interval = Number(schedule.slotMinutes);
        let cursor = startHour * 60 + startMinute;
        const end = endHour * 60 + endMinute;
        if (!Number.isFinite(cursor) || !Number.isFinite(end) || !Number.isFinite(interval) || interval < 5 || end <= cursor) return;
        while (cursor + interval <= end) {
            const hour = Math.floor(cursor / 60);
            const minute = cursor % 60;
            const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            const startsAt = new Date(`${dateString}T${time}:00`);
            if (startsAt > new Date()) slots.add(time);
            cursor += interval;
        }
    });

    return [...slots].sort((a, b) => a.localeCompare(b));
}

function slotDocumentId(doctorId, date, time) {
    return `${doctorId}_${date}_${time.replace(':', '')}`;
}

async function refreshTimeSlots() {
    const dateString = $('appointment-date').value;
    const doctor = state.doctors.find((item) => item.id === $('appointment-doctor').value);
    const select = $('appointment-time');
    select.disabled = true;
    $('appointment-submit').disabled = true;
    setSelectOptions(select, 'Buscando horarios disponibles…', [], (item) => item.name);
    if (!doctor || !dateString) return;

    const candidateTimes = timeSlotsForDay(doctor, dateString);
    if (!candidateTimes.length) {
        setSelectOptions(select, 'No hay horarios para esta fecha', [], (item) => item.name);
        return;
    }

    try {
        const checks = await Promise.all(candidateTimes.map(async (time) => {
            const slotId = slotDocumentId(doctor.id, dateString, time);
            const snapshot = await getDoc(doc(db, 'appointmentSlots', slotId));
            return snapshot.exists() ? null : time;
        }));
        const availableTimes = checks.filter(Boolean);
        setSelectOptions(
            select,
            availableTimes.length ? 'Selecciona un horario disponible' : 'No quedan horarios disponibles',
            availableTimes.map((time) => ({ id: time, name: time })),
            (item) => item.name
        );
        select.disabled = availableTimes.length === 0;
    } catch (error) {
        console.error(error);
        setSelectOptions(select, 'No se pudieron consultar los horarios', [], (item) => item.name);
        setFeedback('appointment-feedback', 'No se pudieron consultar los horarios. Inténtalo de nuevo.', true);
    }
}

async function bookAppointment(event) {
    event.preventDefault();
    const center = state.locations.find((item) => item.id === $('appointment-center').value);
    const doctor = state.doctors.find((item) => item.id === $('appointment-doctor').value);
    const specialty = $('appointment-specialty').value;
    const date = $('appointment-date').value;
    const time = $('appointment-time').value;
    if (!state.user || !center || !doctor || !specialty || !date || !time) return;

    const feedbackId = 'appointment-feedback';
    const submit = $('appointment-submit');
    submit.disabled = true;
    setFeedback(feedbackId, 'Reservando el horario…');
    const slotId = slotDocumentId(doctor.id, date, time);
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const timeKey = time.replace(':', '');
    const scheduleEntry = (doctor.weeklyAvailability || []).find((entry) =>
        Number(entry.weekday) === weekday && Array.isArray(entry.slots) && entry.slots.includes(timeKey)
    );
    if (!scheduleEntry) {
        setFeedback(feedbackId, 'El horario ya no coincide con la agenda del médico. Vuelve a seleccionarlo.', true);
        await refreshTimeSlots();
        return;
    }
    const [slotHour, slotMinutePart] = time.split(':').map(Number);
    const slotMinute = slotHour * 60 + slotMinutePart;
    const startAt = Timestamp.fromDate(new Date(`${date}T${time}:00`));
    const appointment = {
        slotId,
        patientId: state.user.uid,
        patientName: state.profile.name || state.user.displayName || 'Paciente',
        doctorId: doctor.id,
        doctorName: doctor.name || 'Profesional de salud',
        centerId: center.id,
        centerName: center.name,
        specialty,
        date,
        time,
        timeKey,
        weekday,
        scheduleEntry,
        slotMinute,
        startAt,
        status: 'scheduled',
        createdAt: serverTimestamp()
    };

    try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'appointments', slotId), appointment);
        batch.set(doc(db, 'appointmentSlots', slotId), {
            doctorId: doctor.id,
            date,
            time,
            status: 'booked'
        });
        await batch.commit();
        state.appointments.unshift({ id: slotId, ...appointment, status: 'scheduled' });
        renderAppointments();
        setFeedback(feedbackId, 'Cita confirmada. La encontrarás en “Mis citas”.');
        $('appointment-time').value = '';
        await refreshTimeSlots();
    } catch (error) {
        console.error(error);
        setFeedback(feedbackId, 'Ese horario acaba de ocuparse o no se pudo reservar. Elige otro horario.', true);
        await refreshTimeSlots();
    } finally {
        submit.disabled = !$('appointment-time').value;
    }
}

function makeRecordCard(title, status, details) {
    const article = document.createElement('article');
    article.className = 'patient-record';
    const heading = document.createElement('div');
    heading.className = 'patient-record-heading';
    heading.append(textElement('h4', title));
    if (status) heading.append(textElement('span', status.replaceAll('_', ' '), 'record-status'));
    article.append(heading);
    details.filter(Boolean).forEach((detail) => article.append(textElement('p', detail)));
    return article;
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

function renderAppointments() {
    const container = $('appointments-list');
    container.replaceChildren();
    const appointments = [...state.appointments].sort((a, b) =>
        `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
    );
    if (!appointments.length) {
        container.append(textElement('p', 'Todavía no tienes citas reservadas.', 'empty-state'));
        return;
    }
    appointments.forEach((appointment) => {
        container.append(makeRecordCard(
            `${appointment.specialty || 'Consulta'} · ${displayDate(appointment.date)} ${appointment.time || ''}`,
            appointment.status,
            [
                `${appointment.doctorName || 'Profesional de salud'} · ${appointment.centerName || 'Centro no registrado'}`,
                appointment.status === 'scheduled' ? 'Cita programada' : ''
            ]
        ));
    });
}

function orderStatusLabel(status) {
    return ({ requested: 'Solicitada', preparing: 'En preparación', ready: 'Lista para recoger', picked_up: 'Recogida', rejected: 'No disponible' })[status] || status || 'Estado desconocido';
}

function renderPrescriptions() {
    const container = $('prescriptions-list');
    container.replaceChildren();
    const active = state.prescriptions.filter((prescription) => {
        if (prescription.status !== 'active') return false;
        if (!prescription.expiresAt) return true;
        const expiry = prescription.expiresAt.toDate ? prescription.expiresAt.toDate() : new Date(prescription.expiresAt);
        return !Number.isNaN(expiry.getTime()) && expiry >= new Date();
    });
    if (!active.length) {
        container.append(textElement('p', 'No tienes recetas vigentes registradas.', 'empty-state'));
        return;
    }

    active.forEach((prescription) => {
        const card = makeRecordCard(
            `Receta del ${displayDate(prescription.issuedAt)}`,
            'Vigente',
            [
                `${prescription.doctorName || 'Profesional de salud'} · ${prescription.centerName || 'Centro de salud'}`,
                prescription.notes || ''
            ]
        );
        const list = document.createElement('ul');
        (prescription.items || []).forEach((item) => {
            list.append(textElement('li', `${item.name || 'Medicamento'}${item.instructions ? ` · ${item.instructions}` : ''}`));
        });
        card.append(list);
        const alreadyRequested = state.orders.some((order) => order.prescriptionId === prescription.id && order.status !== 'rejected');
        const actions = document.createElement('div');
        actions.className = 'record-actions';
        const requestButton = textElement('button', alreadyRequested ? 'Solicitud enviada' : 'Solicitar en farmacia', 'btn-action');
        requestButton.type = 'button';
        requestButton.dataset.requestPrescription = prescription.id;
        requestButton.disabled = alreadyRequested || !$('prescription-pharmacy').value;
        actions.append(requestButton);
        card.append(actions);
        container.append(card);
    });
}

function renderPrescriptionOrders() {
    const container = $('prescription-orders-list');
    container.replaceChildren();
    if (!state.orders.length) {
        container.append(textElement('p', 'Aún no has solicitado recoger una receta.', 'empty-state'));
        return;
    }
    [...state.orders].sort((a, b) => String(b.createdAt?.seconds || 0).localeCompare(String(a.createdAt?.seconds || 0))).forEach((order) => {
        const prescription = state.prescriptions.find((item) => item.id === order.prescriptionId);
        const pharmacy = state.locations.find((item) => item.id === order.pharmacyId);
        container.append(makeRecordCard(
            prescription?.items?.map((item) => item.name).join(', ') || 'Solicitud de receta',
            orderStatusLabel(order.status),
            [pharmacy ? `${pharmacy.name} · ${pharmacy.address}` : 'Farmacia seleccionada']
        ));
    });
}

async function requestPrescription(event) {
    const button = event.target.closest('[data-request-prescription]');
    if (!button) return;
    const prescriptionId = button.dataset.requestPrescription;
    const pharmacyId = $('prescription-pharmacy').value;
    const prescription = state.prescriptions.find((item) => item.id === prescriptionId);
    const pharmacy = state.locations.find((item) => item.id === pharmacyId && item.type === 'pharmacy' && item.active !== false);
    if (!prescription || !pharmacy) {
        setFeedback('prescription-feedback', 'Selecciona una farmacia autorizada.', true);
        return;
    }

    const orderId = `${prescriptionId}_${state.user.uid}_${pharmacyId}`;
    // No se hace getDoc antes de crear: las reglas niegan leer un documento
    // inexistente, aunque luego el setDoc sí esté permitido.
    const existingOrder = state.orders.find((order) => order.id === orderId);
    if (existingOrder) {
        const message = existingOrder.status === 'rejected'
            ? 'La solicitud anterior en esta farmacia fue rechazada. Elige otra farmacia.'
            : 'Ya existe una solicitud para esta receta y farmacia.';
        setFeedback('prescription-feedback', message, true);
        return;
    }

    button.disabled = true;
    setFeedback('prescription-feedback', 'Enviando solicitud a la farmacia…');
    try {
        const orderRef = doc(db, 'prescriptionOrders', orderId);
        await setDoc(orderRef, {
            patientId: state.user.uid,
            prescriptionId,
            pharmacyId,
            status: 'requested',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        state.orders.push({ id: orderId, patientId: state.user.uid, prescriptionId, pharmacyId, status: 'requested', createdAt: new Date() });
        renderPrescriptions();
        renderPrescriptionOrders();
        setFeedback('prescription-feedback', `Solicitud enviada a ${pharmacy.name}.`);
    } catch (error) {
        console.error(error);
        const message = error?.code === 'permission-denied'
            ? 'No se pudo solicitar la receta. Comprueba que siga vigente y que la farmacia esté activa. Si el problema continúa, avisa al administrador.'
            : 'No se pudo solicitar la receta. Revisa tu conexión e inténtalo de nuevo.';
        setFeedback('prescription-feedback', message, true);
        button.disabled = false;
    }
}

function renderMedicalHistory() {
    const container = $('medical-history-list');
    container.replaceChildren();
    if (!state.records.length) {
        container.append(textElement('p', 'Todavía no hay atenciones registradas en tu historial.', 'empty-state'));
        return;
    }
    [...state.records].sort((a, b) => {
        const left = a.createdAt?.seconds || 0;
        const right = b.createdAt?.seconds || 0;
        return right - left;
    }).forEach((record) => {
        const card = makeRecordCard(
            record.title || `Atención del ${displayDate(record.date)}`,
            '',
            [
                `${displayDate(record.date)} · ${record.doctorName || 'Profesional de salud'} · ${record.centerName || 'Centro de salud'}`,
                record.diagnosis ? `Diagnóstico: ${record.diagnosis}` : '',
                record.notes ? `Notas: ${record.notes}` : '',
                record.treatmentPlan ? `Plan indicado: ${record.treatmentPlan}` : ''
            ]
        );
        container.append(card);
    });
}

function appendMedibotMessage(text, kind) {
    const message = textElement('div', text, `medibot-message ${kind === 'question' ? 'medibot-question' : 'medibot-reply'}`);
    $('medibot-messages').append(message);
    $('medibot-messages').scrollTop = $('medibot-messages').scrollHeight;
    return message;
}

async function askMedibot(event) {
    event.preventDefault();
    const input = $('medibot-input');
    const send = $('medibot-send');
    const question = input.value.trim();
    if (!question) return;

    appendMedibotMessage(question, 'question');
    const pending = appendMedibotMessage('MediBot está preparando una respuesta…', 'reply');
    input.value = '';
    input.disabled = true;
    send.disabled = true;
    $('medibot-status').textContent = 'Consultando…';
    try {
        const response = await fetch('/api/medibot', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pregunta: question })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'No pude conectar con MediBot. Inténtalo más tarde.');
        pending.textContent = payload.respuesta || 'No recibí una respuesta válida.';
        $('medibot-status').textContent = 'Listo';
    } catch (error) {
        pending.textContent = error.message || 'No pude preparar una respuesta ahora.';
        $('medibot-status').textContent = 'No se pudo completar la consulta.';
    } finally {
        input.disabled = false;
        send.disabled = false;
        input.focus();
    }
}

async function loadPatientData(user) {
    state.user = user;
    const profileSnapshot = await getDoc(doc(db, 'users', user.uid));
    state.profile = profileSnapshot.exists() ? profileSnapshot.data() : {};
    if (state.profile.role !== 'patient' || state.profile.active === false) {
        window.location.replace('/');
        return;
    }

    const ownQuery = (name) => getDocs(query(collection(db, name), where('patientId', '==', user.uid)));
    const [locationsSnapshot, doctorsSnapshot, appointmentsSnapshot, prescriptionsSnapshot, ordersSnapshot, recordsSnapshot] = await Promise.all([
        getDocs(collection(db, 'locations')),
        getDocs(collection(db, 'doctorDirectory')),
        ownQuery('appointments'),
        ownQuery('prescriptions'),
        ownQuery('prescriptionOrders'),
        ownQuery('medicalRecords')
    ]);

    state.locations = locationsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    state.doctors = doctorsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    state.appointments = appointmentsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    state.prescriptions = prescriptionsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    state.orders = ordersSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    state.records = recordsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

    populateCenters();
    populatePharmacies();
    renderAppointments();
    renderPrescriptions();
    renderPrescriptionOrders();
    renderMedicalHistory();
}

function bindEvents() {
    document.querySelectorAll('[data-patient-tab]').forEach((tab) => tab.addEventListener('click', (event) => {
        event.preventDefault();
        activateTab(tab.dataset.patientTab);
    }));
    $('appointment-center').addEventListener('change', handleCenterChange);
    $('appointment-specialty').addEventListener('change', handleSpecialtyChange);
    $('appointment-doctor').addEventListener('change', () => {
        resetAppointmentDateAndTime();
        const doctor = state.doctors.find((item) => item.id === $('appointment-doctor').value);
        const date = $('appointment-date');
        date.min = localDateString();
        date.max = localDateString(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
        date.disabled = !doctor;
    });
    $('appointment-date').addEventListener('change', refreshTimeSlots);
    $('appointment-time').addEventListener('change', () => {
        $('appointment-submit').disabled = !$('appointment-time').value;
    });
    $('appointment-form').addEventListener('submit', bookAppointment);
    $('prescription-pharmacy').addEventListener('change', () => {
        state.pharmacyMapTools?.clearRoute();
        renderPrescriptions();
    });
    $('prescriptions-list').addEventListener('click', requestPrescription);
    $('medibot-form').addEventListener('submit', askMedibot);
    window.addEventListener('hashchange', () => activateTab(location.hash.slice(1)));
}

bindEvents();
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace('/');
        return;
    }
    try {
        await loadPatientData(user);
        const initialTab = location.hash.slice(1);
        if (tabTitles[initialTab]) activateTab(initialTab);
    } catch (error) {
        console.error(error);
        const message = 'No se pudieron cargar tus datos. Comprueba tu conexión e inténtalo de nuevo.';
        ['appointments-list', 'prescriptions-list', 'prescription-orders-list', 'medical-history-list'].forEach((id) => {
            $(id).replaceChildren(textElement('p', message, 'empty-state'));
        });
    }
});
