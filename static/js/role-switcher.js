import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { auth, db } from './firebase.js';
import { ROLE_ENDPOINTS, currentRoleFromPath, primaryRole, roleLabel, userRoles } from './roles.js';

function renderSwitcher(container, profile) {
    const roles = userRoles(profile);
    const current = currentRoleFromPath() || primaryRole(profile);
    container.replaceChildren();

    const badge = document.createElement('span');
    badge.className = 'role-badge';
    badge.textContent = roleLabel(current || primaryRole(profile));
    container.append(badge);

    const targets = roles.filter((role) => role !== current && ROLE_ENDPOINTS[role]);
    if (!targets.length) return;

    const menu = document.createElement('details');
    menu.className = 'role-menu';
    const summary = document.createElement('summary');
    summary.textContent = 'Cambiar rol';
    summary.setAttribute('aria-label', 'Cambiar de rol');
    const links = document.createElement('div');
    links.className = 'role-menu-links';
    targets.forEach((role) => {
        const link = document.createElement('a');
        link.href = ROLE_ENDPOINTS[role];
        link.textContent = roleLabel(role);
        links.append(link);
    });
    menu.append(summary, links);
    container.append(menu);
}

onAuthStateChanged(auth, (user) => {
    if (!user) return;
    const containers = document.querySelectorAll('[data-role-switcher]');
    if (!containers.length) return;
    onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
        const profile = snapshot.exists() ? snapshot.data() : {};
        containers.forEach((container) => renderSwitcher(container, profile));
    });
});
