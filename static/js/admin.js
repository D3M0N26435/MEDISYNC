import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, deleteUser } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = JSON.parse(document.getElementById('firebase-config').textContent);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const staffCollection = collection(db, 'users');
const locationsCollection = collection(db, 'locations');
const staffById = new Map();
const locationsById = new Map();
let activeLocationFilter = 'all';
let selectedLocationId = '';
let adminMap;
let markersLayer;

const $ = (id) => document.getElementById(id);
const feedback = $('admin-feedback');

function showFeedback(message, type = 'success') {
    feedback.textContent = message;
    feedback.className = `admin-feedback ${type} visible`;
    window.clearTimeout(showFeedback.timeout);
    showFeedback.timeout = window.setTimeout(() => feedback.classList.remove('visible'), 5000);
}

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function roleName(role) {
    return ({ admin: 'Administrador', doctor: 'Médico', pharmacist: 'Farmacéutico' })[role] || role || 'Sin rol';
}

function dateLabel(value) {
    if (!value) return '';
    const parts = value.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}

function currentLeave(user) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return (user.vacationPeriods || []).find((period) => period.start && period.end && period.start <= today && period.end >= today);
}

function getStaffLocation(user) {
    return locationsById.get(user.locationId) || null;
}

function staffAvailability(user) {
    if (user.active === false) return '<span class="availability-pill inactive">Inactivo</span>';
    const leave = currentLeave(user);
    if (leave) return `<span class="availability-pill away">Vacaciones hasta ${escapeHtml(dateLabel(leave.end))}</span>`;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const nextLeave = (user.vacationPeriods || []).filter((period) => period.start && period.start > today).sort((a, b) => a.start.localeCompare(b.start))[0];
    return nextLeave
        ? `<span class="availability-pill available">Disponible <small>· vacaciones ${escapeHtml(dateLabel(nextLeave.start))}</small></span>`
        : '<span class="availability-pill available">Disponible</span>';
}

function renderStaff() {
    const query = $('staff-search').value.trim().toLowerCase();
    const roleFilter = $('staff-role-filter').value;
    const rows = [...staffById.entries()].filter(([, user]) => ['admin', 'doctor', 'pharmacist'].includes(user.role));
    const filtered = rows.filter(([uid, user]) => {
        const text = `${uid} ${user.name || ''} ${user.email || ''} ${user.role || ''}`.toLowerCase();
        return (!query || text.includes(query)) && (!roleFilter || user.role === roleFilter);
    });
    const tbody = $('staff-table-body');
    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${rows.length ? 'No hay coincidencias con esos filtros.' : 'Todavía no hay perfiles de personal.'}</td></tr>`;
        return;
    }
    tbody.innerHTML = filtered.map(([uid, user]) => {
        const location = getStaffLocation(user);
        const disabled = user.active === false;
        return `<tr>
            <td><strong>${escapeHtml(user.name || 'Sin nombre')}</strong><small>${escapeHtml(user.email || uid)}</small></td>
            <td><span class="role-pill">${escapeHtml(roleName(user.role))}</span></td>
            <td>${location ? `<span class="location-type-label">${location.type === 'pharmacy' ? 'Farmacia' : 'Centro de salud'}</span><strong>${escapeHtml(location.name)}</strong>` : '<span class="muted">Sin asignar</span>'}</td>
            <td>${staffAvailability(user)}</td>
            <td><span class="status-pill ${disabled ? 'disabled' : 'enabled'}">${disabled ? 'Inactivo' : 'Activo'}</span></td>
            <td><div class="row-actions"><button type="button" class="table-action" data-staff-action="edit" data-id="${escapeHtml(uid)}">Editar</button>${disabled ? `<button type="button" class="table-action restore" data-staff-action="restore" data-id="${escapeHtml(uid)}">Reactivar</button>` : `<button type="button" class="table-action danger" data-staff-action="deactivate" data-id="${escapeHtml(uid)}">Dar de baja</button>`}<button type="button" class="table-action" data-staff-action="reset" data-id="${escapeHtml(uid)}">Restablecer acceso</button></div></td>
        </tr>`;
    }).join('');
}

function addVacationRow(period = {}) {
    const row = document.createElement('div');
    row.className = 'vacation-row';
    row.innerHTML = `<label>Desde<input type="date" data-vacation-start value="${escapeHtml(period.start || '')}"></label><label>Hasta<input type="date" data-vacation-end value="${escapeHtml(period.end || '')}"></label><button class="icon-button remove-vacation" type="button" aria-label="Quitar periodo">−</button>`;
    $('vacation-periods').appendChild(row);
}

function readVacationPeriods() {
    return [...document.querySelectorAll('.vacation-row')].map((row) => ({
        start: row.querySelector('[data-vacation-start]').value,
        end: row.querySelector('[data-vacation-end]').value
    })).filter((period) => period.start || period.end);
}

function openStaffForm(uid = '') {
    $('staff-form').reset();
    $('vacation-periods').replaceChildren();
    $('staff-uid').value = uid;
    const editing = Boolean(uid);
    const user = editing ? staffById.get(uid) : null;
    if (editing && !user) return;
    $('staff-form-eyebrow').textContent = editing ? 'EDITAR PERFIL' : 'NUEVO PERFIL';
    $('staff-form-title').textContent = editing ? 'Editar personal' : 'Añadir personal';
    $('save-staff-button').textContent = editing ? 'Guardar cambios' : 'Crear perfil';
    $('staff-name').value = user?.name || '';
    $('staff-email').value = user?.email || '';
    $('staff-email').readOnly = editing;
    $('staff-role').value = user?.role || 'doctor';
    $('staff-role').disabled = editing && uid === auth.currentUser?.uid;
    $('staff-location').value = user?.locationId || '';
    $('staff-password-group').hidden = editing;
    $('staff-password').required = !editing;
    (user?.vacationPeriods || []).forEach(addVacationRow);
    if (!user?.vacationPeriods?.length) addVacationRow();
    $('staff-editor-card').hidden = false;
    $('staff-editor-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveStaff(event) {
    event.preventDefault();
    const uid = $('staff-uid').value;
    const email = $('staff-email').value.trim().toLowerCase();
    const password = $('staff-password').value;
    const vacationPeriods = readVacationPeriods();
    if (vacationPeriods.some((period) => !period.start || !period.end || period.start > period.end)) {
        showFeedback('Revisa los periodos: cada fecha de inicio debe tener una fecha final igual o posterior.', 'error');
        return;
    }
    const profile = {
        name: $('staff-name').value.trim(),
        email,
        role: uid === auth.currentUser?.uid ? staffById.get(uid).role : $('staff-role').value,
        locationId: $('staff-location').value || '',
        vacationPeriods,
        updatedAt: serverTimestamp()
    };
    const saveButton = $('save-staff-button');
    saveButton.disabled = true;
    try {
        if (uid) {
            await updateDoc(doc(db, 'users', uid), profile);
            showFeedback('Perfil actualizado.');
        } else {
            if (password.length < 6) throw new Error('La contraseña inicial debe tener al menos 6 caracteres.');
            const secondaryApp = initializeApp(firebaseConfig, `staff-creation-${Date.now()}`);
            try {
                const secondaryAuth = getAuth(secondaryApp);
                const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                try {
                    await setDoc(doc(db, 'users', credential.user.uid), { ...profile, active: true, createdAt: serverTimestamp() });
                } catch (error) {
                    await deleteUser(credential.user).catch(() => {});
                    throw error;
                }
                await signOut(secondaryAuth);
            } finally {
                await deleteApp(secondaryApp);
            }
            showFeedback('Cuenta y perfil creados. La persona ya puede iniciar sesión.');
        }
        $('staff-editor-card').hidden = true;
        await loadData();
    } catch (error) {
        console.error(error);
        showFeedback(friendlyError(error, 'No se pudo guardar el perfil.'), 'error');
    } finally {
        saveButton.disabled = false;
    }
}

function friendlyError(error, fallback) {
    if (error?.message?.startsWith('La contraseña')) return error.message;
    const code = error?.code || '';
    if (code.includes('email-already-in-use')) return 'Ya existe una cuenta con ese correo.';
    if (code.includes('permission-denied')) return 'Firebase rechazó la operación. Comprueba que las reglas de Firestore estén desplegadas y que tu cuenta tenga rol admin.';
    if (code.includes('weak-password')) return 'La contraseña debe tener al menos 6 caracteres.';
    if (code.includes('invalid-email')) return 'El correo electrónico no tiene un formato válido.';
    if (code.includes('network-request-failed')) return 'No se pudo conectar con Firebase. Revisa tu conexión.';
    return fallback;
}

async function handleStaffAction(event) {
    const button = event.target.closest('[data-staff-action]');
    if (!button) return;
    const { id, staffAction } = button.dataset;
    const user = staffById.get(id);
    if (!user) return;
    try {
        if (staffAction === 'edit') return openStaffForm(id);
        if (staffAction === 'reset') {
            if (!user.email) throw new Error('Este perfil no tiene un correo registrado.');
            await sendPasswordResetEmail(auth, user.email);
            showFeedback(`Se envió un enlace para restablecer el acceso a ${user.email}.`);
            return;
        }
        if (staffAction === 'deactivate' || staffAction === 'restore') {
            if (id === auth.currentUser?.uid && staffAction === 'deactivate') {
                showFeedback('No puedes dar de baja tu propia cuenta de administración.', 'error');
                return;
            }
            const active = staffAction === 'restore';
            const actionText = active ? 'reactivar' : 'dar de baja';
            if (!window.confirm(`¿Quieres ${actionText} a ${user.name || user.email}?`)) return;
            await updateDoc(doc(db, 'users', id), { active, updatedAt: serverTimestamp() });
            showFeedback(active ? 'Perfil reactivado.' : 'Personal dado de baja. El acceso quedará bloqueado al siguiente inicio de sesión.');
            await loadData();
        }
    } catch (error) {
        console.error(error);
        showFeedback(friendlyError(error, 'No se pudo completar la acción.'), 'error');
    }
}

function syncLocationSelect() {
    const select = $('staff-location');
    const selected = select.value;
    select.innerHTML = '<option value="">Sin asignar</option>' + [...locationsById.entries()].map(([id, location]) => `<option value="${escapeHtml(id)}">${escapeHtml(location.name)} · ${location.type === 'pharmacy' ? 'Farmacia' : 'Centro de salud'}</option>`).join('');
    select.value = locationsById.has(selected) ? selected : '';
}

function initMap() {
    if (!window.L || adminMap) return;
    adminMap = L.map('admin-map').setView([-17.9647, -67.106], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(adminMap);
    markersLayer = L.layerGroup().addTo(adminMap);
    adminMap.on('click', (event) => {
        if ($('location-editor-card').hidden) openLocationForm();
        $('location-lat').value = event.latlng.lat.toFixed(6);
        $('location-lng').value = event.latlng.lng.toFixed(6);
        $('location-editor-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

function selectLocation(id, pan = true) {
    const location = locationsById.get(id);
    if (!location) return;
    selectedLocationId = id;
    $('selected-location-title').textContent = location.name;
    $('selected-location-subtitle').textContent = `${location.type === 'pharmacy' ? 'Farmacia' : 'Centro de salud'} · ${location.address}`;
    if (adminMap && pan) adminMap.setView([Number(location.lat), Number(location.lng)], 15);
    renderLocationTeam();
    renderLocations();
}

function renderLocationTeam() {
    const location = locationsById.get(selectedLocationId);
    const team = [...staffById.entries()].filter(([, user]) => user.locationId === selectedLocationId && ['admin', 'doctor', 'pharmacist'].includes(user.role));
    if (!location) {
        $('location-team').innerHTML = '<p class="empty-state">No hay una sede seleccionada.</p>';
        return;
    }
    if (!team.length) {
        $('location-team').innerHTML = '<p class="empty-state">Todavía no hay personal asignado a esta sede.</p>';
        return;
    }
    $('location-team').innerHTML = team.map(([, user]) => `<div class="team-member"><span class="team-avatar">${escapeHtml((user.name || '?').trim().slice(0, 1).toUpperCase())}</span><div class="team-member-copy"><strong>${escapeHtml(user.name || 'Sin nombre')}</strong><small>${escapeHtml(roleName(user.role))} · ${escapeHtml(user.email || '')}</small></div>${staffAvailability(user)}</div>`).join('');
}

function renderLocations() {
    const locations = [...locationsById.entries()].filter(([, location]) => activeLocationFilter === 'all' || location.type === activeLocationFilter);
    const container = $('locations-list');
    if (!locations.length) {
        container.innerHTML = '<p class="empty-state">No hay sedes registradas en esta categoría. Añade una nueva sede.</p>';
    } else {
        container.innerHTML = locations.map(([id, location]) => {
            const people = [...staffById.values()].filter((user) => user.locationId === id && ['admin', 'doctor', 'pharmacist'].includes(user.role));
            const activePeople = people.filter((user) => user.active !== false).length;
            return `<article class="location-row ${id === selectedLocationId ? 'selected' : ''}" data-location-select="${escapeHtml(id)}">
                <button type="button" class="location-summary" data-location-open="${escapeHtml(id)}"><span class="location-icon">${location.type === 'pharmacy' ? '✚' : '⌂'}</span><span class="location-copy"><strong>${escapeHtml(location.name)}</strong><small>${escapeHtml(location.address)}</small></span><span class="location-count">${activePeople} ${activePeople === 1 ? 'persona' : 'personas'}</span></button>
                <div class="row-actions"><button class="table-action" type="button" data-location-edit="${escapeHtml(id)}">Editar</button><button class="table-action danger" type="button" data-location-delete="${escapeHtml(id)}" ${people.length ? 'disabled title="Reasigna al personal antes de eliminar esta sede"' : ''}>Eliminar</button></div>
            </article>`;
        }).join('');
    }
    if (adminMap && markersLayer) {
        markersLayer.clearLayers();
        locationsById.forEach((location, id) => {
            const lat = Number(location.lat), lng = Number(location.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            const marker = L.marker([lat, lng]).addTo(markersLayer);
            marker.bindPopup(`<strong>${escapeHtml(location.name)}</strong><br>${escapeHtml(location.address)}<br>${location.type === 'pharmacy' ? 'Farmacia' : 'Centro de salud'}`);
            marker.on('click', () => selectLocation(id, false));
        });
    }
}

function openLocationForm(id = '') {
    $('location-form').reset();
    $('location-id').value = id;
    const location = id ? locationsById.get(id) : null;
    $('location-form-eyebrow').textContent = location ? 'EDITAR SEDE' : 'NUEVA SEDE';
    $('location-form-title').textContent = location ? 'Editar sede' : 'Añadir centro o farmacia';
    if (location) {
        $('location-name').value = location.name || '';
        $('location-type').value = location.type || 'health_center';
        $('location-address').value = location.address || '';
        $('location-lat').value = location.lat;
        $('location-lng').value = location.lng;
    }
    $('location-editor-card').hidden = false;
    $('location-editor-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveLocation(event) {
    event.preventDefault();
    const id = $('location-id').value;
    const lat = Number($('location-lat').value);
    const lng = Number($('location-lng').value);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        showFeedback('Las coordenadas no son válidas. Selecciona el punto en el mapa.', 'error');
        return;
    }
    const location = { name: $('location-name').value.trim(), type: $('location-type').value, address: $('location-address').value.trim(), lat, lng, updatedAt: serverTimestamp() };
    try {
        if (id) {
            await updateDoc(doc(db, 'locations', id), location);
            selectedLocationId = id;
            showFeedback('Sede actualizada.');
        } else {
            const created = await addDoc(locationsCollection, { ...location, createdAt: serverTimestamp() });
            selectedLocationId = created.id;
            showFeedback('Sede creada y ubicada en el mapa.');
        }
        $('location-editor-card').hidden = true;
        await loadData();
        if (selectedLocationId) selectLocation(selectedLocationId);
    } catch (error) {
        console.error(error);
        showFeedback(friendlyError(error, 'No se pudo guardar la sede.'), 'error');
    }
}

async function handleLocationClick(event) {
    const open = event.target.closest('[data-location-open]');
    const edit = event.target.closest('[data-location-edit]');
    const remove = event.target.closest('[data-location-delete]');
    if (open) return selectLocation(open.dataset.locationOpen);
    if (edit) return openLocationForm(edit.dataset.locationEdit);
    if (remove) {
        const id = remove.dataset.locationDelete;
        const location = locationsById.get(id);
        const people = [...staffById.values()].filter((user) => user.locationId === id);
        if (people.length) return showFeedback('Reasigna a todo el personal antes de eliminar esta sede.', 'error');
        if (!window.confirm(`¿Eliminar la sede ${location?.name || ''}?`)) return;
        try {
            await deleteDoc(doc(db, 'locations', id));
            locationsById.delete(id);
            if (selectedLocationId === id) selectedLocationId = '';
            syncLocationSelect();
            renderLocations();
            renderLocationTeam();
            showFeedback('Sede eliminada.');
        } catch (error) {
            console.error(error);
            showFeedback(friendlyError(error, 'No se pudo eliminar la sede.'), 'error');
        }
    }
}

async function loadData() {
    const [usersSnapshot, locationsSnapshot] = await Promise.all([getDocs(staffCollection), getDocs(locationsCollection)]);
    staffById.clear();
    locationsById.clear();
    usersSnapshot.forEach((item) => staffById.set(item.id, item.data()));
    locationsSnapshot.forEach((item) => locationsById.set(item.id, item.data()));
    syncLocationSelect();
    renderStaff();
    renderLocations();
    renderLocationTeam();
}

function initTabs() {
    document.querySelectorAll('[data-admin-tab]').forEach((tab) => tab.addEventListener('click', (event) => {
        event.preventDefault();
        const name = tab.dataset.adminTab;
        document.querySelectorAll('[data-admin-tab]').forEach((item) => {
            const selected = item === tab;
            item.classList.toggle('active', selected);
            item.setAttribute('aria-selected', String(selected));
        });
        document.querySelectorAll('.admin-tab').forEach((panel) => {
            const selected = panel.id === `tab-${name}`;
            panel.hidden = !selected;
            panel.classList.toggle('active', selected);
        });
        if (name === 'sedes') window.setTimeout(() => adminMap?.invalidateSize(), 80);
    }));
}

function bindEvents() {
    initTabs();
    initMap();
    $('new-staff-button').addEventListener('click', () => openStaffForm());
    $('staff-form').addEventListener('submit', saveStaff);
    $('staff-table-body').addEventListener('click', handleStaffAction);
    $('staff-search').addEventListener('input', renderStaff);
    $('staff-role-filter').addEventListener('change', renderStaff);
    $('add-vacation-button').addEventListener('click', () => addVacationRow());
    $('vacation-periods').addEventListener('click', (event) => event.target.closest('.remove-vacation')?.closest('.vacation-row')?.remove());
    $('cancel-staff-button').addEventListener('click', () => $('staff-editor-card').hidden = true);
    $('cancel-staff-button-bottom').addEventListener('click', () => $('staff-editor-card').hidden = true);
    $('new-location-button').addEventListener('click', () => openLocationForm());
    $('location-form').addEventListener('submit', saveLocation);
    $('locations-list').addEventListener('click', handleLocationClick);
    $('cancel-location-button').addEventListener('click', () => $('location-editor-card').hidden = true);
    $('cancel-location-button-bottom').addEventListener('click', () => $('location-editor-card').hidden = true);
    document.querySelectorAll('[data-location-filter]').forEach((button) => button.addEventListener('click', () => {
        activeLocationFilter = button.dataset.locationFilter;
        document.querySelectorAll('[data-location-filter]').forEach((item) => item.classList.toggle('active', item === button));
        renderLocations();
    }));
}

bindEvents();
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace('/');
        return;
    }
    try {
        const profile = await getDoc(doc(db, 'users', user.uid));
        if (!profile.exists() || profile.data().role !== 'admin' || profile.data().active === false) {
            showFeedback('Esta cuenta no tiene permisos de administración.', 'error');
            await signOut(auth);
            window.setTimeout(() => window.location.replace('/'), 1200);
            return;
        }
        await loadData();
        showFeedback(`Sesión de administración iniciada como ${profile.data().name || user.email}.`);
    } catch (error) {
        console.error(error);
        showFeedback(friendlyError(error, 'No se pudieron cargar los datos de Firebase.'), 'error');
    }
});
