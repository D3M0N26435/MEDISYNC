import { startEmergencySharing } from './emergency-alerts.js';

(function init() {
    const dialog = document.getElementById('sos-dialog');
    if (!dialog) return;
    const openBtn = document.getElementById('open-sos');
    const selfBtn = document.getElementById('sos-self');
    const otherBtn = document.getElementById('sos-other');
    const otherField = document.getElementById('sos-other-field');
    const otherName = document.getElementById('sos-other-name');
    const sendBtn = document.getElementById('sos-send');
    const cancelBtn = document.getElementById('sos-cancel');
    const closeBtn = document.getElementById('sos-close');
    const status = document.getElementById('sos-status');

    let target = 'self';

    if (openBtn) {
        openBtn.addEventListener('click', () => dialog.showModal());
    }

    function setTarget(value) {
        target = value;
        selfBtn.classList.toggle('active', value === 'self');
        otherBtn.classList.toggle('active', value === 'other');
        otherField.hidden = value !== 'other';
        if (value === 'other') otherName.focus();
    }

    selfBtn.addEventListener('click', () => setTarget('self'));
    otherBtn.addEventListener('click', () => setTarget('other'));

    closeBtn.addEventListener('click', () => { dialog.close(); status.textContent = ''; });
    cancelBtn.addEventListener('click', () => { dialog.close(); status.textContent = ''; });

    sendBtn.addEventListener('click', async () => {
        sendBtn.disabled = true;
        status.textContent = 'Obteniendo ubicación…';
        try {
            const name = target === 'other' ? String(otherName.value || '').trim() || 'Persona sin seguro' : 'Yo';
            await startEmergencySharing(null, name, (message) => { status.textContent = message; });
            status.textContent = 'Ubicación enviada. El equipo de despacho ya puede verla.';
            setTimeout(() => dialog.close(), 1500);
        } catch (error) {
            console.error(error);
            status.textContent = error.message || 'No se pudo enviar la ubicación. Revisa los permisos e inténtalo de nuevo.';
        } finally {
            sendBtn.disabled = false;
        }
    });

    dialog.addEventListener('close', () => {
        setTarget('self');
        otherName.value = '';
        status.textContent = '';
    });
})();
