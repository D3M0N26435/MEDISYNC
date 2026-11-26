export const ROLE_LABELS = {
    admin: 'Administrador',
    doctor: 'Médico',
    pharmacist: 'Farmacéutico',
    patient: 'Paciente',
    dispatcher: 'Despacho'
};

export const ROLE_ENDPOINTS = {
    admin: '/admin',
    doctor: '/doctor',
    pharmacist: '/pharmacist',
    patient: '/patient',
    dispatcher: '/dispatcher'
};

export function userRoles(profile) {
    if (!profile) return [];
    if (Array.isArray(profile.roles)) return profile.roles.filter((role) => ROLE_ENDPOINTS[role]);
    if (profile.role && ROLE_ENDPOINTS[profile.role]) return [profile.role];
    return [];
}

export function hasRole(profile, role) {
    return userRoles(profile).includes(role);
}

export function primaryRole(profile) {
    const roles = userRoles(profile);
    if (roles.includes(profile?.role)) return profile.role;
    return roles[0] || '';
}

export function roleLabel(role) {
    return ROLE_LABELS[role] || role || 'Sin rol';
}

export function currentRoleFromPath() {
    if (location.pathname.startsWith('/admin')) return 'admin';
    if (location.pathname.startsWith('/doctor')) return 'doctor';
    if (location.pathname.startsWith('/pharmacist')) return 'pharmacist';
    if (location.pathname.startsWith('/dispatcher')) return 'dispatcher';
    if (location.pathname.startsWith('/patient') || location.pathname.startsWith('/chat')) return 'patient';
    return '';
}
