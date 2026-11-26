import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from './firebase.js';

export async function loadPatientCard(patientId) {
    if (!patientId) return null;
    const snapshot = await getDoc(doc(db, 'patientCards', patientId));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function loadEmergencyCard(token) {
    const cleaned = String(token || '').trim();
    if (cleaned.length < 20) return null;
    const snapshot = await getDoc(doc(db, 'emergencyCards', cleaned));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

function valueOrDash(value) {
    const text = String(value ?? '').trim();
    return text || 'No registrado';
}

function detailRow(label, value) {
    const row = document.createElement('div');
    row.className = 'patient-card-row';
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = valueOrDash(value);
    row.append(term, description);
    return row;
}

export function renderPatientCard(container, card, options = {}) {
    if (!container) return;
    container.replaceChildren();

    if (!card) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = 'Este paciente todavía no tiene una tarjeta de asegurado registrada.';
        container.append(empty);
        return;
    }

    const article = document.createElement('article');
    article.className = 'patient-card';

    const heading = document.createElement('div');
    heading.className = 'patient-card-heading';
    const title = document.createElement('h3');
    title.textContent = card.name || 'Asegurado';
    const subtitle = document.createElement('p');
    subtitle.textContent = options.subtitle || (card.carnet ? `Carnet ${card.carnet}` : 'Carnet no registrado');
    heading.append(title, subtitle);

    const allergyBanner = document.createElement('p');
    allergyBanner.className = 'patient-card-alert';
    allergyBanner.textContent = card.allergies
        ? `Alergias: ${card.allergies}`
        : 'Alergias: no registradas';

    const list = document.createElement('dl');
    list.className = 'patient-card-grid';
    list.append(
        detailRow('Tipo de sangre', card.bloodType),
        detailRow('Enfermedades crónicas', card.chronicConditions),
        detailRow('Estado', card.active === false ? 'Inactiva' : 'Vigente')
    );

    article.append(heading, allergyBanner, list);
    if (options.footer) {
        const footer = document.createElement('p');
        footer.className = 'patient-card-footer';
        footer.textContent = options.footer;
        article.append(footer);
    }
    container.append(article);
}
